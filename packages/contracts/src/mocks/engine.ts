/**
 * ⚠️ Tiny mock "exchange" so the UI can see phase-2 flows without a backend:
 * stop triggers, trailing stops, OCO one-cancels-other, TP/SL children, price alerts.
 * JS numbers, simplified fees — never reuse this math in the UI.
 */
import type { Order, OrderList, Trade } from '../index.ts';
import { ORDER_DEFAULTS, MOCK_PAIRS } from '../fixtures/index.ts';
import { adjust, emitUser, mockStore, nextId, notify } from './store.ts';

const FEE = 0.001;
const now = () => new Date().toISOString();
const f8 = (n: number) => n.toFixed(8);
const floorQty = (symbol: string, q: number) => {
  const step = Number(MOCK_PAIRS[symbol]!.step);
  return Math.floor(q / step + 1e-9) * step;
};
export const baseOf = (symbol: string) => MOCK_PAIRS[symbol]!.base;
export const isOpen = (o: Order) => o.status === 'NEW' || o.status === 'PARTIALLY_FILLED';

/** Funds reserved by a single (non-OCO) order. */
export function lockOf(o: Order): { asset: string; amount: number } {
  if (o.side === 'SELL') return { asset: baseOf(o.symbol), amount: Number(o.quantity) };
  if (o.quoteOrderQty) return { asset: 'USDT', amount: Number(o.quoteOrderQty) };
  return { asset: 'USDT', amount: Number(o.quantity) * Number(o.price) };
}

/** Funds reserved by an OCO: shared by both legs. */
export function listLock(l: OrderList): { asset: string; amount: number } {
  const [limit, stop] = l.orders as [Order, Order];
  if (l.side === 'SELL') return { asset: baseOf(l.symbol), amount: Number(limit.quantity) };
  return { asset: 'USDT', amount: Number(limit.quantity) * Math.max(Number(limit.price), Number(stop.price ?? 0)) };
}

export function findList(id: string | null): OrderList | undefined {
  return id ? mockStore.orderLists.find((l) => l.id === id) : undefined;
}

function close(o: Order, status: Order['status'], reason: Order['closeReason'] = null): void {
  o.status = status;
  o.closeReason = reason;
  o.updatedAt = now();
  mockStore.openOrders = mockStore.openOrders.filter((x) => x.id !== o.id);
  mockStore.history.unshift(o);
  emitUser({ kind: 'order', order: o });
}

/** Settles a fill of the whole order at `price` and releases its reservation. */
function fill(o: Order, price: number, lock: { asset: string; amount: number } | null, liquidity: 'MAKER' | 'TAKER'): Trade {
  const qty = o.quantity ? Number(o.quantity) : floorQty(o.symbol, Number(o.quoteOrderQty) / price);
  const quote = qty * price;
  const base = baseOf(o.symbol);
  const fee = o.side === 'BUY' ? qty * FEE : quote * FEE;
  if (o.side === 'BUY') {
    if (lock) adjust('USDT', lock.amount - quote, -lock.amount);
    else adjust('USDT', -quote);
    adjust(base, qty - fee);
  } else {
    if (lock) adjust(base, lock.amount - qty, -lock.amount);
    else adjust(base, -qty);
    adjust('USDT', quote - fee);
  }
  o.executedQty = f8(qty);
  o.cumulativeQuoteQty = f8(quote);
  o.avgPrice = f8(price);
  const trade: Trade = {
    id: nextId(),
    orderId: o.id,
    symbol: o.symbol,
    side: o.side,
    price: f8(price),
    quantity: f8(qty),
    quoteQty: f8(quote),
    fee: f8(fee),
    feeAsset: o.side === 'BUY' ? base : 'USDT',
    liquidity,
    realizedPnl: o.side === 'SELL' ? f8(quote * 0.01) : null,
    createdAt: now(),
  };
  mockStore.trades.unshift(trade);
  emitUser({ kind: 'trade', trade });
  close(o, 'FILLED');
  placeTpSl(o);
  return trade;
}

export function newOrder(p: Partial<Order> & Pick<Order, 'symbol' | 'side' | 'type'>): Order {
  const t = now();
  return {
    ...ORDER_DEFAULTS,
    id: nextId(),
    clientOrderId: `mock-${mockStore.nextId}`,
    timeInForce: null,
    status: 'NEW',
    price: null,
    stopPrice: null,
    quantity: null,
    quoteOrderQty: null,
    executedQty: f8(0),
    cumulativeQuoteQty: f8(0),
    avgPrice: null,
    createdAt: t,
    updatedAt: t,
    ...p,
  };
}

/** Creates an OCO and reserves its funds. */
export function createOco(p: {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  stopPrice: number;
  stopLimitPrice?: number;
  parentOrderId?: string;
  clientListId?: string;
}): OrderList {
  const listId = nextId();
  const common = { symbol: p.symbol, side: p.side, quantity: f8(p.quantity), orderListId: listId, parentOrderId: p.parentOrderId ?? null };
  const limitLeg = newOrder({ ...common, type: 'LIMIT', timeInForce: 'GTC', price: f8(p.price) });
  const stopLeg = newOrder({
    ...common,
    type: p.stopLimitPrice ? 'STOP_LIMIT' : 'STOP_MARKET',
    timeInForce: p.stopLimitPrice ? 'GTC' : null,
    price: p.stopLimitPrice ? f8(p.stopLimitPrice) : null,
    stopPrice: f8(p.stopPrice),
    triggerState: 'WAITING',
    triggerDirection: p.side === 'SELL' ? 'DOWN' : 'UP',
  });
  const t = now();
  const list: OrderList = {
    id: listId,
    clientListId: p.clientListId ?? `mock-list-${listId}`,
    symbol: p.symbol,
    side: p.side,
    contingencyType: 'OCO',
    listStatus: 'EXECUTING',
    orders: [limitLeg, stopLeg],
    parentOrderId: p.parentOrderId ?? null,
    createdAt: t,
    updatedAt: t,
  };
  const lock = listLock(list);
  adjust(lock.asset, -lock.amount, lock.amount);
  mockStore.orderLists.unshift(list);
  mockStore.openOrders.unshift(stopLeg, limitLeg);
  emitUser({ kind: 'orderList', orderList: list });
  return list;
}

/** Cancels an order (or its whole OCO) and releases the reservation once. */
export function cancel(o: Order, reason: Order['closeReason'] = 'USER_CANCELED'): Order {
  const list = findList(o.orderListId);
  if (list && list.listStatus === 'EXECUTING') {
    const lock = listLock(list);
    adjust(lock.asset, lock.amount, -lock.amount);
    for (const leg of list.orders) if (isOpen(leg)) close(leg, 'CANCELED', reason);
    list.listStatus = 'ALL_DONE';
    list.updatedAt = now();
    emitUser({ kind: 'orderList', orderList: list });
    return o;
  }
  const lock = lockOf(o);
  adjust(lock.asset, lock.amount, -lock.amount);
  close(o, 'CANCELED', reason);
  return o;
}

function placeTpSl(parent: Order): void {
  if (parent.side !== 'BUY' || !parent.tpsl || parent.tpsl.state !== 'PENDING') return;
  const net = floorQty(parent.symbol, Number(parent.executedQty) * (1 - FEE));
  const t = parent.tpsl;
  if (net <= 0) {
    t.state = 'SKIPPED';
    t.skippedReason = 'QUANTITY_TOO_SMALL';
    notify({ type: 'TPSL_SKIPPED', orderId: parent.id, symbol: parent.symbol, reason: 'QUANTITY_TOO_SMALL' });
    return;
  }
  if (t.takeProfitPrice && t.stopLossPrice) {
    const list = createOco({
      symbol: parent.symbol,
      side: 'SELL',
      quantity: net,
      price: Number(t.takeProfitPrice),
      stopPrice: Number(t.stopLossPrice),
      stopLimitPrice: t.stopLossLimitPrice ? Number(t.stopLossLimitPrice) : undefined,
      parentOrderId: parent.id,
    });
    t.childOrderListId = list.id;
    t.childOrderIds = list.orders.map((x) => x.id);
  } else {
    const child = t.takeProfitPrice
      ? newOrder({ symbol: parent.symbol, side: 'SELL', type: 'LIMIT', timeInForce: 'GTC', price: t.takeProfitPrice, quantity: f8(net), parentOrderId: parent.id })
      : newOrder({
          symbol: parent.symbol,
          side: 'SELL',
          type: t.stopLossLimitPrice ? 'STOP_LIMIT' : 'STOP_MARKET',
          price: t.stopLossLimitPrice,
          stopPrice: t.stopLossPrice,
          quantity: f8(net),
          triggerState: 'WAITING',
          triggerDirection: 'DOWN',
          parentOrderId: parent.id,
        });
    adjust(baseOf(parent.symbol), -net, net);
    mockStore.openOrders.unshift(child);
    emitUser({ kind: 'order', order: child });
    t.childOrderIds = [child.id];
  }
  t.state = 'PLACED';
  notify({ type: 'TPSL_PLACED', orderId: parent.id, symbol: parent.symbol, quantity: f8(net), orderListId: t.childOrderListId, childOrderIds: t.childOrderIds });
  emitUser({ kind: 'order', order: parent });
}

/** OCO bookkeeping after one leg filled or triggered. */
function finishList(o: Order): { asset: string; amount: number } | null {
  const list = findList(o.orderListId);
  if (!list || list.listStatus !== 'EXECUTING') return null;
  const lock = listLock(list);
  for (const leg of list.orders) if (leg.id !== o.id && isOpen(leg)) close(leg, 'CANCELED', 'OCO_SIBLING');
  list.listStatus = 'ALL_DONE';
  list.updatedAt = now();
  emitUser({ kind: 'orderList', orderList: list });
  return lock;
}

/** Feed a mock trade price: triggers stops/trailing, fills crossed limits, fires alerts. */
export function mockProcessPrice(symbol: string, price: number): void {
  for (const o of [...mockStore.openOrders]) {
    if (o.symbol !== symbol || !isOpen(o)) continue;
    if (o.type === 'TRAILING_STOP_MARKET' && o.triggerState === 'WAITING') {
      const d = (o.trailingDeltaBips ?? 0) / 10_000;
      const ref = Number(o.trailingReferencePrice ?? price);
      const nextRef = o.side === 'SELL' ? Math.max(ref, price) : Math.min(ref, price);
      o.trailingReferencePrice = f8(nextRef);
      o.stopPrice = f8(o.side === 'SELL' ? nextRef * (1 - d) : nextRef * (1 + d));
    }
    if (o.triggerState === 'WAITING' && o.stopPrice) {
      const stop = Number(o.stopPrice);
      if ((o.triggerDirection === 'DOWN' && price <= stop) || (o.triggerDirection === 'UP' && price >= stop)) {
        o.triggerState = 'TRIGGERED';
        o.triggeredAt = now();
        notify({ type: 'STOP_TRIGGERED', orderId: o.id, symbol, side: o.side, orderType: o.type, stopPrice: o.stopPrice, lastPrice: f8(price) });
        const listLockAmt = finishList(o);
        if (o.type === 'STOP_LIMIT') {
          emitUser({ kind: 'order', order: o });
          continue; // now a working limit; fills on a later crossing
        }
        const t = fill(o, price, listLockAmt ?? lockOf(o), 'TAKER');
        notify({ type: 'ORDER_FILLED', orderId: o.id, symbol, side: o.side, orderType: o.type, executedQty: t.quantity, avgPrice: t.price });
      }
      continue;
    }
    if (o.price && (o.type === 'LIMIT' || o.type === 'STOP_LIMIT')) {
      const limit = Number(o.price);
      if ((o.side === 'BUY' && price < limit) || (o.side === 'SELL' && price > limit)) {
        const list = findList(o.orderListId);
        const lock = list && list.listStatus === 'EXECUTING' ? finishList(o) : lockOf(o);
        const t = fill(o, limit, lock, 'MAKER');
        notify({ type: 'ORDER_FILLED', orderId: o.id, symbol, side: o.side, orderType: o.type, executedQty: t.quantity, avgPrice: t.price });
      }
    }
  }
  for (const a of mockStore.alerts) {
    if (a.symbol !== symbol || a.status !== 'ACTIVE') continue;
    const target = Number(a.targetPrice);
    if ((a.condition === 'ABOVE' && price >= target) || (a.condition === 'BELOW' && price <= target)) {
      a.status = 'TRIGGERED';
      a.triggeredPrice = f8(price);
      a.triggeredAt = now();
      emitUser({ kind: 'alert', alert: a });
      notify({ type: 'PRICE_ALERT', alertId: a.id, symbol, condition: a.condition, targetPrice: a.targetPrice, lastPrice: f8(price) });
    }
  }
}

export { fill as mockFill };

/** Dev helper: move a mock price and run triggers/fills/alerts immediately (e.g. from a dev toolbar). */
export function setMockPrice(symbol: string, price: number): void {
  mockStore.prices[symbol] = price;
  mockProcessPrice(symbol, price);
}
