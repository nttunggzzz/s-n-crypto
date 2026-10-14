/**
 * ⚠️ Mock realtime client (same interface as createRealtimeClient) — UI development only.
 * Every tick moves the mock prices a little, runs the mock engine (stop triggers, OCO,
 * TP/SL children, price alerts) and emits ticker/depth/trades/candle updates plus the
 * `user` events produced by the mock handlers/engine.
 */
import { REALTIME_MAX_CHANNELS, type ChannelData } from '../realtime.ts';
import type { RealtimeClient, RealtimeCloseInfo, RealtimeStatus } from '../realtimeClient.ts';
import type { CandleInterval } from '../common.ts';
import { fixtureCandles, fixtureDepth, fixtureMarketStatus, fixtureTicker, fmtPrice, MOCK_PAIRS } from '../fixtures/index.ts';
import { mockStore } from './store.ts';
import { mockProcessPrice } from './engine.ts';
import { mockFuturesTick } from './futures.ts';
import { fixtureFuturesCandles, fixtureFuturesDepth, fixtureFuturesTicker, fixtureMarkPrice, fmtFuturesPrice, fmtFuturesQty, MOCK_FUTURES, MOCK_FUTURES_FROZEN } from '../fixtures/futures.ts';

export interface MockRealtimeOptions {
  /** Tick interval for market updates (default 1000ms). */
  intervalMs?: number;
  /** Simulate a dropped connection every N ms (0 = never). */
  dropEveryMs?: number;
  /** Max relative move per tick (default 0.001 = 0.1%). */
  volatility?: number;
}

const FROZEN = new Set(['LINKUSDT', 'AVAXUSDT']); // UNAVAILABLE / STALE in the fixtures

const exchangeStatus = () => ({
  tradingHalted: mockStore.settings.tradingHalted || mockStore.scenario === 'halted',
  disabledSymbols: mockStore.adminSymbols.filter((s) => !s.enabled).map((s) => s.symbol),
  taxMode: mockStore.tax.settings.taxMode,
  taxRate: mockStore.tax.settings.taxRate,
  taxVndRate: mockStore.tax.settings.taxVndRate,
  updatedAt: new Date().toISOString(),
});

export function createMockRealtimeClient(opts: MockRealtimeOptions = {}): RealtimeClient {
  const intervalMs = opts.intervalMs ?? 1000;
  const vol = opts.volatility ?? 0.001;
  const subs = new Map<string, Set<(d: unknown) => void>>();
  const statusCbs = new Set<(s: RealtimeStatus) => void>();
  const errorCbs = new Set<(e: { code: string; message: string; channel?: string }) => void>();
  const closeCbs = new Set<(i: RealtimeCloseInfo) => void>();
  let tradeId = 5000;
  let status: RealtimeStatus = 'open';
  let lastExchangeStatus = '';

  const emit = (channel: string, data: unknown) => subs.get(channel)?.forEach((cb) => cb(data));
  const setStatus = (s: RealtimeStatus) => {
    status = s;
    statusCbs.forEach((cb) => cb(s));
  };

  const timer = setInterval(() => {
    if (status !== 'open') return;
    for (const symbol of Object.keys(MOCK_PAIRS)) {
      if (FROZEN.has(symbol)) continue;
      const p = (mockStore.prices[symbol] = mockStore.prices[symbol]! * (1 + (Math.random() - 0.5) * 2 * vol));
      mockProcessPrice(symbol, p);
    }
    mockFuturesTick();
    if (subs.has('exchange:status')) {
      const st = exchangeStatus();
      const key = JSON.stringify({ ...st, updatedAt: '' });
      if (key !== lastExchangeStatus) {
        lastExchangeStatus = key;
        emit('exchange:status', st);
      }
    }
    if (subs.has('tickers')) emit('tickers', { items: Object.keys(MOCK_PAIRS).filter((s) => !FROZEN.has(s)).map((s) => fixtureTicker(s, mockStore.prices[s]!)) });
    if (subs.has('futures:tickers')) {
      emit('futures:tickers', { items: Object.keys(MOCK_FUTURES).filter((s) => !MOCK_FUTURES_FROZEN.has(s)).map((s) => fixtureFuturesTicker(s, mockStore.futures.prices[s]!)) });
    }
    for (const channel of subs.keys()) {
      if (channel === 'futures:tickers') continue;
      if (channel.startsWith('futures:')) {
        const [, kind, symbol, interval] = channel.split(':');
        if (kind === 'status') {
          emit(channel, { ...fixtureMarketStatus, symbols: Object.keys(MOCK_FUTURES).map((s) => ({ symbol: s, status: s === 'LINKUSDT' ? 'UNAVAILABLE' : s === 'AVAXUSDT' ? 'STALE' : 'LIVE', lastUpdateAt: s === 'LINKUSDT' ? null : new Date().toISOString() })) });
          continue;
        }
        if (!symbol || !MOCK_FUTURES[symbol] || MOCK_FUTURES_FROZEN.has(symbol)) continue;
        const fp = mockStore.futures.prices[symbol]!;
        if (kind === 'ticker') emit(channel, fixtureFuturesTicker(symbol, fp));
        else if (kind === 'mark') emit(channel, fixtureMarkPrice(symbol, fp));
        else if (kind === 'depth') emit(channel, fixtureFuturesDepth(symbol, fp));
        else if (kind === 'trades') emit(channel, { id: tradeId++, price: fmtFuturesPrice(symbol, fp), qty: fmtFuturesQty(symbol, Number(MOCK_FUTURES[symbol]!.minQty) * (1 + Math.floor(Math.random() * 20))), time: Date.now(), isBuyerMaker: Math.random() < 0.5 });
        else if (kind === 'candles') emit(channel, { ...fixtureFuturesCandles(symbol, interval as CandleInterval, fp, 1, Date.now())[0]!, close: fmtFuturesPrice(symbol, fp), closed: false });
        continue;
      }
      const [kind, symbol, interval] = channel.split(':');
      if (!symbol || !MOCK_PAIRS[symbol] || FROZEN.has(symbol)) continue;
      const p = mockStore.prices[symbol]!;
      if (kind === 'ticker') emit(channel, fixtureTicker(symbol, p));
      else if (kind === 'depth') emit(channel, fixtureDepth(symbol, p));
      else if (kind === 'trades') emit(channel, { id: tradeId++, price: fmtPrice(symbol, p), qty: (Math.random() / 10).toFixed(4), time: Date.now(), isBuyerMaker: Math.random() < 0.5 });
      else if (kind === 'candles') {
        const last = fixtureCandles(symbol, interval as CandleInterval, 1, Date.now())[0]!;
        emit(channel, { ...last, close: fmtPrice(symbol, p), closed: false });
      }
    }
  }, intervalMs);

  const userListener = (e: unknown) => emit('user', e);
  mockStore.listeners.add(userListener as never);

  const dropTimer = opts.dropEveryMs
    ? setInterval(() => {
        setStatus('closed');
        closeCbs.forEach((cb) => cb({ code: 1006, reason: 'mock connection drop' }));
        setTimeout(() => setStatus('connecting'), 1000);
        setTimeout(() => setStatus('open'), 2500);
      }, opts.dropEveryMs)
    : undefined;

  return {
    subscribe<C extends string>(channel: C, onData: (data: ChannelData<C>) => void) {
      if (channel === 'user' && !mockStore.signedIn) {
        queueMicrotask(() => errorCbs.forEach((cb) => cb({ code: 'UNAUTHENTICATED', message: 'Sign in required', channel })));
      }
      let set = subs.get(channel);
      if (!set) {
        // same limit as the server: one connection, distinct channels
        if (subs.size >= REALTIME_MAX_CHANNELS) {
          queueMicrotask(() => errorCbs.forEach((cb) => cb({ code: 'RATE_LIMITED', message: `Too many subscriptions (max ${REALTIME_MAX_CHANNELS})`, channel })));
          return () => {};
        }
        subs.set(channel, (set = new Set()));
      }
      set.add(onData as (d: unknown) => void);
      if (channel === 'tickers') queueMicrotask(() => onData({ items: Object.keys(MOCK_PAIRS).map((s) => fixtureTicker(s, mockStore.prices[s]!)) } as ChannelData<C>));
      if (channel === 'futures:tickers') queueMicrotask(() => onData({ items: Object.keys(MOCK_FUTURES).map((s) => fixtureFuturesTicker(s, mockStore.futures.prices[s]!)) } as ChannelData<C>));
      if (channel === 'market:status') queueMicrotask(() => onData(fixtureMarketStatus as ChannelData<C>));
      if (channel === 'exchange:status') queueMicrotask(() => onData(exchangeStatus() as ChannelData<C>));
      return () => {
        set.delete(onData as (d: unknown) => void);
        if (set.size === 0) subs.delete(channel);
      };
    },
    onStatus(cb) {
      statusCbs.add(cb);
      queueMicrotask(() => cb(status));
      return () => statusCbs.delete(cb);
    },
    onClose(cb) {
      closeCbs.add(cb);
      return () => closeCbs.delete(cb);
    },
    onError(cb) {
      errorCbs.add(cb);
      return () => errorCbs.delete(cb);
    },
    reconnect() {
      setStatus('connecting');
      queueMicrotask(() => {
        setStatus('open');
        // like the server: the new connection carries the current sign-in state
        if (subs.has('user') && !mockStore.signedIn) errorCbs.forEach((cb) => cb({ code: 'UNAUTHENTICATED', message: 'Sign in required', channel: 'user' }));
      });
    },
    close() {
      clearInterval(timer);
      clearInterval(dropTimer);
      mockStore.listeners.delete(userListener as never);
      setStatus('closed');
    },
  };
}
