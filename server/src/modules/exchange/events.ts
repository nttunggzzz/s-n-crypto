import { EventEmitter } from 'node:events';
import type { orders, trades } from '../../db/schema.ts';
import type { BalanceState } from './ledger.ts';

export type OrderRow = typeof orders.$inferSelect;
export type TradeRow = typeof trades.$inferSelect;

/** Emitted AFTER the transaction commits; consumed by the realtime hub. */
export interface ExchangeEventMap {
  order: [userId: string, order: OrderRow];
  trade: [userId: string, trade: TradeRow];
  balance: [userId: string, balance: BalanceState];
}

export class ExchangeEvents extends EventEmitter<ExchangeEventMap> {
  publish(result: { orders?: OrderRow[]; trades?: TradeRow[]; balances?: Iterable<BalanceState> }): void {
    for (const o of result.orders ?? []) this.emit('order', o.userId, o);
    for (const t of result.trades ?? []) this.emit('trade', t.userId, t);
    for (const b of result.balances ?? []) this.emit('balance', b.userId, b);
  }
}
