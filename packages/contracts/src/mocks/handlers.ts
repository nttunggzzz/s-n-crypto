/**
 * ⚠️ MSW mock handlers for every endpoint in `endpoints.ts` — UI development only.
 * Start them only when `import.meta.env.DEV && VITE_USE_MOCKS === 'true'`.
 */
import { http, HttpResponse, delay, type HttpHandler } from 'msw';
import { endpoints, type EndpointDef, type EndpointName, type EndpointOutput } from '../endpoints.ts';
import type { ErrorCode } from '../errors.ts';
import { ERROR_HTTP_STATUS } from '../errors.ts';
import type { CandleInterval, Order, Trade } from '../index.ts';
import {
  fixtureCandles,
  fixtureDepth,
  fixtureExchangeInfo,
  fixtureLedger,
  fixtureMarketStatus,
  fixtureMarketTrades,
  fixtureSessions,
  fixtureTickers,
  fmtPrice,
  MOCK_PAIRS,
} from '../fixtures/index.ts';
import { adjust, balanceOf, emitUser, mockMe, mockStore } from './store.ts';

class MockError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string = code,
  ) {
    super(message);
  }
}

interface Req {
  params: Record<string, string>;
  query: URLSearchParams;
  body: Record<string, unknown>;
}

type Resolver<N extends EndpointName> = (req: Req) => EndpointOutput<N> | Promise<EndpointOutput<N>>;

const requireUser = () => {
  if (!mockStore.signedIn) throw new MockError('UNAUTHENTICATED', 'Sign in required');
};
const requireVerified = () => {
  requireUser();
  if (mockStore.scenario === 'unverified') throw new MockError('EMAIL_NOT_VERIFIED', 'Verify your email first');
};
const ok = { ok: true as const };
const now = () => new Date().toISOString();
const empty = () => mockStore.scenario === 'empty';

function fillMarket(order: Order, symbol: string, side: 'BUY' | 'SELL', qty: number): Trade {
  const price = mockStore.prices[symbol]!;
  const base = MOCK_PAIRS[symbol]!.base;
  const quote = qty * price;
  const fee = side === 'BUY' ? qty * 0.001 : quote * 0.001;
  if (side === 'BUY') {
    if ((mockStore.balances.USDT?.available ?? 0) < quote) throw new MockError('INSUFFICIENT_BALANCE', 'Insufficient USDT balance');
    adjust('USDT', -quote);
    adjust(base, qty - fee);
  } else {
    if ((mockStore.balances[base]?.available ?? 0) < qty) throw new MockError('INSUFFICIENT_BALANCE', `Insufficient ${base} balance`);
    adjust(base, -qty);
    adjust('USDT', quote - fee);
  }
  order.executedQty = qty.toFixed(8);
  order.cumulativeQuoteQty = quote.toFixed(8);
  order.avgPrice = price.toFixed(8);
  order.status = 'FILLED';
  return {
    id: String(mockStore.nextId++),
    orderId: order.id,
    symbol,
    side,
    price: price.toFixed(8),
    quantity: qty.toFixed(8),
    quoteQty: quote.toFixed(8),
    fee: fee.toFixed(8),
    feeAsset: side === 'BUY' ? base : 'USDT',
    liquidity: 'TAKER',
    createdAt: now(),
  };
}

const resolvers: { [N in EndpointName]: Resolver<N> } = {
  health: () => ({ status: 'ok', time: now(), version: 'mock', market: 'CONNECTED' }),

  register: () => {
    mockStore.signedIn = true;
    return { user: { ...mockMe(), emailVerified: false } };
  },
  login: ({ body }) => {
    if (body.password === 'wrong') throw new MockError('UNAUTHENTICATED', 'Invalid email or password');
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

  exchangeInfo: () => ({ ...fixtureExchangeInfo, tradingHalted: mockStore.scenario === 'halted', serverTime: now() }),
  tickers: () => ({ items: fixtureTickers().map((t) => (t.lastPrice === null ? t : { ...t, lastPrice: fmtPrice(t.symbol, mockStore.prices[t.symbol]!) })) }),
  depth: ({ params, query }) => fixtureDepth(params.symbol!, mockStore.prices[params.symbol!], Number(query.get('limit') ?? 20)),
  marketTrades: ({ params }) => ({ symbol: params.symbol!, items: fixtureMarketTrades(params.symbol!), status: 'LIVE' }),
  candles: ({ params, query }) => {
    const interval = (query.get('interval') ?? '1m') as CandleInterval;
    const end = query.get('endTime');
    return { symbol: params.symbol!, interval, items: fixtureCandles(params.symbol!, interval, Number(query.get('limit') ?? 200), end ? Number(end) : Date.now()) };
  },
  marketStatus: () => fixtureMarketStatus,

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
    if (!status.canClaim) throw new MockError('FAUCET_COOLDOWN', 'Faucet is cooling down');
    mockStore.faucetClaimedAt = Date.now();
    mockStore.totalClaimed += 10000;
    adjust('USDT', 10000);
    return { claimed: '10000.00000000', balance: balanceOf('USDT'), status: { ...status, canClaim: false, totalClaimed: mockStore.totalClaimed.toFixed(8), nextAvailableAt: new Date(Date.now() + 24 * 3600_000).toISOString() } };
  },

  placeOrder: ({ body }) => {
    requireVerified();
    if (mockStore.scenario === 'halted') throw new MockError('TRADING_HALTED', 'Trading is halted by the operator');
    const symbol = String(body.symbol);
    const side = body.side as 'BUY' | 'SELL';
    if (!MOCK_PAIRS[symbol]) throw new MockError('NOT_FOUND', 'Unknown symbol');
    if (symbol === 'SUIUSDT') throw new MockError('SYMBOL_DISABLED', `${symbol} is not tradable`);
    if (symbol === 'AVAXUSDT' || symbol === 'LINKUSDT') throw new MockError('MARKET_DATA_STALE', 'Market data is not live; trading paused');
    const t = now();
    const order: Order = {
      id: String(mockStore.nextId++),
      clientOrderId: String(body.clientOrderId ?? `mock-${mockStore.nextId}`),
      symbol,
      side,
      type: body.type as 'MARKET' | 'LIMIT',
      timeInForce: body.type === 'LIMIT' ? ((body.timeInForce as 'GTC' | 'IOC' | undefined) ?? 'GTC') : null,
      status: 'NEW',
      price: body.price ? Number(body.price).toFixed(8) : null,
      stopPrice: null,
      quantity: body.quantity ? Number(body.quantity).toFixed(8) : null,
      quoteOrderQty: body.quoteOrderQty ? Number(body.quoteOrderQty).toFixed(8) : null,
      executedQty: '0.00000000',
      cumulativeQuoteQty: '0.00000000',
      avgPrice: null,
      createdAt: t,
      updatedAt: t,
    };
    const fills: Trade[] = [];
    if (order.type === 'MARKET') {
      const qty = body.quantity ? Number(body.quantity) : Number(body.quoteOrderQty) / mockStore.prices[symbol]!;
      fills.push(fillMarket(order, symbol, side, Math.floor(qty * 1e5) / 1e5));
      mockStore.history.unshift(order);
      mockStore.trades.unshift(...fills);
    } else {
      const qty = Number(body.quantity);
      const price = Number(body.price);
      const base = MOCK_PAIRS[symbol]!.base;
      if (side === 'BUY') {
        if ((mockStore.balances.USDT?.available ?? 0) < qty * price) throw new MockError('INSUFFICIENT_BALANCE', 'Insufficient USDT balance');
        adjust('USDT', -qty * price, qty * price);
      } else {
        if ((mockStore.balances[base]?.available ?? 0) < qty) throw new MockError('INSUFFICIENT_BALANCE', `Insufficient ${base} balance`);
        adjust(base, -qty, qty);
      }
      mockStore.openOrders.unshift(order);
    }
    emitUser({ kind: 'order', order });
    fills.forEach((trade) => emitUser({ kind: 'trade', trade }));
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
    const i = mockStore.openOrders.findIndex((o) => o.id === params.orderId);
    if (i < 0) throw new MockError(mockStore.history.some((o) => o.id === params.orderId) ? 'ORDER_NOT_CANCELABLE' : 'NOT_FOUND');
    const [o] = mockStore.openOrders.splice(i, 1);
    const remaining = Number(o!.quantity) - Number(o!.executedQty);
    if (o!.side === 'BUY') adjust('USDT', remaining * Number(o!.price), -remaining * Number(o!.price));
    else adjust(MOCK_PAIRS[o!.symbol]!.base, remaining, -remaining);
    const canceled: Order = { ...o!, status: 'CANCELED', updatedAt: now() };
    mockStore.history.unshift(canceled);
    emitUser({ kind: 'order', order: canceled });
    return canceled;
  },
  cancelAllOrders: ({ query }) => {
    requireUser();
    const s = query.get('symbol');
    const ids = mockStore.openOrders.filter((o) => !s || o.symbol === s).map((o) => o.id);
    return { canceled: ids.map((id) => resolvers.cancelOrder({ params: { orderId: id }, query: new URLSearchParams(), body: {} }) as Order) };
  },
  myTrades: ({ query }) => {
    requireUser();
    const s = query.get('symbol');
    return { items: mockStore.trades.filter((t) => !s || t.symbol === s), nextCursor: null };
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
    const def = endpoints[name];
    const method = def.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
    return http[method](`${base}${def.path}`, async ({ request, params }) => {
      if (latency) await delay(latency);
      if (mockStore.scenario === 'error' && name !== 'health') {
        return HttpResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Mock: simulated server error' } }, { status: 500 });
      }
      try {
        const body = request.method === 'GET' || request.method === 'DELETE' ? {} : ((await request.json().catch(() => ({}))) as Record<string, unknown>);
        const result = await (resolvers[name] as Resolver<EndpointName>)({
          params: params as Record<string, string>,
          query: new URL(request.url).searchParams,
          body,
        });
        return HttpResponse.json(result as object, { status: (def as EndpointDef).status ?? 200 });
      } catch (e) {
        if (e instanceof MockError) return HttpResponse.json({ error: { code: e.code, message: e.message } }, { status: ERROR_HTTP_STATUS[e.code] });
        throw e;
      }
    });
  });
}
