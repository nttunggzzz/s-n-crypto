import type { Balance, LedgerEntry, Order, Trade } from '@cex/contracts';
import { dec, toFixedStr, type Dec } from '@cex/core';
import type { ledgerEntries } from '../../db/schema.ts';
import type { OrderRow, TradeRow } from './events.ts';

const fx = (s: string) => toFixedStr(dec(s));
const fxn = (s: string | null) => (s === null ? null : fx(s));

export function serializeOrder(o: OrderRow): Order {
  const executed = dec(o.executedQty);
  const cum = dec(o.cumulativeQuoteQty);
  return {
    id: String(o.id),
    clientOrderId: o.clientOrderId,
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
    triggerState: null,
    triggerDirection: null,
    triggeredAt: null,
    trailingDeltaBips: null,
    activationPrice: null,
    trailingReferencePrice: null,
    orderListId: null,
    parentOrderId: null,
    tpsl: null,
    closeReason: null,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
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
    realizedPnl: null,
    createdAt: t.createdAt.toISOString(),
  };
}

export function serializeLedger(e: typeof ledgerEntries.$inferSelect): LedgerEntry {
  return {
    id: String(e.id),
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
