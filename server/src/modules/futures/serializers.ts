import { EventEmitter } from 'node:events';
import type { FuturesOrder, FuturesPosition, FuturesTrade } from '@cex/contracts';
import { ENTRY_PRICE_SCALE, dec, liquidationPrice, maintenanceMargin, pnl, returnOnMargin, toFixedStr, type Dec } from '@cex/core';
import type { futuresOrders, futuresPositions, futuresTrades, notifications } from '../../db/schema.ts';
import type { LoadedContract } from './config.ts';

export type FOrderRow = typeof futuresOrders.$inferSelect;
export type FTradeRow = typeof futuresTrades.$inferSelect;
export type FPositionRow = typeof futuresPositions.$inferSelect;
type NotificationRow = typeof notifications.$inferSelect;

/** Emitted AFTER commit; the realtime hub turns them into `user` events. */
export class FuturesEvents extends EventEmitter<{
  order: [userId: string, order: FOrderRow];
  trade: [userId: string, trade: FTradeRow];
  position: [userId: string, position: FPositionRow];
  /** the futures wallet changed (the hub loads and sends the summary) */
  account: [userId: string];
  notification: [userId: string, n: NotificationRow];
}> {}

/** What one futures transaction changed; published after commit. */
export class FOutcome {
  readonly orders = new Map<number, FOrderRow>();
  readonly trades: FTradeRow[] = [];
  readonly positions = new Map<number, FPositionRow>();
  readonly accounts = new Set<string>();
  readonly notifications: NotificationRow[] = [];

  order(o: FOrderRow): FOrderRow {
    this.orders.set(o.id, o);
    return o;
  }
  position(p: FPositionRow): FPositionRow {
    this.positions.set(p.id, p);
    return p;
  }

  publish(events: FuturesEvents): void {
    for (const o of this.orders.values()) events.emit('order', o.userId, o);
    for (const t of this.trades) events.emit('trade', t.userId, t);
    for (const p of this.positions.values()) events.emit('position', p.userId, p);
    for (const u of this.accounts) events.emit('account', u);
    for (const n of this.notifications) events.emit('notification', n.userId, n);
  }
}

const amt = (s: string) => toFixedStr(dec(s));

export function serializeFuturesOrder(o: FOrderRow): FuturesOrder {
  const executed = dec(o.executedQty);
  return {
    id: String(o.id),
    clientOrderId: o.clientOrderId,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    purpose: o.purpose,
    timeInForce: o.timeInForce,
    price: o.price === null ? null : dec(o.price).toFixed(),
    quantity: dec(o.quantity).toFixed(),
    executedQty: executed.toFixed(),
    avgPrice: executed.isZero() ? null : dec(o.executedNotional).div(executed).toDecimalPlaces(ENTRY_PRICE_SCALE).toFixed(),
    reduceOnly: o.reduceOnly,
    leverage: o.leverage,
    status: o.status,
    lockedAmount: toFixedStr(dec(o.marginLocked).add(dec(o.feeLocked))),
    fee: amt(o.fee),
    realizedPnl: amt(o.realizedPnl),
    closeReason: o.closeReason,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

export function serializeFuturesTrade(t: FTradeRow): FuturesTrade {
  return {
    id: String(t.id),
    orderId: String(t.orderId),
    symbol: t.symbol,
    side: t.side,
    price: dec(t.price).toFixed(),
    quantity: dec(t.quantity).toFixed(),
    quoteQty: amt(t.quoteQty),
    fee: amt(t.fee),
    feeAsset: 'USDT',
    liquidity: t.liquidity,
    realizedPnl: amt(t.realizedPnl),
    createdAt: t.createdAt.toISOString(),
  };
}

/** Live fields use the mark price when it is LIVE; otherwise they are null (never guessed). */
export function serializePosition(p: FPositionRow, c: LoadedContract | undefined, mark: Dec | null): FuturesPosition {
  const open = p.status === 'OPEN';
  const qty = dec(p.quantity);
  const entry = dec(p.entryPrice);
  const margin = dec(p.margin);
  const live = open && mark !== null && c !== undefined;
  const upnl = live ? pnl(p.side, entry, mark, qty) : null;
  const roe = upnl === null ? null : returnOnMargin(upnl, margin);
  const liq = open && c ? liquidationPrice(p.side, entry, qty, margin, c.mmr, c.tick) : null;
  const closedQty = dec(p.closedQuantity);
  return {
    id: String(p.id),
    symbol: p.symbol,
    side: p.side,
    status: p.status,
    marginMode: p.marginMode,
    quantity: qty.toFixed(),
    maxQuantity: dec(p.maxQuantity).toFixed(),
    entryPrice: entry.toFixed(),
    closePrice: closedQty.isZero() ? null : dec(p.closedNotional).div(closedQty).toDecimalPlaces(ENTRY_PRICE_SCALE).toFixed(),
    leverage: p.leverage,
    margin: toFixedStr(margin),
    markPrice: live ? mark.toFixed() : null,
    unrealizedPnl: upnl === null ? null : toFixedStr(upnl),
    returnOnMargin: roe === null ? null : roe.toDecimalPlaces(6).toFixed(),
    liquidationPrice: liq === null ? null : liq.toFixed(),
    maintenanceMargin: live ? toFixedStr(maintenanceMargin(mark, qty, c.mmr).toDecimalPlaces(8, 0)) : null,
    realizedPnl: amt(p.realizedPnl),
    fees: amt(p.fees),
    funding: amt(p.funding),
    takeProfitPrice: p.takeProfitPrice === null ? null : dec(p.takeProfitPrice).toFixed(),
    stopLossPrice: p.stopLossPrice === null ? null : dec(p.stopLossPrice).toFixed(),
    closeReason: p.closeReason,
    openedAt: p.openedAt.toISOString(),
    closedAt: p.closedAt?.toISOString() ?? null,
    updatedAt: p.updatedAt.toISOString(),
  };
}
