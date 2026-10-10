import type { Balance, LedgerEntry, Order, OrderList, Trade } from '@cex/contracts';
import { dec, toFixedStr, type Dec } from '@cex/core';
import type { ledgerEntries } from '../../db/schema.ts';
import type { OrderListRow, OrderRow, TradeRow } from './events.ts';

const fx = (s: string) => toFixedStr(dec(s));
const fxn = (s: string | null) => (s === null ? null : fx(s));
const idn = (n: number | null) => (n === null ? null : String(n));

export function serializeOrder(o: OrderRow): Order {
  const executed = dec(o.executedQty);
  const cum = dec(o.cumulativeQuoteQty);
  return {
    id: String(o.id),
    clientOrderId: o.clientOrderId,
    source: o.source,
    sourceId: idn(o.sourceId),
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    timeInForce: o.timeInForce,
    status: o.status,
    price: fxn(o.price),
    stopPrice: fxn(o.stopPrice),
    quantity: fxn(o.quantity),
    quoteOrderQty: fxn(o.quoteOrderQty),
    executedQty: toFixedStr(executed),
    cumulativeQuoteQty: toFixedStr(cum),
    avgPrice: executed.gt(0) ? toFixedStr(cum.div(executed)) : null,
    triggerState: o.triggerState,
    triggerDirection: o.triggerDirection,
    triggeredAt: o.triggeredAt?.toISOString() ?? null,
    trailingDeltaBips: o.trailingDeltaBips,
    activationPrice: fxn(o.activationPrice),
    trailingReferencePrice: fxn(o.trailingReferencePrice),
    orderListId: idn(o.orderListId),
    parentOrderId: idn(o.parentOrderId),
    tpsl: o.tpsl,
    closeReason: o.closeReason,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

/** Legs ordered [limit leg, stop leg]. */
export function serializeOrderList(l: OrderListRow, legs: OrderRow[]): OrderList {
  const sorted = [...legs].sort((a, b) => (a.type === 'LIMIT' ? -1 : b.type === 'LIMIT' ? 1 : a.id - b.id));
  return {
    id: String(l.id),
    clientListId: l.clientListId,
    symbol: l.symbol,
    side: l.side,
    contingencyType: l.contingencyType,
    listStatus: l.listStatus,
    orders: sorted.map(serializeOrder),
    parentOrderId: idn(l.parentOrderId),
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

export function serializeTrade(t: TradeRow): Trade {
  return {
    id: String(t.id),
    orderId: String(t.orderId),
    symbol: t.symbol,
    side: t.side,
    price: fx(t.price),
    quantity: fx(t.quantity),
    quoteQty: fx(t.quoteQty),
    fee: fx(t.fee),
    feeAsset: t.feeAsset,
    liquidity: t.liquidity,
    realizedPnl: fxn(t.realizedPnl),
    createdAt: t.createdAt.toISOString(),
  };
}

export function serializeLedger(e: typeof ledgerEntries.$inferSelect): LedgerEntry {
  return {
    id: String(e.id),
    account: e.account,
    asset: e.asset,
    type: e.type,
    deltaAvailable: fx(e.deltaAvailable),
    deltaLocked: fx(e.deltaLocked),
    availableAfter: fx(e.availableAfter),
    lockedAfter: fx(e.lockedAfter),
    refType: e.refType,
    refId: e.refId,
    createdAt: e.createdAt.toISOString(),
  };
}

/** `priceOf(asset)` returns the asset's USDT price or null when unknown/stale. */
export function serializeBalance(asset: string, available: Dec, locked: Dec, priceOf: (asset: string) => Dec | null): Balance {
  const total = available.add(locked);
  const price = priceOf(asset);
  return {
    asset,
    available: toFixedStr(available),
    locked: toFixedStr(locked),
    total: toFixedStr(total),
    valueUsdt: price === null ? null : toFixedStr(total.mul(price).toDecimalPlaces(8)),
  };
}

/** Values balances in USDT; total covers priced assets only, the rest are listed as unpriced. */
export function valuateBalances(rows: { asset: string; available: string; locked: string }[], priceOf: (asset: string) => Dec | null) {
  const items = rows.map((r) => serializeBalance(r.asset, dec(r.available), dec(r.locked), priceOf));
  let total = dec('0');
  const unpricedAssets: string[] = [];
  for (const b of items) {
    if (b.valueUsdt === null) {
      if (dec(b.total).gt(0)) unpricedAssets.push(b.asset);
    } else total = total.add(dec(b.valueUsdt));
  }
  return { items, totalValueUsdt: toFixedStr(total), unpricedAssets };
}
