/**
 * ⚠️ Mock resolvers for phase 2.6 (profile/security, PnL analysis, DCA, grid bots) — UI development only.
 * Simplified on purpose (JS numbers). The real rules live on the server.
 */
import type { AvatarId, DcaPlan, GridBot, Order, PnlAnalysis, PnlRange } from '../index.ts';
import { audit, findUser } from './admin.ts';
import { viewPosition } from './futures.ts';
import type { MockPhase26State } from './phase26State.ts';
import { fmtPrice, MOCK_PAIRS, ORDER_DEFAULTS } from '../fixtures/index.ts';
import { MockError, mockMe, now, requireStaff, requireUser, requireVerified, type Resolver } from './common.ts';
import { adjust, emitUser, mockStore, nextId, notify } from './store.ts';

const f8 = (n: number) => (Math.round(n * 1e8) / 1e8).toFixed(8);
const DAY = 86_400_000;
const empty = () => mockStore.scenario === 'empty';
const gmt7Date = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);

const st = () => mockStore.phase26;
const price = (symbol: string) => mockStore.prices[symbol] ?? MOCK_PAIRS[symbol]?.price ?? 0;
const pair = (symbol: string) => {
  const p = MOCK_PAIRS[symbol];
  if (!p) throw new MockError('NOT_FOUND', `Unknown symbol ${symbol}`);
  return p;
};
const stepFloor = (v: number, step: number) => Math.floor(v / step + 1e-9) * step;
const dec = (step: string) => (step.includes('.') ? step.split('.')[1]!.replace(/0+$/, '').length : 0);

// ───────────────────────────── grid math (mock)

function gridLevels(lower: number, upper: number, n: number, mode: 'ARITHMETIC' | 'GEOMETRIC', tick: number): number[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const v = mode === 'ARITHMETIC' ? lower + ((upper - lower) * i) / n : lower * (upper / lower) ** (i / n);
    return Math.round(v / tick) * tick;
  });
}

function preview(body: Record<string, unknown>) {
  const symbol = String(body.symbol);
  const p = pair(symbol);
  const lower = Number(body.lowerPrice);
  const upper = Number(body.upperPrice);
  const n = Number(body.gridCount);
  const investment = Number(body.investment);
  const last = price(symbol);
  if (!(lower < upper)) throw new MockError('INVALID_GRID', 'lowerPrice must be below upperPrice');
  if (!(lower < last && last < upper)) throw new MockError('INVALID_GRID', 'The current price must be inside the range');
  const levels = gridLevels(lower, upper, n, (body.mode as 'ARITHMETIC' | 'GEOMETRIC') ?? 'ARITHMETIC', Number(p.tick));
  if (new Set(levels.map((l) => l.toFixed(10))).size !== levels.length) throw new MockError('INVALID_GRID', 'Grid too dense for the tick size');
  const buyCells = levels.slice(0, -1).filter((l) => l < last);
  const sellCount = n - buyCells.length;
  const per = buyCells.reduce((a, l) => a + l, 0) + (sellCount * last) / 0.999;
  const q = stepFloor(investment / per, Number(p.step));
  const minQ = Math.max(Number(p.step), Number(p.minNotional) / levels[0]!);
  const minInvestment = Math.ceil(minQ * per * 100) / 100;
  if (q < minQ) throw new MockError('INVALID_GRID', 'Investment too small for this grid', { minInvestment: minInvestment.toFixed(2) });
  const profits = levels.slice(0, -1).map((l, i) => (levels[i + 1]! * 0.999 - l / 0.999) / (l / 0.999));
  return { levels, last, q, buyCells: buyCells.length, sellCount, minInvestment, profits, p };
}

/** What a running bot holds: base in its SELL orders, quote in its BUY orders + the spare investment. */
function gridHeld(b: MockPhase26State['grids'][number]) {
  const live = mockStore.openOrders.filter((o) => b.orderIds.includes(o.id));
  const base = live.filter((o) => o.side === 'SELL').reduce((a, o) => a + Number(o.quantity), 0);
  const quote = live.filter((o) => o.side === 'BUY').reduce((a, o) => a + Number(o.quantity) * Number(o.price), 0) + b.spare;
  return { live, base, quote };
}

function gridView(b: MockPhase26State['grids'][number]): GridBot {
  const { levels: _l, orderIds: _o, spare: _s, finalValue, ...bot } = b;
  const running = bot.status === 'RUNNING';
  const h = running ? gridHeld(b) : { live: [], base: 0, quote: 0 };
  // running: at the live price; stopped: the value when it stopped (the server does the same)
  const value = running ? h.base * price(b.symbol) + h.quote : finalValue;
  return {
    ...bot,
    baseHeld: f8(h.base),
    quoteHeld: f8(h.quote),
    totalValue: value === null ? null : f8(value),
    totalPnl: value === null ? null : f8(value - Number(bot.investment)),
    openOrders: h.live.length,
  };
}

function botOrder(bot: MockPhase26State['grids'][number], side: 'BUY' | 'SELL', px: number, qty: number): Order {
  const p = pair(bot.symbol);
  const t = now();
  const o: Order = {
    ...ORDER_DEFAULTS,
    id: nextId(),
    clientOrderId: `grid-${bot.id}-${mockStore.nextId}`,
    source: 'GRID',
    sourceId: bot.id,
    symbol: bot.symbol,
    side,
    type: 'LIMIT',
    timeInForce: 'GTC',
    status: 'NEW',
    price: fmtPrice(bot.symbol, px),
    stopPrice: null,
    quantity: qty.toFixed(dec(p.step)),
    quoteOrderQty: null,
    executedQty: '0',
    cumulativeQuoteQty: '0',
    avgPrice: null,
    createdAt: t,
    updatedAt: t,
  };
  mockStore.openOrders.unshift(o);
  emitUser({ kind: 'order', order: o });
  return o;
}

// ───────────────────────────── PnL (mock: deterministic series + the mock trades)

function pnlAnalysis(range: PnlRange): PnlAnalysis {
  const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 120;
  const end = Date.now();
  let cum = 0;
  const daily = Array.from({ length: days }, (_, i) => {
    const ms = end - (days - 1 - i) * DAY;
    const spot = empty() ? 0 : Math.round(Math.sin(i * 1.3) * 1800) / 100;
    const futures = empty() ? 0 : Math.round(Math.cos(i * 0.7) * 1200) / 100 - 2;
    cum += spot + futures;
    return { date: gmt7Date(ms), spot: f8(spot), futures: f8(futures), total: f8(spot + futures), cumulative: f8(cum) };
  });
  const spotTotal = daily.reduce((a, d) => a + Number(d.spot), 0);
  const futTotal = daily.reduce((a, d) => a + Number(d.futures), 0);
  const count = empty() ? 0 : days + 8;
  const wins = empty() ? 0 : Math.round(count * 0.56);
  return {
    range,
    from: range === 'all' ? null : new Date(end - days * DAY).toISOString(),
    to: new Date(end).toISOString(),
    totalRealized: f8(spotTotal + futTotal),
    spotRealized: f8(spotTotal),
    futuresRealized: f8(futTotal),
    futuresFees: empty() ? '0.00000000' : '-14.20000000',
    futuresFunding: empty() ? '0.00000000' : '-1.36000000',
    daily,
    trades: {
      count,
      wins,
      losses: count - wins,
      winRate: count ? (wins / count).toFixed(4) : null,
      avgWin: count ? '18.42000000' : null,
      avgLoss: count ? '-11.07000000' : null,
      largestWin: count ? '96.10000000' : null,
      largestLoss: count ? '-40.01000000' : null,
      profitFactor: count ? '2.1100' : null,
    },
    bySymbol: empty()
      ? []
      : [
          { market: 'SPOT', symbol: 'BTCUSDT', realized: '84.12000000', trades: 9, wins: 6 },
          { market: 'FUTURES', symbol: 'BTCUSDT', realized: '-12.40000000', trades: 5, wins: 2 },
          { market: 'SPOT', symbol: 'ETHUSDT', realized: '21.05000000', trades: 6, wins: 3 },
          { market: 'FUTURES', symbol: 'SOLUSDT', realized: '10.00000000', trades: 1, wins: 1 },
        ],
    maxDrawdown: empty() ? null : '0.0812',
  };
}

// ───────────────────────────── resolvers

type Phase26Endpoint =
  | 'updateProfile'
  | 'securityOverview'
  | 'setAntiPhishingCode'
  | 'loginHistory'
  | 'pnlAnalysis'
  | 'dcaPlans'
  | 'createDcaPlan'
  | 'updateDcaPlan'
  | 'cancelDcaPlan'
  | 'dcaRuns'
  | 'gridBotPreview'
  | 'gridBots'
  | 'createGridBot'
  | 'getGridBot'
  | 'stopGridBot'
  | 'gridBotOrders'
  | 'adminUserFuturesPositions'
  | 'adminUserBots'
  | 'adminStopGridBot'
  | 'adminCancelDcaPlan'
  | 'adminUserLoginHistory';

/** The mock signs in as the demo user: only that user has bots / positions / sign-ins in the admin views. */
const isDemoUser = (userId: string) => userId === mockMe().id;

/** Cancel the bot's orders, optionally sell what it holds, keep the final value (like the server). */
function stopGrid(bot: MockPhase26State['grids'][number], sellBase: boolean, reason: 'USER' | 'ADMIN'): GridBot {
  const base = MOCK_PAIRS[bot.symbol]!.base;
  const held = gridHeld(bot);
  for (const o of held.live) {
    if (o.side === 'BUY') adjust('USDT', Number(o.quantity) * Number(o.price), -Number(o.quantity) * Number(o.price));
    else adjust(base, Number(o.quantity), -Number(o.quantity));
    o.status = 'CANCELED';
    o.closeReason = 'BOT_STOPPED';
    mockStore.history.unshift(o);
    emitUser({ kind: 'order', order: o });
  }
  mockStore.openOrders = mockStore.openOrders.filter((x) => !bot.orderIds.includes(x.id));
  // only the bot's own base is sold (never the rest of the user's coins)
  const proceeds = held.base * price(bot.symbol) * 0.999;
  if (sellBase && held.base > 0) {
    adjust(base, -held.base);
    adjust('USDT', proceeds);
  }
  bot.finalValue = held.quote + (sellBase ? proceeds : held.base * price(bot.symbol));
  bot.status = 'STOPPED';
  bot.stopReason = reason;
  bot.stoppedAt = now();
  const view = gridView(bot);
  emitUser({ kind: 'gridBot', bot: view });
  notify({ type: 'GRID_BOT_STOPPED', botId: bot.id, symbol: bot.symbol, reason, gridProfit: bot.gridProfit });
  return view;
}

const plan = (id: string) => {
  const p = st().dca.find((x) => x.id === id);
  if (!p) throw new MockError('NOT_FOUND', 'Plan not found');
  return p;
};
const grid = (id: string) => {
  const b = st().grids.find((x) => x.id === id);
  if (!b) throw new MockError('NOT_FOUND', 'Bot not found');
  return b;
};
const security = () => ({
  twoFactorEnabled: mockStore.twoFactorEnabled,
  antiPhishingCode: st().antiPhishing ? `${st().antiPhishing!.slice(0, 2)}${'*'.repeat(st().antiPhishing!.length - 2)}` : null,
  emailVerified: mockStore.scenario !== 'unverified',
  passwordChangedAt: '2026-10-01T00:00:00.000Z',
  lastLogin: st().logins.find((l) => l.success) ?? null,
  activeSessions: 2,
});

export const phase26Resolvers: { [N in Phase26Endpoint]: Resolver<N> } = {
  updateProfile: ({ body }) => {
    requireUser();
    if (body.name !== undefined) st().name = String(body.name).trim();
    if (body.avatar !== undefined) st().avatar = body.avatar as AvatarId | null;
    return mockMe();
  },
  securityOverview: () => (requireUser(), security()),
  setAntiPhishingCode: ({ body }) => {
    requireUser();
    if (body.currentPassword === 'wrong') throw new MockError('VALIDATION_ERROR', 'Current password is incorrect', { field: 'currentPassword' });
    if (mockStore.twoFactorEnabled && (!body.twoFactorCode || body.twoFactorCode === '000000')) throw new MockError('INVALID_TWO_FACTOR_CODE', 'Invalid code');
    st().antiPhishing = body.code === null ? null : String(body.code);
    return security();
  },
  loginHistory: () => (requireUser(), { items: st().logins, nextCursor: null }),
  pnlAnalysis: ({ query }) => (requireUser(), pnlAnalysis((query.get('range') as PnlRange | null) ?? '30d')),

  dcaPlans: () => (requireUser(), { items: st().dca }),
  createDcaPlan: ({ body }) => {
    requireVerified();
    pair(String(body.symbol));
    if (st().dca.filter((p) => p.status !== 'CANCELED').length >= 20) throw new MockError('LIMIT_EXCEEDED', 'At most 20 plans', { limit: 20 });
    const p: DcaPlan = {
      id: nextId(),
      symbol: String(body.symbol),
      quoteAmount: f8(Number(body.quoteAmount)),
      interval: body.interval as DcaPlan['interval'],
      hour: Number(body.hour ?? 9),
      dayOfWeek: (body.dayOfWeek as number | undefined) ?? null,
      dayOfMonth: (body.dayOfMonth as number | undefined) ?? null,
      status: 'ACTIVE',
      nextRunAt: new Date(Date.now() + DAY).toISOString(),
      lastRunAt: null,
      runs: 0,
      skipped: 0,
      totalSpent: '0.00000000',
      totalBought: '0.00000000',
      avgPrice: null,
      createdAt: now(),
    };
    st().dca.unshift(p);
    emitUser({ kind: 'dcaPlan', plan: p });
    return p;
  },
  updateDcaPlan: ({ params, body }) => {
    requireVerified();
    const p = plan(params.planId!);
    if (p.status === 'CANCELED') throw new MockError('CONFLICT', 'Plan is canceled');
    if (body.quoteAmount !== undefined) p.quoteAmount = f8(Number(body.quoteAmount));
    if (body.status !== undefined) {
      p.status = body.status as 'ACTIVE' | 'PAUSED';
      p.nextRunAt = p.status === 'ACTIVE' ? new Date(Date.now() + DAY).toISOString() : null;
    }
    emitUser({ kind: 'dcaPlan', plan: p });
    return p;
  },
  cancelDcaPlan: ({ params }) => {
    requireUser();
    const p = plan(params.planId!);
    p.status = 'CANCELED';
    p.nextRunAt = null;
    emitUser({ kind: 'dcaPlan', plan: p });
    return p;
  },
  dcaRuns: ({ params }) => (requireUser(), plan(params.planId!), { items: st().dcaRuns.filter((r) => r.planId === params.planId), nextCursor: null }),

  gridBotPreview: ({ body }) => {
    requireUser();
    const g = preview(body);
    return {
      levels: g.levels.map((l) => fmtPrice(String(body.symbol), l)),
      lastPrice: fmtPrice(String(body.symbol), g.last),
      quantityPerGrid: g.q.toFixed(dec(g.p.step)),
      buyOrders: g.buyCells,
      sellOrders: g.sellCount,
      initialBuyQuantity: (g.q * g.sellCount).toFixed(dec(g.p.step)),
      profitPerGridMin: Math.min(...g.profits).toFixed(6),
      profitPerGridMax: Math.max(...g.profits).toFixed(6),
      minInvestment: g.minInvestment.toFixed(2),
    };
  },
  gridBots: () => (requireUser(), { items: st().grids.map(gridView) }),
  createGridBot: ({ body }) => {
    requireVerified();
    const g = preview(body);
    if (st().grids.filter((b) => b.status === 'RUNNING').length >= 5) throw new MockError('LIMIT_EXCEEDED', 'At most 5 running grid bots', { limit: 5 });
    const investment = Number(body.investment);
    if ((mockStore.balances.USDT?.available ?? 0) < investment) throw new MockError('INSUFFICIENT_BALANCE', 'Insufficient USDT balance');
    const bot: MockPhase26State['grids'][number] = {
      id: nextId(),
      symbol: String(body.symbol),
      lowerPrice: fmtPrice(String(body.symbol), Number(body.lowerPrice)),
      upperPrice: fmtPrice(String(body.symbol), Number(body.upperPrice)),
      gridCount: Number(body.gridCount),
      mode: (body.mode as GridBot['mode']) ?? 'ARITHMETIC',
      investment: f8(investment),
      quantityPerGrid: g.q.toFixed(dec(g.p.step)),
      status: 'RUNNING',
      stopReason: null,
      gridProfit: '0.00000000',
      completedRounds: 0,
      baseHeld: '0',
      quoteHeld: '0',
      totalValue: null,
      totalPnl: null,
      openOrders: 0,
      createdAt: now(),
      stoppedAt: null,
      levels: g.levels,
      orderIds: [],
      // what is not reserved by a BUY order nor spent on the initial buy
      spare: investment - g.levels.slice(0, -1).filter((l) => l < g.last).reduce((a, l) => a + l * g.q, 0) - g.q * g.sellCount * g.last,
      finalValue: null,
    };
    // market-buy the base for the sell cells, then one order per cell
    adjust('USDT', -g.q * g.sellCount * g.last);
    adjust(g.p.base, g.q * g.sellCount);
    g.levels.slice(0, -1).forEach((l, i) => {
      const o = l < g.last ? botOrder(bot, 'BUY', l, g.q) : botOrder(bot, 'SELL', g.levels[i + 1]!, g.q);
      if (o.side === 'BUY') adjust('USDT', -g.q * l, g.q * l);
      else adjust(g.p.base, -g.q, g.q);
      bot.orderIds.push(o.id);
    });
    st().grids.unshift(bot);
    const view = gridView(bot);
    emitUser({ kind: 'gridBot', bot: view });
    return view;
  },
  getGridBot: ({ params }) => (requireUser(), gridView(grid(params.botId!))),
  stopGridBot: ({ params, body }) => {
    requireUser();
    const bot = grid(params.botId!);
    if (bot.status !== 'RUNNING') throw new MockError('CONFLICT', 'Bot is not running');
    return stopGrid(bot, Boolean(body.sellBase), 'USER');
  },
  gridBotOrders: ({ params }) => {
    requireUser();
    const bot = grid(params.botId!);
    return { items: [...mockStore.openOrders, ...mockStore.history].filter((o) => bot.orderIds.includes(o.id)).slice(0, 100) };
  },

  // ---- admin (support views of a user's futures, bots and sign-ins)
  adminUserFuturesPositions: ({ params, query }) => {
    requireStaff('users.read');
    findUser(params.userId!);
    if (!isDemoUser(params.userId!) || empty()) return { items: [], nextCursor: null };
    const f = mockStore.futures;
    return { items: (query.get('open') === 'false' ? f.closed : f.positions).map(viewPosition), nextCursor: null };
  },
  adminUserBots: ({ params }) => {
    requireStaff('users.read');
    findUser(params.userId!);
    if (!isDemoUser(params.userId!)) return { grid: [], dca: [] };
    const running = (s: string) => (s === 'RUNNING' || s === 'ACTIVE' ? 0 : 1);
    return { grid: st().grids.map(gridView).sort((a, b) => running(a.status) - running(b.status)), dca: [...st().dca].sort((a, b) => running(a.status) - running(b.status)) };
  },
  adminStopGridBot: ({ params, body }) => {
    requireStaff('bots.manage');
    findUser(params.userId!);
    const bot = isDemoUser(params.userId!) ? st().grids.find((b) => b.id === params.botId) : undefined;
    if (!bot) throw new MockError('NOT_FOUND', 'Bot not found');
    if (bot.status !== 'RUNNING') throw new MockError('CONFLICT', 'Bot is not running');
    audit({ action: 'GRID_BOT_STOP', targetType: 'USER', targetId: params.userId!, before: { botId: bot.id, symbol: bot.symbol, status: 'RUNNING' }, after: { status: 'STOPPED', sellBase: Boolean(body.sellBase) }, reason: String(body.reason) });
    return stopGrid(bot, Boolean(body.sellBase), 'ADMIN');
  },
  adminCancelDcaPlan: ({ params, body }) => {
    requireStaff('bots.manage');
    findUser(params.userId!);
    const p = isDemoUser(params.userId!) ? st().dca.find((x) => x.id === params.planId) : undefined;
    if (!p) throw new MockError('NOT_FOUND', 'Plan not found');
    if (p.status === 'CANCELED') throw new MockError('CONFLICT', 'The plan is already canceled');
    audit({ action: 'DCA_PLAN_CANCEL', targetType: 'USER', targetId: params.userId!, before: { planId: p.id, symbol: p.symbol, status: p.status }, after: { status: 'CANCELED' }, reason: String(body.reason) });
    p.status = 'CANCELED';
    p.nextRunAt = null;
    emitUser({ kind: 'dcaPlan', plan: p });
    return p;
  },
  adminUserLoginHistory: ({ params }) => {
    requireStaff('users.read');
    findUser(params.userId!);
    return { items: isDemoUser(params.userId!) ? st().logins : [], nextCursor: null };
  },
};
