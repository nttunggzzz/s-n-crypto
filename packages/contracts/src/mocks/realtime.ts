/**
 * ⚠️ Mock realtime client (same interface as createRealtimeClient) — UI development only.
 * Emits fake ticker/depth/trades/candle updates around the mock prices, and `user` events
 * produced by the mock handlers (orders, trades, balances).
 */
import type { ChannelData } from '../realtime.ts';
import type { RealtimeClient, RealtimeStatus } from '../realtimeClient.ts';
import type { CandleInterval } from '../common.ts';
import { fixtureCandles, fixtureDepth, fixtureMarketStatus, fixtureTicker, fmtPrice, MOCK_PAIRS } from '../fixtures/index.ts';
import { mockStore } from './store.ts';

export interface MockRealtimeOptions {
  /** Tick interval for market updates (default 1000ms). */
  intervalMs?: number;
  /** Simulate a dropped connection every N ms (0 = never). */
  dropEveryMs?: number;
}

export function createMockRealtimeClient(opts: MockRealtimeOptions = {}): RealtimeClient {
  const intervalMs = opts.intervalMs ?? 1000;
  const subs = new Map<string, Set<(d: unknown) => void>>();
  const statusCbs = new Set<(s: RealtimeStatus) => void>();
  const errorCbs = new Set<(e: { code: string; message: string; channel?: string }) => void>();
  let tradeId = 5000;
  let status: RealtimeStatus = 'open';

  const emit = (channel: string, data: unknown) => subs.get(channel)?.forEach((cb) => cb(data));
  const setStatus = (s: RealtimeStatus) => {
    status = s;
    statusCbs.forEach((cb) => cb(s));
  };

  const timer = setInterval(() => {
    if (status !== 'open') return;
    for (const channel of subs.keys()) {
      const [kind, symbol, interval] = channel.split(':');
      if (!symbol || !MOCK_PAIRS[symbol] || symbol === 'LINKUSDT' || symbol === 'AVAXUSDT') continue;
      const p = (mockStore.prices[symbol] = mockStore.prices[symbol]! * (1 + (Math.random() - 0.5) / 500));
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
      if (!set) subs.set(channel, (set = new Set()));
      set.add(onData as (d: unknown) => void);
      if (channel === 'market:status') queueMicrotask(() => onData(fixtureMarketStatus as ChannelData<C>));
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
    onError(cb) {
      errorCbs.add(cb);
      return () => errorCbs.delete(cb);
    },
    close() {
      clearInterval(timer);
      clearInterval(dropTimer);
      mockStore.listeners.delete(userListener as never);
      setStatus('closed');
    },
  };
}
