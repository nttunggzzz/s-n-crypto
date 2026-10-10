import { describe, expect, it, vi } from 'vitest';
import {
  countdown,
  createPager,
  createTickerStore,
  futuresTradeBlock,
  resolveFuturesSymbol,
  saveTextFile,
  spotSymbolFor,
  spotTradeBlock,
  type Ticker,
} from './index.ts';
import type { RealtimeClient } from './realtimeClient.ts';

/** A realtime client whose channels the test pushes by hand. */
function fakeRealtime() {
  const subs = new Map<string, (d: unknown) => void>();
  const rt = {
    subscribe: (channel: string, cb: (d: unknown) => void) => {
      subs.set(channel, cb);
      return () => subs.delete(channel);
    },
    onStatus: () => () => {},
    onError: () => () => {},
    reconnect: () => {},
    close: () => {},
  } as unknown as RealtimeClient;
  return { rt, push: (channel: string, data: unknown) => subs.get(channel)?.(data), subs };
}

const tk = (symbol: string, lastPrice: string, updatedAt: string | null = '2026-10-10T10:00:00.000Z'): Ticker => ({
  symbol, lastPrice, openPrice: null, highPrice: null, lowPrice: null, priceChange: null, priceChangePercent: null,
  volume: null, quoteVolume: null, bestBid: null, bestAsk: null, status: 'LIVE', updatedAt,
});

describe('createTickerStore', () => {
  it('one `tickers` subscription; a pair change notifies only that pair (+ "any" listeners)', () => {
    const { rt, push, subs } = fakeRealtime();
    const store = createTickerStore(rt);
    expect([...subs.keys()]).toEqual(['tickers']);
    const btc = vi.fn();
    const eth = vi.fn();
    const any = vi.fn();
    store.subscribe(btc, 'BTCUSDT');
    store.subscribe(eth, 'ETHUSDT');
    store.subscribe(any);

    push('tickers', { items: [tk('BTCUSDT', '100'), tk('ETHUSDT', '10')] });
    const first = store.all();
    expect(first).toHaveLength(2);
    expect(store.all()).toBe(first); // stable snapshot until the next change

    push('tickers', { items: [tk('BTCUSDT', '101')] });
    expect(store.get('BTCUSDT')?.lastPrice).toBe('101');
    expect(btc).toHaveBeenCalledTimes(2);
    expect(eth).toHaveBeenCalledTimes(1);
    expect(any).toHaveBeenCalledTimes(2);
    expect(store.all()).not.toBe(first);

    store.close();
    expect(subs.size).toBe(0);
  });

  it('REST seed fills gaps but never replaces a newer realtime value', () => {
    const { rt, push, subs } = fakeRealtime();
    const store = createTickerStore(rt, 'futures');
    expect([...subs.keys()]).toEqual(['futures:tickers']);
    push('futures:tickers', { items: [tk('BTCUSDT', '101', '2026-10-10T10:00:05.000Z')] });
    store.seed([tk('BTCUSDT', '99', '2026-10-10T10:00:00.000Z'), tk('ETHUSDT', '10')] as never);
    expect(store.get('BTCUSDT')?.lastPrice).toBe('101');
    expect(store.get('ETHUSDT')?.lastPrice).toBe('10');
  });
});

describe('spot ↔ futures symbols', () => {
  const contracts = [
    { symbol: 'BTCUSDT', underlyingAsset: 'BTC' },
    { symbol: '1000PEPEUSDT', underlyingAsset: 'PEPE' },
  ];
  const spot = [
    { symbol: 'BTCUSDT', baseAsset: 'BTC' },
    { symbol: 'PEPEUSDT', baseAsset: 'PEPE' },
    { symbol: 'TRXUSDT', baseAsset: 'TRX' },
  ];
  it('maps by coin, keeps contract symbols, null when the coin has no contract', () => {
    expect(resolveFuturesSymbol('PEPEUSDT', contracts, spot)).toBe('1000PEPEUSDT');
    expect(resolveFuturesSymbol('1000pepeusdt', contracts, spot)).toBe('1000PEPEUSDT');
    expect(resolveFuturesSymbol('BTCUSDT', contracts, spot)).toBe('BTCUSDT');
    expect(resolveFuturesSymbol('TRXUSDT', contracts, spot)).toBeNull();
    expect(resolveFuturesSymbol('NOPE', contracts, spot)).toBeNull();
    expect(spotSymbolFor('1000PEPEUSDT', contracts, spot)).toBe('PEPEUSDT');
  });
});

describe('countdown', () => {
  const now = Date.parse('2026-10-10T11:55:30.000Z');
  it('HH:MM:SS to the target, zero after it, null without one', () => {
    expect(countdown('2026-10-10T16:00:00.000Z', now)).toBe('04:04:30');
    expect(countdown('2026-10-10T11:55:30.900Z', now)).toBe('00:00:00');
    expect(countdown('2026-10-10T11:00:00.000Z', now)).toBe('00:00:00');
    expect(countdown(null, now)).toBeNull();
    expect(countdown('not a date', now)).toBeNull();
  });
});

describe('trade blocks', () => {
  const open = { tradingHalted: false, disabledSymbols: [], updatedAt: '2026-10-10T00:00:00.000Z' };
  it('halt beats a disabled pair beats a stale price', () => {
    expect(spotTradeBlock('BTCUSDT', open, { status: 'LIVE' })).toBeNull();
    expect(spotTradeBlock('BTCUSDT', open, { status: 'STALE' })).toBe('PRICE_STALE');
    expect(spotTradeBlock('BTCUSDT', open, null)).toBe('PRICE_STALE');
    expect(spotTradeBlock('BTCUSDT', { ...open, disabledSymbols: ['BTCUSDT'] }, { status: 'LIVE' })).toBe('PAIR_DISABLED');
    expect(spotTradeBlock('BTCUSDT', { ...open, tradingHalted: true, disabledSymbols: ['BTCUSDT'] }, null)).toBe('HALTED');
    expect(futuresTradeBlock(open, { enabled: true }, { status: 'LIVE' })).toBeNull();
    expect(futuresTradeBlock(open, { enabled: true }, { status: 'STALE' })).toBe('PRICE_STALE');
    expect(futuresTradeBlock(open, { enabled: false }, { status: 'LIVE' })).toBe('PAIR_DISABLED');
  });
});

describe('createPager', () => {
  it('pages through nextCursor, ignores double clicks, reset drops a page still loading', async () => {
    const pages: Record<string, { items: number[]; nextCursor: string | null }> = {
      start: { items: [1, 2], nextCursor: 'c2' },
      c2: { items: [3], nextCursor: null },
    };
    const fetchPage = vi.fn(async (cursor: string | undefined) => pages[cursor ?? 'start']!);
    const pager = createPager(fetchPage);
    await Promise.all([pager.loadMore(), pager.loadMore()]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(pager.state()).toMatchObject({ items: [1, 2], hasMore: true, loading: false });
    await pager.loadMore();
    expect(pager.state()).toMatchObject({ items: [1, 2, 3], hasMore: false });
    await pager.loadMore();
    expect(fetchPage).toHaveBeenCalledTimes(2);

    const slow = pager.loadMore; // no-op now (no more pages)
    await slow();
    pager.reset();
    const loading = pager.loadMore();
    pager.reset(); // filters changed while the first page was loading
    await loading;
    expect(pager.state().items).toEqual([]);
  });

  it('keeps the error and lets the user retry', async () => {
    let fail = true;
    const pager = createPager(async () => {
      if (fail) throw new Error('offline');
      return { items: ['a'], nextCursor: null };
    });
    await pager.loadMore();
    expect(pager.state().error).toBeInstanceOf(Error);
    fail = false;
    await pager.loadMore();
    expect(pager.state()).toMatchObject({ items: ['a'], error: null, hasMore: false });
  });
});

describe('saveTextFile', () => {
  it('clicks a temporary download link', () => {
    const clicked: { href: string; download: string }[] = [];
    const a = { href: '', download: '', style: {} as Record<string, string>, click() { clicked.push({ href: this.href, download: this.download }); }, remove: vi.fn() };
    vi.stubGlobal('document', { createElement: () => a, body: { appendChild: vi.fn() } });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    saveTextFile('﻿a,b\n1,2\n', 'so-cai.csv');
    expect(clicked).toEqual([{ href: 'blob:x', download: 'so-cai.csv' }]);
    expect(create).toHaveBeenCalledOnce();
    expect(a.remove).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
