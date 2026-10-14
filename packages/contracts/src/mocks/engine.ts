/**
 * ⚠️ Tiny mock "exchange" so the UI can see phase-2 flows without a backend:
 * stop triggers, trailing stops, OCO one-cancels-other, TP/SL children, price alerts.
 * JS numbers for reservations — never reuse this math in the UI. A fill's quoteQty, fee, tax (0.15.0) and realizedPnl
 * use @cex/core Dec with the server's rounding (settleFills + positions.ts).
 */
import { dec, roundDown, roundUp, ZERO, type Dec } from '@cex/core';
import type { Order, OrderList, Trade } from '../index.ts';
import { ORDER_DEFAULTS, MOCK_PAIRS } from '../fixtures/index.ts';
import { adjust, emitUser, mockStore, nextId, notify } from './store.ts';
import { mockRecordWithholding, mockTaxOfFill } from './tax.ts';

const feeRate = () => Number(mockStore.settings.feeRate);
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

const AVG_SCALE = 18;

/**
 * Average cost of the base asset, like server positions.ts (with the 0.15.0 tax):
 *   BUY : avg = (held × avg + USDT paid) / (held + qty − fee)
 *   SELL: realized = (USDT received − fee − tax) − qty × avg, 8 dp; null without a cost basis
 */
function applyToPosition(asset: string, side: 'BUY' | 'SELL', qty: Dec, quote: Dec, fee: Dec, tax: Dec): Dec | null {
  const p = (mockStore.positions[asset] ??= { quantity: '0', avgCost: null });
  const held = dec(p.quantity);
  const avg = p.avgCost === null ? null : dec(p.avgCost);
  if (side === 'BUY') {
    const newQty = held.add(qty.sub(fee));
    const cost = (avg ?? ZERO).mul(held).add(quote);
    p.avgCost = newQty.gt(0) ? cost.div(newQty).toDecimalPlaces(AVG_SCALE).toFixed() : null;
    p.quantity = newQty.toFixed();
    return null;
  }
  const realized = avg === null ? null : quote.sub(fee).sub(tax).sub(qty.mul(avg)).toDecimalPlaces(8);
  const left = held.sub(qty);
  p.quantity = left.gt(0) ? left.toFixed() : '0';
  if (!left.gt(0)) p.avgCost = null;
  return realized;
}

/** Settles a fill of the whole order at `price` and releases its reservation. */
function fill(o: Order, price: number, lock: { asset: string; amount: number } | null, liquidity: 'MAKER' | 'TAKER'): Trade {
  const qtyN = o.quantity ? Number(o.quantity) : floorQty(o.symbol, Number(o.quoteOrderQty) / price);
  const isBuy = o.side === 'BUY';
  const qty = dec(f8(qtyN));
  const px = dec(f8(price));
  // the user pays a BUY (round up) and receives a SELL (round down); exact on real pairs (tick + step ≤ 8 decimals)
  const quote = isBuy ? roundUp(qty.mul(px)) : roundDown(qty.mul(px));
  const fee = roundUp(isBuy ? qty.mul(dec(mockStore.settings.feeRate)) : quote.mul(dec(mockStore.settings.feeRate)));
  const tax = mockTaxOfFill(o.side, quote);
  const base = baseOf(o.symbol);
  if (isBuy) {
    if (lock) adjust('USDT', lock.amount - Number(quote.toFixed(8)), -lock.amount);
    else adjust('USDT', -Number(quote.toFixed(8)));
    adjust(base, Number(qty.sub(fee).toFixed(8)));
  } else {
    if (lock) adjust(base, lock.amount - qtyN, -lock.amount);
    else adjust(base, -qtyN);
    // TRADE_CREDIT − FEE − TAX_WITHHOLDING
    adjust('USDT', Number(quote.sub(fee).sub(tax).toFixed(8)));
  }
  const realized = applyToPosition(base, o.side, qty, quote, fee, tax);
  o.executedQty = qty.toFixed(8);
  o.cumulativeQuoteQty = quote.toFixed(8);
  o.avgPrice = px.toFixed(8);
  const trade: Trade = {
    id: nextId(),
    orderId: o.id,
    symbol: o.symbol,
    side: o.side,
    price: px.toFixed(8),
    quantity: qty.toFixed(8),
    quoteQty: quote.toFixed(8),
    fee: fee.toFixed(8),
    feeAsset: isBuy ? base : 'USDT',
    tax: tax.toFixed(8),
    liquidity,
    realizedPnl: realized === null ? null : realized.toFixed(8),
    createdAt: now(),
  };
  mockStore.trades.unshift(trade);
  mockRecordWithholding(trade);
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
  const net = floorQty(parent.symbol, Number(parent.executedQty) * (1 - feeRate()));
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
