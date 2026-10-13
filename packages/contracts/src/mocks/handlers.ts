/**
 * ⚠️ MSW mock handlers for every endpoint in `endpoints.ts` — UI development only.
 * Start them only when `import.meta.env.DEV && VITE_USE_MOCKS === 'true'`.
 */
import { http, HttpResponse, delay, type HttpHandler } from 'msw';
import { endpoints, type EndpointDef, type EndpointName, type EndpointOutput } from '../endpoints.ts';
import { ERROR_HTTP_STATUS } from '../errors.ts';
import type { CandleInterval, Order, PortfolioRange, Trade } from '../index.ts';
import {
  fixtureCandles,
  fixtureDepth,
  fixtureExchangeInfo,
  fixtureLedger,
  fixtureMarketStatus,
  fixtureMarketTrades,
  fixturePortfolio,
  fixturePortfolioHistory,
  fixtureSessions,
  fixtureSparklines,
  fixtureTickers,
  fmtPrice,
  MOCK_PAIRS,
} from '../fixtures/index.ts';
import { adjust, balanceOf, emitUser, mockStore, nextId } from './store.ts';
import { baseOf, cancel, createOco, findList, isOpen, lockOf, mockFill, newOrder } from './engine.ts';
import { MockError, mockMe, now, ok, requireUser, requireVerified, type Resolver } from './common.ts';
import { adminResolvers } from './admin.ts';
import { futuresResolvers } from './futures.ts';
import { inviteResolvers, mockConsumeInvite } from './invites.ts';
import { phase26Resolvers } from './phase26.ts';
import { journalResolvers } from './journal.ts';
import type { BinaryFile } from '../common.ts';
const requireTradable = (symbol: string) => {
  if (mockStore.scenario === 'halted') throw new MockError('TRADING_HALTED', 'Trading is halted by the operator');
  if (!MOCK_PAIRS[symbol]) throw new MockError('NOT_FOUND', 'Unknown symbol');
  if (symbol === 'SUIUSDT') throw new MockError('SYMBOL_DISABLED', `${symbol} is not tradable`);
  if (symbol === 'AVAXUSDT' || symbol === 'LINKUSDT') throw new MockError('MARKET_DATA_STALE', 'Market data is not live; trading paused');
};
const empty = () => mockStore.scenario === 'empty';
const f8 = (n: number) => n.toFixed(8);
const num = (v: unknown) => (v === undefined || v === null ? undefined : Number(v));
const str = (v: unknown) => (v === undefined || v === null ? null : f8(Number(v)));

function reserve(asset: string, amount: number) {
  if ((mockStore.balances[asset]?.available ?? 0) < amount) throw new MockError('INSUFFICIENT_BALANCE', `Insufficient ${asset} balance`);
  adjust(asset, -amount, amount);
}

function marketFill(order: Order, symbol: string, side: 'BUY' | 'SELL', qty: number): Trade {
  const price = mockStore.prices[symbol]!;
  if (side === 'BUY' && (mockStore.balances.USDT?.available ?? 0) < qty * price) throw new MockError('INSUFFICIENT_BALANCE', 'Insufficient USDT balance');
  if (side === 'SELL' && (mockStore.balances[baseOf(symbol)]?.available ?? 0) < qty) throw new MockError('INSUFFICIENT_BALANCE', `Insufficient ${baseOf(symbol)} balance`);
  order.quantity ??= f8(qty);
  return mockFill(order, price, null, 'TAKER');
}

function csv(header: string[], rows: (string | null)[][]): string {
  const esc = (v: string | null) => (v === null ? '' : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '﻿' + [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}
const vnTime = (iso: string) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().replace('T', ' ').slice(0, 19);

const resolvers: { [N in EndpointName]: Resolver<N> } = {
  health: () => ({ status: 'ok', time: now(), version: 'mock', market: 'CONNECTED' }),

  register: ({ body }) => {
    mockConsumeInvite(body.inviteCode);
    mockStore.signedIn = true;
    return { user: { ...mockMe(), emailVerified: false } };
  },
  login: ({ body }) => {
    if (body.password === 'wrong') throw new MockError('UNAUTHENTICATED', 'Invalid email or password');
    if (mockStore.twoFactorEnabled) {
      return { twoFactorRequired: true as const, challengeToken: 'mock-challenge-0123456789', expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
    }
    mockStore.signedIn = true;
    return { user: mockMe() };
  },
  logout: () => {
    mockStore.signedIn = false;
    return ok;
  },
  verifyEmail: () => ok,
  resendVerification: () => ok,
  forgotPassword: () => ok,
  resetPassword: () => ok,
  changePassword: () => ok,
  listSessions: () => (requireUser(), { items: fixtureSessions }),
  revokeSession: () => ok,
  me: () => (requireUser(), mockMe()),
  getPreferences: () => (requireUser(), mockStore.preferences),
  updatePreferences: ({ body }) => {
    requireUser();
    mockStore.preferences = { ...mockStore.preferences, ...(body as object) };
    return mockStore.preferences;
  },

  exchangeInfo: () => ({
    ...fixtureExchangeInfo,
    tradingHalted: mockStore.scenario === 'halted',
    symbols: fixtureExchangeInfo.symbols.map((s) => ({ ...s, enabled: mockStore.adminSymbols.find((a) => a.symbol === s.symbol)?.enabled ?? s.enabled })),
    assets: mockStore.assets,
    serverTime: now(),
  }),
  tickers: () => ({ items: fixtureTickers().map((t) => (t.lastPrice === null ? t : { ...t, lastPrice: fmtPrice(t.symbol, mockStore.prices[t.symbol]!) })) }),
  depth: ({ params, query }) => fixtureDepth(params.symbol!, mockStore.prices[params.symbol!], Number(query.get('limit') ?? 20)),
  marketTrades: ({ params }) => ({ symbol: params.symbol!, items: fixtureMarketTrades(params.symbol!), status: 'LIVE' }),
  candles: ({ params, query }) => {
    const interval = (query.get('interval') ?? '1m') as CandleInterval;
    const end = query.get('endTime');
    return { symbol: params.symbol!, interval, items: fixtureCandles(params.symbol!, interval, Number(query.get('limit') ?? 200), end ? Number(end) : Date.now()) };
  },
  marketStatus: () => fixtureMarketStatus,
  sparklines: ({ query }) => {
    const range = query.get('range') === '7d' ? '7d' : '24h';
    return { ...fixtureSparklines(range, mockStore.prices), updatedAt: now() };
  },
  announcements: ({ query }) => {
    const limit = Number(query.get('limit') ?? 10);
    const t = Date.now();
    const visible = mockStore.announcements.filter((a) => !a.hidden && a.publishedAt !== null && (a.expiresAt === null || Date.parse(a.expiresAt) > t));
    visible.sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!));
    return { items: visible.slice(0, limit).map(({ id, title, body, level, pinned, publishedAt, expiresAt }) => ({ id, title, body, level, pinned, publishedAt: publishedAt!, expiresAt })) };
  },

  balances: () => {
    requireUser();
    const items = Object.keys(mockStore.balances).sort().map(balanceOf);
    const total = items.reduce((s, b) => s + (b.valueUsdt === null ? 0 : Number(b.valueUsdt)), 0);
    return { items, totalValueUsdt: total.toFixed(8), unpricedAssets: items.filter((b) => b.valueUsdt === null && Number(b.total) > 0).map((b) => b.asset) };
  },
  ledger: () => (requireUser(), { items: empty() ? [] : fixtureLedger, nextCursor: null }),
  faucetStatus: () => {
    requireUser();
    const next = mockStore.faucetClaimedAt === null ? null : mockStore.faucetClaimedAt + 24 * 3600_000;
    const canClaim = next === null || next <= Date.now();
    return {
      asset: 'USDT',
      amount: '10000.00000000',
      cooldownHours: 24,
      lifetimeCap: '100000.00000000',
      totalClaimed: mockStore.totalClaimed.toFixed(8),
      canClaim,
      nextAvailableAt: canClaim ? null : new Date(next!).toISOString(),
    };
  },
  faucetClaim: () => {
    requireVerified();
    const status = resolvers.faucetStatus({ params: {}, query: new URLSearchParams(), body: {} }) as EndpointOutput<'faucetStatus'>;
    if (!status.canClaim) throw new MockError('FAUCET_COOLDOWN', 'Faucet is cooling down', { nextAvailableAt: status.nextAvailableAt });
    mockStore.faucetClaimedAt = Date.now();
    mockStore.totalClaimed += 10000;
    adjust('USDT', 10000);
    return {
      claimed: '10000.00000000',
      balance: balanceOf('USDT'),
      status: { ...status, canClaim: false, totalClaimed: mockStore.totalClaimed.toFixed(8), nextAvailableAt: new Date(Date.now() + 24 * 3600_000).toISOString() },
    };
  },

  placeOrder: ({ body }) => {
    requireVerified();
    const symbol = String(body.symbol);
    const side = body.side as 'BUY' | 'SELL';
    const type = body.type as Order['type'];
    requireTradable(symbol);
    const last = mockStore.prices[symbol]!;
    const tp = body.tpsl as { takeProfitPrice?: string; stopLossPrice?: string; stopLossLimitPrice?: string } | undefined;
    const entry = type === 'LIMIT' ? Number(body.price) : last;
    if (tp && ((tp.takeProfitPrice && Number(tp.takeProfitPrice) <= entry) || (tp.stopLossPrice && Number(tp.stopLossPrice) >= entry))) {
      throw new MockError('INVALID_TPSL', 'Take-profit must be above and stop-loss below the entry price');
    }
    const order = newOrder({
      symbol,
      side,
      type,
      clientOrderId: String(body.clientOrderId ?? `mock-${mockStore.nextId}`),
      timeInForce: type === 'LIMIT' || type === 'STOP_LIMIT' ? ((body.timeInForce as 'GTC' | 'IOC' | undefined) ?? 'GTC') : null,
      price: str(body.price),
      stopPrice: str(body.stopPrice),
      quantity: str(body.quantity),
      quoteOrderQty: str(body.quoteOrderQty),
      tpsl: tp
        ? { takeProfitPrice: str(tp.takeProfitPrice), stopLossPrice: str(tp.stopLossPrice), stopLossLimitPrice: str(tp.stopLossLimitPrice), state: 'PENDING', childOrderListId: null, childOrderIds: [], skippedReason: null }
        : null,
    });
    const fills: Trade[] = [];
    if (type === 'MARKET') {
      const qty = body.quantity ? Number(body.quantity) : Math.floor((Number(body.quoteOrderQty) / last) * 1e5) / 1e5;
      fills.push(marketFill(order, symbol, side, qty));
      return { order, fills };
    }
    if (type === 'STOP_MARKET' || type === 'STOP_LIMIT') {
      const stop = Number(body.stopPrice);
      if (stop === last) throw new MockError('INVALID_STOP_PRICE', 'Stop price equals the last price');
      order.triggerState = 'WAITING';
      order.triggerDirection = stop > last ? 'UP' : 'DOWN';
    }
    if (type === 'TRAILING_STOP_MARKET') {
      const d = Number(body.trailingDeltaBips) / 10_000;
      order.trailingDeltaBips = Number(body.trailingDeltaBips);
      order.activationPrice = str(body.activationPrice);
      order.triggerState = 'WAITING';
      order.triggerDirection = side === 'SELL' ? 'DOWN' : 'UP';
      order.trailingReferencePrice = body.activationPrice ? null : f8(last);
      order.stopPrice = body.activationPrice ? null : f8(side === 'SELL' ? last * (1 - d) : last * (1 + d));
    }
    const lock = lockOf(order);
    reserve(lock.asset, lock.amount);
    mockStore.openOrders.unshift(order);
    emitUser({ kind: 'order', order });
    return { order, fills };
  },
  openOrders: ({ query }) => {
    requireUser();
    const s = query.get('symbol');
    return { items: mockStore.openOrders.filter((o) => !s || o.symbol === s) };
  },
  orderHistory: ({ query }) => {
    requireUser();
    const s = query.get('symbol');
    return { items: mockStore.history.filter((o) => !s || o.symbol === s), nextCursor: null };
  },
  getOrder: ({ params }) => {
    requireUser();
    const o = [...mockStore.openOrders, ...mockStore.history].find((x) => x.id === params.orderId);
    if (!o) throw new MockError('NOT_FOUND', 'Order not found');
    return o;
  },
  cancelOrder: ({ params }) => {
    requireUser();
    const o = mockStore.openOrders.find((x) => x.id === params.orderId);
    if (!o) throw new MockError(mockStore.history.some((x) => x.id === params.orderId) ? 'ORDER_NOT_CANCELABLE' : 'NOT_FOUND');
    // like the server: a bot's orders are canceled by stopping the bot
    if (o.source !== 'USER') throw new MockError('ORDER_NOT_CANCELABLE', 'This order belongs to a bot: stop the bot to cancel it');
    return cancel(o);
  },
  cancelAllOrders: ({ query }) => {
    requireUser();
    const s = query.get('symbol');
    const canceled: Order[] = [];
    for (const o of [...mockStore.openOrders]) if ((!s || o.symbol === s) && isOpen(o) && o.source === 'USER') canceled.push(cancel(o)); // bot orders stay
    return { canceled };
  },
  myTrades: ({ query }) => {
    requireUser();
    const s = query.get('symbol');
    return { items: mockStore.trades.filter((t) => !s || t.symbol === s), nextCursor: null };
  },

  placeOco: ({ body }) => {
    requireVerified();
    const symbol = String(body.symbol);
    requireTradable(symbol);
    const side = body.side as 'BUY' | 'SELL';
    const last = mockStore.prices[symbol]!;
    const price = Number(body.price);
    const stop = Number(body.stopPrice);
    const valid = side === 'SELL' ? price > last && last > stop : price < last && last < stop;
    if (!valid) throw new MockError('INVALID_OCO_PRICES', side === 'SELL' ? 'Need price > last price > stopPrice' : 'Need price < last price < stopPrice', { lastPrice: f8(last) });
    const qty = Number(body.quantity);
    const lockAmt = side === 'SELL' ? qty : qty * Math.max(price, Number(body.stopLimitPrice));
    const lockAsset = side === 'SELL' ? baseOf(symbol) : 'USDT';
    if ((mockStore.balances[lockAsset]?.available ?? 0) < lockAmt) throw new MockError('INSUFFICIENT_BALANCE', `Insufficient ${lockAsset} balance`);
    return createOco({ symbol, side, quantity: qty, price, stopPrice: stop, stopLimitPrice: num(body.stopLimitPrice), clientListId: body.clientListId as string | undefined });
  },
  openOrderLists: ({ query }) => {
    requireUser();
    const s = query.get('symbol');
    return { items: mockStore.orderLists.filter((l) => l.listStatus === 'EXECUTING' && (!s || l.symbol === s)) };
  },
  getOrderList: ({ params }) => {
    requireUser();
    const l = findList(params.listId!);
    if (!l) throw new MockError('NOT_FOUND', 'Order list not found');
    return l;
  },
  cancelOrderList: ({ params }) => {
    requireUser();
    const l = findList(params.listId!);
    if (!l) throw new MockError('NOT_FOUND', 'Order list not found');
    if (l.listStatus !== 'EXECUTING') throw new MockError('ORDER_NOT_CANCELABLE', 'Order list is already done');
    cancel(l.orders[0]!);
    return l;
  },

  portfolio: () => {
    requireUser();
    if (empty()) return { ...fixturePortfolio, positions: [], totalValueUsdt: f8(0), totalUnrealizedPnl: null, totalRealizedPnl: f8(0), totalFeesUsdt: f8(0), unpricedAssets: [] };
    return { ...fixturePortfolio, asOf: now() };
  },
  portfolioHistory: ({ query }) => {
    requireUser();
    const range = (query.get('range') ?? '7d') as PortfolioRange;
    return empty() ? { range, points: [] } : fixturePortfolioHistory(range, Date.now());
  },

  exportOrders: ({ query }) => {
    requireUser();
    const s = query.get('symbol');
    const rows = [...mockStore.openOrders, ...mockStore.history].filter((o) => !s || o.symbol === s);
    return csv(
      ['orderId', 'time_utc', 'time_gmt7', 'symbol', 'side', 'type', 'status', 'price', 'stopPrice', 'quantity', 'quoteOrderQty', 'executedQty', 'cumulativeQuoteQty', 'avgPrice', 'closeReason'],
      rows.map((o) => [o.id, o.createdAt, vnTime(o.createdAt), o.symbol, o.side, o.type, o.status, o.price, o.stopPrice, o.quantity, o.quoteOrderQty, o.executedQty, o.cumulativeQuoteQty, o.avgPrice, o.closeReason]),
    );
  },
  exportTrades: ({ query }) => {
    requireUser();
    const s = query.get('symbol');
    return csv(
      ['tradeId', 'orderId', 'time_utc', 'time_gmt7', 'symbol', 'side', 'price', 'quantity', 'quoteQty', 'fee', 'feeAsset', 'liquidity', 'realizedPnl'],
      mockStore.trades.filter((t) => !s || t.symbol === s).map((t) => [t.id, t.orderId, t.createdAt, vnTime(t.createdAt), t.symbol, t.side, t.price, t.quantity, t.quoteQty, t.fee, t.feeAsset, t.liquidity, t.realizedPnl]),
    );
  },
  exportLedger: () => {
    requireUser();
    return csv(
      ['entryId', 'time_utc', 'time_gmt7', 'asset', 'type', 'deltaAvailable', 'deltaLocked', 'availableAfter', 'lockedAfter', 'refType', 'refId'],
      (empty() ? [] : fixtureLedger).map((e) => [e.id, e.createdAt, vnTime(e.createdAt), e.asset, e.type, e.deltaAvailable, e.deltaLocked, e.availableAfter, e.lockedAfter, e.refType, e.refId]),
    );
  },

  listAlerts: ({ query }) => {
    requireUser();
    const st = query.get('status');
    return { items: mockStore.alerts.filter((a) => !st || a.status === st) };
  },
  createAlert: ({ body }) => {
    requireUser();
    const symbol = String(body.symbol);
    if (!MOCK_PAIRS[symbol]) throw new MockError('NOT_FOUND', 'Unknown symbol');
    if (mockStore.alerts.filter((a) => a.status === 'ACTIVE').length >= 50) throw new MockError('LIMIT_EXCEEDED', 'Too many active alerts', { limit: 50 });
    const target = Number(body.targetPrice);
    const last = mockStore.prices[symbol]!;
    if ((body.condition === 'ABOVE' && target <= last) || (body.condition === 'BELOW' && target >= last)) {
      throw new MockError('INVALID_PRICE', 'Target already reached', { lastPrice: f8(last) });
    }
    const alert = {
      id: nextId(),
      symbol,
      condition: body.condition as 'ABOVE' | 'BELOW',
      targetPrice: f8(target),
      note: (body.note as string | undefined) ?? null,
      status: 'ACTIVE' as const,
      triggeredPrice: null,
      triggeredAt: null,
      createdAt: now(),
    };
    mockStore.alerts.unshift(alert);
    return alert;
  },
  deleteAlert: ({ params }) => {
    requireUser();
    const a = mockStore.alerts.find((x) => x.id === params.alertId);
    if (!a) throw new MockError('NOT_FOUND', 'Alert not found');
    a.status = 'CANCELED';
    return a;
  },

  listNotifications: ({ query }) => {
    requireUser();
    const unreadOnly = query.get('unreadOnly') === 'true';
    return { items: mockStore.notifications.filter((n) => !unreadOnly || n.readAt === null), nextCursor: null };
  },
  unreadNotifications: () => (requireUser(), { unread: mockStore.notifications.filter((n) => n.readAt === null).length }),
  ...adminResolvers,
  ...futuresResolvers,
  ...phase26Resolvers,
  ...inviteResolvers,
  ...journalResolvers,

  markNotificationsRead: ({ body }) => {
    requireUser();
    const ids = body.ids as string[] | undefined;
    for (const n of mockStore.notifications) if (n.readAt === null && (body.all || ids?.includes(n.id))) n.readAt = now();
    return { unread: mockStore.notifications.filter((n) => n.readAt === null).length };
  },
};

export interface MockHandlerOptions {
  /** Prefix matched before the path; default "*" matches any origin. */
  baseUrl?: string;
  /** Artificial latency in ms so loading states are visible (default 250; 0 in tests). */
  latencyMs?: number;
}

/** MSW handlers for every endpoint. Browser: `setupWorker(...createMockHandlers()).start()`. */
export function createMockHandlers(opts: MockHandlerOptions = {}): HttpHandler[] {
  const base = opts.baseUrl ?? '*';
  const latency = opts.latencyMs ?? 250;
  return (Object.keys(endpoints) as EndpointName[]).map((name) => {
    const def = endpoints[name] as EndpointDef;
    const method = def.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
    return http[method](`${base}${def.path}`, async ({ request, params }) => {
      if (latency) await delay(latency);
      if (mockStore.scenario === 'error' && name !== 'health') {
        return HttpResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Mock: simulated server error' } }, { status: 500 });
      }
      try {
        const body = request.method === 'GET' || request.method === 'DELETE' ? {} : ((await request.json().catch(() => ({}))) as Record<string, unknown>);
        // Reject what the server would reject (same VALIDATION_ERROR shape).
        const query = new URL(request.url).searchParams;
        for (const [schema, value] of [
          [def.params, params],
          [def.query, Object.fromEntries(query)],
          [def.body, body],
        ] as const) {
          const check = schema?.safeParse(value);
          if (check && !check.success) {
            throw new MockError('VALIDATION_ERROR', 'Invalid request', { issues: check.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
          }
        }
        const result = await (resolvers[name] as Resolver<EndpointName>)({
          params: params as Record<string, string>,
          query,
          body,
        });
        if (def.format === 'csv') {
          return new HttpResponse(result as string, {
            status: 200,
            headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${def.path.split('/').pop()}"` },
          });
        }
        if (def.format === 'binary') {
          // raw bytes with their own type, like the server (no schema check)
          const file = result as BinaryFile;
          return new HttpResponse(new Uint8Array(file.data), {
            status: def.status ?? 200,
            headers: { 'content-type': file.contentType, 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=3600' },
          });
        }
        return HttpResponse.json(result as object, { status: def.status ?? 200 });
      } catch (e) {
        if (e instanceof MockError) {
          return HttpResponse.json({ error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) } }, { status: ERROR_HTTP_STATUS[e.code] });
        }
        throw e;
      }
    });
  });
}

