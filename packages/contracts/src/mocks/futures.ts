/**
 * ⚠️ Mock futures engine + resolvers — UI development only. Simplified on purpose (JS numbers,
 * fills at the mock price). The real rules live on the server; the UI must not copy this math.
 */
import type { FuturesAccount, FuturesOrder, FuturesPosition, FuturesTrade, LedgerEntry, OrderSide } from '../index.ts';
import {
  fixtureFundingEvents,
  fixtureFuturesCandles,
  fixtureFuturesDepth,
  fixtureFuturesExchangeInfo,
  fixtureFuturesTicker,
  fixtureMarkPrice,
  fmtFuturesPrice,
  fmtFuturesQty,
  MOCK_FUNDING_RATE,
  MOCK_FUTURES,
  MOCK_FUTURES_FROZEN,
  mockFuturesPrice,
  mockMmr,
  nextFundingTime,
} from '../fixtures/futures.ts';
import { fixtureMarketStatus } from '../fixtures/index.ts';
import { MockError, mockMe, now, requireStaff, requireUser, requireVerified, type Resolver } from './common.ts';
import { adjust, balanceOf, emitUser, mockStore, nextId, notify } from './store.ts';
import type { MockPosition } from './futuresState.ts';

const MAKER = 0.0002;
const TAKER = 0.0005;
const LIQ_FEE = 0.005;
const f8 = (n: number) => (Math.round(n * 1e8) / 1e8).toFixed(8);
const fs = () => mockStore.futures;
const priceOf = (symbol: string) => fs().prices[symbol]!;
const markOf = (symbol: string): number | null => (symbol === 'LINKUSDT' ? null : priceOf(symbol));
const dirOf = (side: 'LONG' | 'SHORT') => (side === 'LONG' ? 1 : -1);
const lev = (symbol: string) => fs().leverage[symbol] ?? 10;
const isMultiple = (v: number, step: number) => Math.abs(Math.round(v / step) * step - v) < step * 1e-6;

const contract = (symbol: string) => {
  const c = MOCK_FUTURES[symbol];
  const admin = fs().symbols.find((s) => s.symbol === symbol);
  if (!c || !admin) throw new MockError('NOT_FOUND', `Unknown futures symbol ${symbol}`);
  return { c, admin };
};

function requireTradable(symbol: string) {
  if (mockStore.scenario === 'halted' || mockStore.settings.tradingHalted) throw new MockError('TRADING_HALTED', 'Trading is halted by the operator');
  const { admin } = contract(symbol);
  if (!admin.enabled) throw new MockError('SYMBOL_DISABLED', `${symbol} is not tradable`);
  if (MOCK_FUTURES_FROZEN.has(symbol)) throw new MockError('MARKET_DATA_STALE', 'Market data is not live; trading paused');
}

// ───────────────────────────── views

function liqPrice(p: MockPosition): number | null {
  const mmr = mockMmr(p.symbol);
  const v = p.side === 'LONG' ? (p.entry * p.qty - p.margin) / (p.qty * (1 - mmr)) : (p.entry * p.qty + p.margin) / (p.qty * (1 + mmr));
  return v > 0 ? v : null;
}

export function viewPosition(p: MockPosition): FuturesPosition {
  const mark = p.status === 'OPEN' ? markOf(p.symbol) : null;
  const upnl = mark === null ? null : (mark - p.entry) * p.qty * dirOf(p.side);
  const liq = p.status === 'OPEN' ? liqPrice(p) : null;
  return {
    id: p.id,
    symbol: p.symbol,
    side: p.side,
    status: p.status,
    marginMode: 'ISOLATED',
    quantity: fmtFuturesQty(p.symbol, p.qty),
    maxQuantity: fmtFuturesQty(p.symbol, p.maxQty),
    entryPrice: String(Number(p.entry.toFixed(8))),
    closePrice: p.closedQty > 0 ? String(Number((p.closedNotional / p.closedQty).toFixed(8))) : null,
    leverage: p.leverage,
    margin: f8(p.margin),
    markPrice: mark === null ? null : fmtFuturesPrice(p.symbol, mark),
    unrealizedPnl: upnl === null ? null : f8(upnl),
    returnOnMargin: upnl === null || p.margin <= 0 ? null : (upnl / p.margin).toFixed(4),
    liquidationPrice: liq === null ? null : fmtFuturesPrice(p.symbol, liq),
    maintenanceMargin: mark === null ? null : f8(mark * p.qty * mockMmr(p.symbol)),
    realizedPnl: f8(p.realized),
    fees: f8(p.fees),
    funding: f8(p.funding),
    takeProfitPrice: p.tp === null ? null : fmtFuturesPrice(p.symbol, p.tp),
    stopLossPrice: p.sl === null ? null : fmtFuturesPrice(p.symbol, p.sl),
    closeReason: p.closeReason,
    openedAt: p.openedAt,
    closedAt: p.closedAt,
    updatedAt: p.updatedAt,
  };
}

export function viewAccount(): FuturesAccount {
  const s = fs();
  const positionMargin = s.positions.reduce((a, p) => a + p.margin, 0);
  const orderMargin = s.orders.reduce((a, o) => a + Number(o.lockedAmount), 0);
  const marks = s.positions.map((p) => markOf(p.symbol));
  const upnl = marks.some((m) => m === null) ? null : s.positions.reduce((a, p, i) => a + (marks[i]! - p.entry) * p.qty * dirOf(p.side), 0);
  const wallet = s.available + positionMargin + orderMargin;
  return {
    asset: 'USDT',
    walletBalance: f8(wallet),
    available: f8(s.available),
    positionMargin: f8(positionMargin),
    orderMargin: f8(orderMargin),
    unrealizedPnl: upnl === null ? null : f8(upnl),
    equity: upnl === null ? null : f8(wallet + upnl),
    openPositions: s.positions.length,
  };
}

function ledger(type: LedgerEntry['type'], dA: number, dL: number, refType: LedgerEntry['refType'], refId: string) {
  const s = fs();
  const locked = s.positions.reduce((a, p) => a + p.margin, 0) + s.orders.reduce((a, o) => a + Number(o.lockedAmount), 0);
  s.ledger.unshift({ id: nextId(), account: 'FUTURES', asset: 'USDT', type, deltaAvailable: f8(dA), deltaLocked: f8(dL), availableAfter: f8(s.available), lockedAfter: f8(locked), refType, refId, createdAt: now() });
}

const emitAccount = () => emitUser({ kind: 'futuresAccount', account: viewAccount() });
const emitPosition = (p: MockPosition) => emitUser({ kind: 'futuresPosition', position: viewPosition(p) });
const emitOrder = (o: FuturesOrder) => emitUser({ kind: 'futuresOrder', order: o });

// ───────────────────────────── engine

function finishOrder(o: FuturesOrder, status: FuturesOrder['status'], reason: string | null = null) {
  const s = fs();
  s.available += Number(o.lockedAmount);
  o.lockedAmount = '0.00000000';
  o.status = status;
  o.closeReason = reason;
  o.updatedAt = now();
  s.orders = s.orders.filter((x) => x.id !== o.id);
  s.history.unshift(o);
}

/** One fill of `qty` at `price` (closing part first, then opening part — one-way mode). */
function fill(o: FuturesOrder, qty: number, price: number, liquidity: 'MAKER' | 'TAKER', fromReservation: boolean) {
  const s = fs();
  const sym = o.symbol;
  const side: 'LONG' | 'SHORT' = o.side === 'BUY' ? 'LONG' : 'SHORT';
  const rate = liquidity === 'MAKER' ? MAKER : TAKER;
  let pos = s.positions.find((p) => p.symbol === sym);
  let closeQty = pos && pos.side !== side ? Math.min(qty, pos.qty) : 0;
  const openQty = o.reduceOnly ? 0 : qty - closeQty;
  if (o.reduceOnly) closeQty = Math.min(qty, pos?.qty ?? 0);
  let realized = 0;
  let fee = 0;
  const t = now();

  if (closeQty > 0 && pos) {
    const released = closeQty >= pos.qty ? pos.margin : (pos.margin * closeQty) / pos.qty;
    realized = (price - pos.entry) * closeQty * dirOf(pos.side);
    const closeFee = price * closeQty * rate;
    const payout = Math.max(0, released + realized - closeFee);
    fee += Math.min(closeFee, Math.max(0, released + realized));
    s.available += payout;
    pos.margin -= released;
    pos.qty -= closeQty;
    pos.realized += realized;
    pos.fees += closeFee;
    pos.closedQty += closeQty;
    pos.closedNotional += price * closeQty;
    pos.updatedAt = t;
    ledger('REALIZED_PNL', payout, -released, 'FUTURES_POSITION', pos.id);
    if (pos.qty <= 1e-12) {
      pos.qty = 0;
      pos.margin = 0;
      pos.status = 'CLOSED';
      pos.closedAt = t;
      pos.closeReason = o.purpose === 'TAKE_PROFIT' ? 'TAKE_PROFIT' : o.purpose === 'STOP_LOSS' ? 'STOP_LOSS' : o.purpose === 'LIQUIDATION' ? 'LIQUIDATION' : 'USER';
      s.positions = s.positions.filter((p) => p.id !== pos!.id);
      s.closed.unshift(pos);
      // reduce-only orders have nothing left to reduce
      for (const r of s.orders.filter((x) => x.symbol === sym && x.reduceOnly)) finishOrder(r, 'CANCELED', 'REDUCE_ONLY');
    }
    emitPosition(pos);
    pos = s.positions.find((p) => p.symbol === sym);
  }

  if (openQty > 0) {
    const leverage = o.leverage;
    const im = (price * openQty) / leverage;
    const openFee = price * openQty * rate;
    if (fromReservation) {
      const share = (Number(o.lockedAmount) * openQty) / (Number(o.quantity) - Number(o.executedQty));
      o.lockedAmount = f8(Number(o.lockedAmount) - share);
      s.available += share - im - openFee;
    } else {
      if (s.available < im + openFee) throw new MockError('INSUFFICIENT_BALANCE', 'Insufficient USDT balance', { asset: 'USDT', available: f8(s.available), required: f8(im + openFee) });
      s.available -= im + openFee;
    }
    fee += openFee;
    if (!pos) {
      pos = { id: nextId(), symbol: sym, side, status: 'OPEN', qty: 0, maxQty: 0, entry: price, margin: 0, leverage, realized: 0, fees: 0, funding: 0, closedQty: 0, closedNotional: 0, tp: null, sl: null, closeReason: null, openedAt: t, closedAt: null, updatedAt: t };
      s.positions.push(pos);
    }
    pos.entry = (pos.entry * pos.qty + price * openQty) / (pos.qty + openQty);
    pos.qty += openQty;
    pos.maxQty = Math.max(pos.maxQty, pos.qty);
    pos.margin += im;
    pos.fees += openFee;
    pos.updatedAt = t;
    const tpsl = s.pendingTpSl[o.id];
    if (tpsl?.takeProfitPrice !== undefined) pos.tp = tpsl.takeProfitPrice === null ? null : Number(tpsl.takeProfitPrice);
    if (tpsl?.stopLossPrice !== undefined) pos.sl = tpsl.stopLossPrice === null ? null : Number(tpsl.stopLossPrice);
    ledger('FEE', -openFee, 0, 'FUTURES_ORDER', o.id);
    emitPosition(pos);
  }

  const executed = Number(o.executedQty) + qty;
  o.avgPrice = fmtFuturesPrice(sym, ((Number(o.avgPrice ?? 0) * Number(o.executedQty)) + price * qty) / executed);
  o.executedQty = fmtFuturesQty(sym, executed);
  o.fee = f8(Number(o.fee) + fee);
  o.realizedPnl = f8(Number(o.realizedPnl) + realized);
  o.updatedAt = t;
  const trade: FuturesTrade = { id: nextId(), orderId: o.id, symbol: sym, side: o.side, price: fmtFuturesPrice(sym, price), quantity: fmtFuturesQty(sym, qty), quoteQty: f8(price * qty), fee: f8(fee), feeAsset: 'USDT', liquidity, realizedPnl: f8(realized), createdAt: t };
  fs().trades.unshift(trade);
  emitUser({ kind: 'futuresTrade', trade });
}

function newOrder(symbol: string, side: OrderSide, type: 'MARKET' | 'LIMIT', qty: number, opts: { price?: number; tif?: 'GTC' | 'IOC'; reduceOnly?: boolean; purpose?: FuturesOrder['purpose']; clientOrderId?: string }): FuturesOrder {
  const t = now();
  const id = nextId();
  return {
    id, clientOrderId: opts.clientOrderId ?? `mock-${id}`, symbol, side, type, purpose: opts.purpose ?? 'TRADE', timeInForce: type === 'LIMIT' ? (opts.tif ?? 'GTC') : null,
    price: opts.price === undefined ? null : fmtFuturesPrice(symbol, opts.price), quantity: fmtFuturesQty(symbol, qty), executedQty: fmtFuturesQty(symbol, 0), avgPrice: null,
    reduceOnly: opts.reduceOnly ?? false, leverage: lev(symbol), status: 'NEW', lockedAmount: '0.00000000', fee: '0.00000000', realizedPnl: '0.00000000', closeReason: null, createdAt: t, updatedAt: t,
  };
}

/** Market close used by the user's close button, TP/SL and liquidation. */
function marketClose(p: MockPosition, qty: number, purpose: FuturesOrder['purpose']): FuturesOrder {
  const o = newOrder(p.symbol, p.side === 'LONG' ? 'SELL' : 'BUY', 'MARKET', qty, { reduceOnly: true, purpose });
  const px = priceOf(p.symbol) * (p.side === 'LONG' ? 0.9999 : 1.0001);
  fill(o, qty, px, 'TAKER', false);
  o.status = 'FILLED';
  fs().history.unshift(o);
  emitOrder(o);
  emitAccount();
  return o;
}

function liquidate(p: MockPosition) {
  const s = fs();
  const mark = priceOf(p.symbol);
  const realized = (mark - p.entry) * p.qty * dirOf(p.side);
  const left = p.margin + realized;
  const fee = Math.min(Math.max(0, left), mark * p.qty * LIQ_FEE);
  const payout = Math.max(0, left - fee);
  const lost = p.margin - payout;
  const o = newOrder(p.symbol, p.side === 'LONG' ? 'SELL' : 'BUY', 'MARKET', p.qty, { reduceOnly: true, purpose: 'LIQUIDATION' });
  o.status = 'FILLED';
  o.executedQty = o.quantity;
  o.avgPrice = fmtFuturesPrice(p.symbol, mark);
  o.fee = f8(fee);
  o.realizedPnl = f8(realized);
  o.closeReason = 'LIQUIDATED';
  s.available += payout;
  ledger('LIQUIDATION', payout, -p.margin, 'FUTURES_POSITION', p.id);
  Object.assign(p, { realized: p.realized + realized, fees: p.fees + fee, closedQty: p.closedQty + p.qty, closedNotional: p.closedNotional + mark * p.qty, qty: 0, margin: 0, status: 'CLOSED', closeReason: 'LIQUIDATION', closedAt: now(), updatedAt: now() });
  s.positions = s.positions.filter((x) => x.id !== p.id);
  s.closed.unshift(p);
  s.history.unshift(o);
  for (const r of s.orders.filter((x) => x.symbol === p.symbol && x.reduceOnly)) finishOrder(r, 'CANCELED', 'REDUCE_ONLY');
  emitOrder(o);
  emitPosition(p);
  emitAccount();
  notify({ type: 'POSITION_LIQUIDATED', positionId: p.id, symbol: p.symbol, side: p.side, quantity: o.quantity, markPrice: o.avgPrice!, lostMargin: f8(lost) });
}

/** Runs the mock engine for one symbol at its current price (limit fills, TP/SL, liquidation). */
export function mockFuturesProcess(symbol: string): void {
  const s = fs();
  if (MOCK_FUTURES_FROZEN.has(symbol)) return;
  const px = priceOf(symbol);
  for (const o of s.orders.filter((x) => x.symbol === symbol && x.type === 'LIMIT')) {
    const limit = Number(o.price);
    if ((o.side === 'BUY' && px < limit) || (o.side === 'SELL' && px > limit)) {
      try {
        fill(o, Number(o.quantity) - Number(o.executedQty), limit, 'MAKER', true);
        finishOrder(o, 'FILLED');
        delete s.pendingTpSl[o.id];
        emitOrder(o);
        emitAccount();
        notify({ type: 'FUTURES_ORDER_FILLED', orderId: o.id, symbol: o.symbol, side: o.side, executedQty: o.executedQty, avgPrice: o.avgPrice! });
      } catch {
        // mock: leave it resting
      }
    }
  }
  const p = s.positions.find((x) => x.symbol === symbol);
  if (!p) return;
  const liq = liqPrice(p);
  if (liq !== null && ((p.side === 'LONG' && px <= liq) || (p.side === 'SHORT' && px >= liq))) return liquidate(p);
  const hit = p.tp !== null && ((p.side === 'LONG' && px >= p.tp) || (p.side === 'SHORT' && px <= p.tp)) ? 'TAKE_PROFIT' : p.sl !== null && ((p.side === 'LONG' && px <= p.sl) || (p.side === 'SHORT' && px >= p.sl)) ? 'STOP_LOSS' : null;
  if (hit) {
    const qty = p.qty;
    const o = marketClose(p, qty, hit);
    notify({ type: 'POSITION_TPSL', positionId: p.id, symbol: p.symbol, side: p.side, reason: hit, quantity: fmtFuturesQty(p.symbol, qty), price: o.avgPrice!, realizedPnl: o.realizedPnl });
  }
}

/** Called by the mock realtime tick: follow the spot mock prices, run the engine, settle funding. */
export function mockFuturesTick(nowMs = Date.now()): void {
  const s = fs();
  for (const sym of Object.keys(MOCK_FUTURES)) {
    if (MOCK_FUTURES_FROZEN.has(sym) || s.manual?.has(sym)) continue;
    s.prices[sym] = mockFuturesPrice(sym, mockStore.prices);
    mockFuturesProcess(sym);
  }
  const due = nextFundingTime(nowMs) - 28_800_000;
  if (s.lastFundingAt === 0) s.lastFundingAt = due;
  if (due > s.lastFundingAt) mockSettleFunding(due);
}

/** Pays funding on every open position (rate 0.01 %: LONG pays, SHORT receives). */
export function mockSettleFunding(at = Date.now()): void {
  const s = fs();
  s.lastFundingAt = at;
  for (const p of s.positions) {
    const pay = priceOf(p.symbol) * p.qty * Number(MOCK_FUNDING_RATE) * -dirOf(p.side);
    p.margin = Math.max(0, p.margin + pay);
    p.funding += pay;
    p.updatedAt = now();
    ledger('FUNDING_FEE', 0, pay, 'FUTURES_POSITION', p.id);
    emitPosition(p);
  }
  if (s.positions.length) emitAccount();
}

/** Test/dev helper: pin a futures price (stops following spot) and run the engine on it. */
export function setMockFuturesPrice(symbol: string, price: number): void {
  const s = fs();
  (s.manual ??= new Set()).add(symbol);
  s.prices[symbol] = price;
  mockFuturesProcess(symbol);
}

// ───────────────────────────── resolvers

const positionOf = (symbol: string) => {
  const p = fs().positions.find((x) => x.symbol === symbol);
  if (!p) throw new MockError('NOT_FOUND', 'No open position');
  return p;
};

function checkTpSl(side: 'LONG' | 'SHORT', mark: number, tp: number | null | undefined, sl: number | null | undefined) {
  const bad = (tp != null && (side === 'LONG' ? tp <= mark : tp >= mark)) || (sl != null && (side === 'LONG' ? sl >= mark : sl <= mark));
  if (bad) throw new MockError('INVALID_TPSL', 'LONG: take-profit above and stop-loss below the mark price (SHORT: the opposite)');
}

type FuturesEndpoint =
  | 'futuresExchangeInfo'
  | 'futuresTickers'
  | 'futuresMarkPrice'
  | 'futuresDepth'
  | 'futuresMarketTrades'
  | 'futuresCandles'
  | 'futuresFundingHistory'
  | 'futuresMarketStatus'
  | 'futuresAccount'
  | 'futuresTransfer'
  | 'futuresLedger'
  | 'futuresSymbolSettings'
  | 'futuresSetLeverage'
  | 'futuresPlaceOrder'
  | 'futuresOpenOrders'
  | 'futuresOrderHistory'
  | 'futuresCancelOrder'
  | 'futuresCancelAll'
  | 'futuresMyTrades'
  | 'futuresPositions'
  | 'futuresPositionHistory'
  | 'futuresClosePosition'
  | 'futuresAdjustMargin'
  | 'futuresSetTpSl'
  | 'adminFuturesSymbols'
  | 'adminUpdateFuturesSymbol';

const empty = () => mockStore.scenario === 'empty';
const bySymbol = <T extends { symbol: string }>(items: T[], symbol: string | null) => items.filter((x) => !symbol || x.symbol === symbol);

export const futuresResolvers: { [N in FuturesEndpoint]: Resolver<N> } = {
  futuresExchangeInfo: () => ({
    ...fixtureFuturesExchangeInfo,
    tradingHalted: mockStore.scenario === 'halted' || mockStore.settings.tradingHalted,
    symbols: fs().symbols.map(({ sourceStatus: _s, adminEnabled: _a, openPositions: _p, openOrders: _o, updatedAt: _u, ...info }) => info),
    serverTime: now(),
  }),
  futuresTickers: () => ({ items: Object.keys(MOCK_FUTURES).map((s) => fixtureFuturesTicker(s, priceOf(s))) }),
  futuresMarkPrice: ({ params }) => (contract(params.symbol!), fixtureMarkPrice(params.symbol!, priceOf(params.symbol!))),
  futuresDepth: ({ params, query }) => (contract(params.symbol!), fixtureFuturesDepth(params.symbol!, priceOf(params.symbol!), Math.min(20, Number(query.get('limit') ?? 20)))),
  futuresMarketTrades: ({ params, query }) => {
    const sym = params.symbol!;
    contract(sym);
    const p = priceOf(sym);
    const n = Math.min(Number(query.get('limit') ?? 20), 100);
    return { symbol: sym, items: Array.from({ length: n }, (_, i) => ({ id: 90000 - i, price: fmtFuturesPrice(sym, p * (1 + Math.sin(i) / 2000)), qty: fmtFuturesQty(sym, Number(MOCK_FUTURES[sym]!.minQty) * (1 + (i % 7))), time: Date.now() - i * 1500, isBuyerMaker: i % 3 === 0 })), status: MOCK_FUTURES_FROZEN.has(sym) ? 'STALE' : 'LIVE' };
  },
  futuresCandles: ({ params, query }) => {
    const sym = params.symbol!;
    contract(sym);
    const interval = (query.get('interval') ?? '1m') as Parameters<typeof fixtureFuturesCandles>[1];
    return { symbol: sym, interval, items: fixtureFuturesCandles(sym, interval, priceOf(sym), Number(query.get('limit') ?? 200), Date.now()) };
  },
  futuresFundingHistory: ({ params, query }) => (contract(params.symbol!), { items: empty() ? [] : fixtureFundingEvents(params.symbol!, priceOf(params.symbol!), Number(query.get('limit') ?? 10)) }),
  futuresMarketStatus: () => ({ ...fixtureMarketStatus, symbols: Object.keys(MOCK_FUTURES).map((symbol) => ({ symbol, status: symbol === 'LINKUSDT' ? ('UNAVAILABLE' as const) : symbol === 'AVAXUSDT' ? ('STALE' as const) : ('LIVE' as const), lastUpdateAt: symbol === 'LINKUSDT' ? null : now() })) }),

  futuresAccount: () => (requireUser(), viewAccount()),
  futuresTransfer: ({ body }) => {
    requireVerified();
    const amount = Number(body.amount);
    const s = fs();
    if (body.direction === 'SPOT_TO_FUTURES') {
      if ((mockStore.balances.USDT?.available ?? 0) < amount) throw new MockError('INSUFFICIENT_BALANCE', 'Insufficient USDT balance');
      adjust('USDT', -amount);
      s.available += amount;
      ledger('TRANSFER', amount, 0, 'TRANSFER', nextId());
    } else {
      if (s.available < amount) throw new MockError('INSUFFICIENT_BALANCE', 'Insufficient futures USDT balance');
      s.available -= amount;
      adjust('USDT', amount);
      ledger('TRANSFER', -amount, 0, 'TRANSFER', nextId());
    }
    emitAccount();
    return { spot: balanceOf('USDT'), futures: viewAccount() };
  },
  futuresLedger: ({ query }) => {
    requireUser();
    const hide = query.get('hideLocks') !== 'false';
    return { items: fs().ledger.filter((e) => !hide || (e.type !== 'ORDER_LOCK' && e.type !== 'ORDER_UNLOCK')), nextCursor: null };
  },
  futuresSymbolSettings: () => (requireUser(), { items: Object.keys(MOCK_FUTURES).map((symbol) => ({ symbol, leverage: lev(symbol), marginMode: 'ISOLATED' as const })) }),
  futuresSetLeverage: ({ params, body }) => {
    requireVerified();
    const sym = params.symbol!;
    const { admin } = contract(sym);
    const leverage = Number(body.leverage);
    if (leverage > admin.maxLeverage) throw new MockError('INVALID_LEVERAGE', `Max leverage on ${sym} is ${admin.maxLeverage}x`, { maxLeverage: admin.maxLeverage });
    if (fs().positions.some((p) => p.symbol === sym) || fs().orders.some((o) => o.symbol === sym)) {
      throw new MockError('LEVERAGE_LOCKED', 'Close the position and cancel open orders on this symbol first');
    }
    fs().leverage[sym] = leverage;
    return { symbol: sym, leverage, marginMode: 'ISOLATED' as const };
  },

  futuresPlaceOrder: ({ body }) => {
    requireVerified();
    const sym = String(body.symbol);
    requireTradable(sym);
    const { c, admin } = contract(sym);
    const s = fs();
    const qty = Number(body.quantity);
    const type = body.type as 'MARKET' | 'LIMIT';
    const price = type === 'LIMIT' ? Number(body.price) : priceOf(sym);
    if (!isMultiple(qty, Number(c.step))) throw new MockError('QUANTITY_STEP_SIZE', `Quantity must be a multiple of ${c.step}`);
    if (qty < Number(c.minQty)) throw new MockError('QUANTITY_TOO_SMALL', `Minimum quantity is ${c.minQty}`);
    if (type === 'LIMIT' && !isMultiple(price, Number(c.tick))) throw new MockError('PRICE_TICK_SIZE', `Price must be a multiple of ${c.tick}`);
    if (price * qty < Number(c.minNotional)) throw new MockError('NOTIONAL_TOO_SMALL', `Minimum order value is ${c.minNotional} USDT`);
    if (lev(sym) > admin.maxLeverage) throw new MockError('INVALID_LEVERAGE', `Max leverage on ${sym} is ${admin.maxLeverage}x`, { maxLeverage: admin.maxLeverage });
    const pos = s.positions.find((p) => p.symbol === sym);
    const reduceOnly = Boolean(body.reduceOnly);
    const side = body.side as OrderSide;
    if (reduceOnly && (!pos || (pos.side === 'LONG') === (side === 'BUY') || qty > pos.qty + 1e-12)) {
      throw new MockError('REDUCE_ONLY_REJECTED', 'Reduce-only needs an opposite position at least as large as the order');
    }
    const tpsl = body.tpsl as { takeProfitPrice?: string | null; stopLossPrice?: string | null } | undefined;
    if (tpsl && !reduceOnly) checkTpSl(side === 'BUY' ? 'LONG' : 'SHORT', priceOf(sym), tpsl.takeProfitPrice == null ? tpsl.takeProfitPrice : Number(tpsl.takeProfitPrice), tpsl.stopLossPrice == null ? tpsl.stopLossPrice : Number(tpsl.stopLossPrice));
    const o = newOrder(sym, side, type, qty, { price: type === 'LIMIT' ? price : undefined, tif: body.timeInForce as 'GTC' | 'IOC' | undefined, reduceOnly, clientOrderId: body.clientOrderId as string | undefined });
    if (tpsl && !reduceOnly) s.pendingTpSl[o.id] = tpsl;
    const market = priceOf(sym);
    const marketable = type === 'MARKET' || (side === 'BUY' ? price >= market : price <= market);
    if (marketable) {
      // market: a small slippage; marketable limit: fills at the better of the limit and the market
      const px = type === 'MARKET' ? market * (side === 'BUY' ? 1.0001 : 0.9999) : side === 'BUY' ? Math.min(price, market) : Math.max(price, market);
      fill(o, qty, px, 'TAKER', false);
      delete s.pendingTpSl[o.id];
      o.status = 'FILLED';
      s.history.unshift(o);
    } else if (o.timeInForce === 'IOC') {
      o.status = 'EXPIRED';
      o.closeReason = 'IOC_EXPIRED';
      s.history.unshift(o);
    } else {
      const reserve = reduceOnly ? price * qty * TAKER : (price * qty) / lev(sym) + price * qty * TAKER;
      if (s.available < reserve) throw new MockError('INSUFFICIENT_BALANCE', 'Insufficient USDT balance', { asset: 'USDT', available: f8(s.available), required: f8(reserve) });
      s.available -= reserve;
      o.lockedAmount = f8(reserve);
      s.orders.unshift(o);
      ledger('ORDER_LOCK', -reserve, reserve, 'FUTURES_ORDER', o.id);
    }
    emitOrder(o);
    emitAccount();
    return o;
  },
  futuresOpenOrders: ({ query }) => (requireUser(), { items: empty() ? [] : bySymbol(fs().orders, query.get('symbol')) }),
  futuresOrderHistory: ({ query }) => (requireUser(), { items: empty() ? [] : bySymbol(fs().history, query.get('symbol')), nextCursor: null }),
  futuresCancelOrder: ({ params }) => {
    requireUser();
    const o = fs().orders.find((x) => x.id === params.orderId);
    if (!o) throw new MockError('NOT_FOUND', 'Order not found');
    finishOrder(o, 'CANCELED', 'USER_CANCELED');
    delete fs().pendingTpSl[o.id];
    emitOrder(o);
    emitAccount();
    return o;
  },
  futuresCancelAll: ({ query }) => {
    requireUser();
    const list = bySymbol(fs().orders, query.get('symbol'));
    for (const o of list) finishOrder(o, 'CANCELED', 'USER_CANCELED');
    if (list.length) emitAccount();
    return { canceled: list };
  },
  futuresMyTrades: ({ query }) => (requireUser(), { items: empty() ? [] : bySymbol(fs().trades, query.get('symbol')), nextCursor: null }),

  futuresPositions: () => (requireUser(), { items: empty() ? [] : fs().positions.map(viewPosition) }),
  futuresPositionHistory: ({ query }) => (requireUser(), { items: empty() ? [] : bySymbol(fs().closed, query.get('symbol')).map(viewPosition), nextCursor: null }),
  futuresClosePosition: ({ params, body }) => {
    requireVerified();
    requireTradable(params.symbol!);
    const p = positionOf(params.symbol!);
    const qty = body.quantity === undefined ? p.qty : Math.min(Number(body.quantity), p.qty);
    return marketClose(p, qty, 'CLOSE');
  },
  futuresAdjustMargin: ({ params, body }) => {
    requireVerified();
    const p = positionOf(params.symbol!);
    const amount = Number(body.amount);
    const s = fs();
    if (amount > 0) {
      if (s.available < amount) throw new MockError('INSUFFICIENT_BALANCE', 'Insufficient futures USDT balance');
    } else {
      const mark = priceOf(p.symbol);
      const keep = (mark * p.qty) / p.leverage - (mark - p.entry) * p.qty * dirOf(p.side);
      const maxRemovable = Math.max(0, p.margin - Math.max(keep, 0));
      if (-amount > maxRemovable) throw new MockError('MARGIN_TOO_LOW', 'Removing that much would leave less than the initial margin', { maxRemovable: f8(maxRemovable) });
    }
    s.available -= amount;
    p.margin += amount;
    p.updatedAt = now();
    ledger('MARGIN_ADJUST', -amount, amount, 'FUTURES_POSITION', p.id);
    emitPosition(p);
    emitAccount();
    return viewPosition(p);
  },
  futuresSetTpSl: ({ params, body }) => {
    requireVerified();
    const p = positionOf(params.symbol!);
    const tp = body.takeProfitPrice === null || body.takeProfitPrice === undefined ? null : Number(body.takeProfitPrice);
    const sl = body.stopLossPrice === null || body.stopLossPrice === undefined ? null : Number(body.stopLossPrice);
    checkTpSl(p.side, priceOf(p.symbol), tp, sl);
    p.tp = tp;
    p.sl = sl;
    p.updatedAt = now();
    emitPosition(p);
    return viewPosition(p);
  },

  adminFuturesSymbols: () => {
    requireStaff('exchange.read');
    const s = fs();
    return { items: s.symbols.map((x) => ({ ...x, openPositions: s.positions.filter((p) => p.symbol === x.symbol).length, openOrders: s.orders.filter((o) => o.symbol === x.symbol).length })) };
  },
  adminUpdateFuturesSymbol: ({ params, body }) => {
    requireStaff('exchange.configure');
    const x = fs().symbols.find((s) => s.symbol === params.symbol);
    if (!x) throw new MockError('NOT_FOUND', 'Unknown futures symbol');
    const before = { enabled: x.adminEnabled, maxLeverage: x.maxLeverage, maintenanceMarginRate: x.maintenanceMarginRate };
    if (body.enabled !== undefined) x.adminEnabled = x.enabled = Boolean(body.enabled);
    if (body.maxLeverage !== undefined) x.maxLeverage = Number(body.maxLeverage);
    if (body.maintenanceMarginRate !== undefined) x.maintenanceMarginRate = String(body.maintenanceMarginRate);
    x.updatedAt = now();
    const me = mockMe();
    mockStore.auditLogs.unshift({ id: nextId(), actor: { id: me.id, email: me.email }, action: 'FUTURES_SYMBOL_UPDATE', targetType: 'SYMBOL', targetId: x.symbol, before, after: { enabled: x.adminEnabled, maxLeverage: x.maxLeverage, maintenanceMarginRate: x.maintenanceMarginRate }, reason: String(body.reason), ip: '127.0.0.1', createdAt: now() });
    return x;
  },
};
