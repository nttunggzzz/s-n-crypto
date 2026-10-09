import { asc, eq, inArray } from 'drizzle-orm';
import { orderLists, orders } from '../../db/schema.ts';
import type { Db } from '../../db/client.ts';
import type { BalanceState } from './ledger.ts';
import type { ExchangeEvents, NotificationRow, OrderListRow, OrderRow, TradeRow } from './events.ts';
import type { OpenOrderIndex } from './openOrderIndex.ts';

/**
 * Everything one transaction changed. Collected while the transaction runs and applied
 * (index + realtime events) only after it commits.
 */
export class Outcome {
  readonly orders = new Map<number, OrderRow>();
  readonly trades: TradeRow[] = [];
  readonly balances = new Map<string, BalanceState>();
  readonly listIds = new Set<number>();
  readonly notifications: NotificationRow[] = [];

  order(o: OrderRow): OrderRow {
    this.orders.set(o.id, o);
    if (o.orderListId !== null) this.listIds.add(o.orderListId);
    return o;
  }

  addBalances(states: Iterable<BalanceState>): void {
    for (const b of states) this.balances.set(`${b.userId}|${b.asset}`, b);
  }

  /** Index sync + realtime events. Call after commit. */
  async apply(db: Db, index: OpenOrderIndex, events: ExchangeEvents): Promise<void> {
    for (const o of this.orders.values()) index.sync(o);
    events.publish({ orders: this.orders.values(), trades: this.trades, balances: this.balances.values() });
    if (this.listIds.size) {
      const lists = await db.select().from(orderLists).where(inArray(orderLists.id, [...this.listIds]));
      const legs = await db.select().from(orders).where(inArray(orders.orderListId, [...this.listIds])).orderBy(asc(orders.id));
      for (const l of lists) events.emit('orderList', l.userId, l, legs.filter((x) => x.orderListId === l.id));
    }
    for (const n of this.notifications) events.emit('notification', n.userId, n);
  }
}

export async function loadList(db: Db, listId: number): Promise<{ list: OrderListRow; legs: OrderRow[] } | null> {
  const [list] = await db.select().from(orderLists).where(eq(orderLists.id, listId));
  if (!list) return null;
  const legs = await db.select().from(orders).where(eq(orders.orderListId, listId)).orderBy(asc(orders.id));
  return { list, legs };
}
