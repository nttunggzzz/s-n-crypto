import type { Router } from 'express';
import { and, asc, desc, eq, gte, inArray, lt, lte, notInArray, type SQL } from 'drizzle-orm';
import { dec, toFixedStr, type Dec } from '@cex/core';
import { ledgerEntries, OPEN_STATUSES, orderLists, orders, trades } from '../../db/schema.ts';
import type { Db } from '../../db/client.ts';
import { route, type RouteOptions } from '../../lib/http.ts';
import { AppError } from '../../lib/errors.ts';
import { RateLimiter } from '../../lib/rateLimit.ts';
import type { MarketDataService } from '../market/marketData.ts';
import type { Exchange } from './index.ts';
import { getBalances } from './ledger.ts';
import { loadList } from './outcome.ts';
import { exportLedgerCsv, exportOrdersCsv, exportTradesCsv } from './exports.ts';
import { serializeBalance, serializeLedger, serializeOrder, serializeOrderList, serializeTrade, valuateBalances } from './serializers.ts';

/** USDT value of one unit of `asset`, or null when there is no live price. */
export function makePriceOf(market: MarketDataService): (asset: string) => Dec | null {
  return (asset) => (asset === 'USDT' ? dec('1') : market.livePrice(`${asset}USDT`));
}

function cursorId(cursor: string | undefined): number | undefined {
  if (cursor === undefined) return undefined;
  const n = Number(cursor);
  if (!Number.isSafeInteger(n) || n <= 0) throw new AppError('VALIDATION_ERROR', 'Invalid cursor');
  return n;
}

function page<T extends { id: number }>(rows: T[], limit: number) {
  const more = rows.length > limit;
  const items = more ? rows.slice(0, limit) : rows;
  return { items, nextCursor: more ? String(items[items.length - 1]!.id) : null };
}

type Col = typeof orders.createdAt | typeof trades.createdAt | typeof ledgerEntries.createdAt;
function timeRange(col: Col, q: { from?: string; to?: string }): SQL[] {
  const w: SQL[] = [];
  if (q.from) w.push(gte(col, new Date(q.from)));
  if (q.to) w.push(lte(col, new Date(q.to)));
  return w;
}

function parseId(s: string, what: string): number {
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n <= 0) throw new AppError('NOT_FOUND', `${what} not found`);
  return n;
}

export function registerExchangeRoutes(router: Router, opts: RouteOptions, db: Db, ex: Exchange, market: MarketDataService, rateLimitScale = 1): void {
  const orderLimit = new RateLimiter(10 * rateLimitScale, 1000);
  const exportLimit = new RateLimiter(10 * rateLimitScale, 60_000);
  const priceOf = makePriceOf(market);

  // ───── wallet

  route(router, opts, 'balances', async ({ auth }) => valuateBalances(await getBalances(db, auth.user.id), priceOf));

  route(router, opts, 'ledger', async ({ auth, query }) => {
    const where: SQL[] = [eq(ledgerEntries.userId, auth.user.id), eq(ledgerEntries.account, 'SPOT'), ...timeRange(ledgerEntries.createdAt, query)];
    if (query.asset) where.push(eq(ledgerEntries.asset, query.asset));
    if (query.hideLocks === 'true') where.push(notInArray(ledgerEntries.type, ['ORDER_LOCK', 'ORDER_UNLOCK']));
    const c = cursorId(query.cursor);
    if (c) where.push(lt(ledgerEntries.id, c));
    const rows = await db
      .select()
      .from(ledgerEntries)
      .where(and(...where))
      .orderBy(desc(ledgerEntries.id))
      .limit(query.limit + 1);
    const p = page(rows, query.limit);
    return { items: p.items.map(serializeLedger), nextCursor: p.nextCursor };
  });

  route(router, opts, 'faucetStatus', async ({ auth }) => ex.faucet.status(auth.user.id));

  route(router, opts, 'faucetClaim', async ({ auth }) => {
    const r = await ex.faucet.claim(auth.user.id);
    return {
      claimed: toFixedStr(r.claimed),
      balance: serializeBalance(r.balance.asset, r.balance.available, r.balance.locked, priceOf),
      status: r.status,
    };
  });

  // ───── orders

  route(router, opts, 'placeOrder', async ({ auth, body }) => {
    orderLimit.consume(`user:${auth.user.id}`);
    const r = await ex.orders.placeOrder(auth.user.id, body);
    return { order: serializeOrder(r.order), fills: r.trades.map(serializeTrade) };
  });

  route(router, opts, 'openOrders', async ({ auth, query }) => {
    const where: SQL[] = [eq(orders.userId, auth.user.id), inArray(orders.status, [...OPEN_STATUSES])];
    if (query.symbol) where.push(eq(orders.symbol, query.symbol));
    const rows = await db
      .select()
      .from(orders)
      .where(and(...where))
      .orderBy(desc(orders.id));
    return { items: rows.map(serializeOrder) };
  });

  route(router, opts, 'orderHistory', async ({ auth, query }) => {
    const where: SQL[] = [eq(orders.userId, auth.user.id), notInArray(orders.status, [...OPEN_STATUSES]), ...timeRange(orders.createdAt, query)];
    if (query.symbol) where.push(eq(orders.symbol, query.symbol));
    const c = cursorId(query.cursor);
    if (c) where.push(lt(orders.id, c));
    const rows = await db
      .select()
      .from(orders)
      .where(and(...where))
      .orderBy(desc(orders.id))
      .limit(query.limit + 1);
    const p = page(rows, query.limit);
    return { items: p.items.map(serializeOrder), nextCursor: p.nextCursor };
  });

  route(router, opts, 'getOrder', async ({ auth, params }) => {
    const [o] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, parseId(params.orderId, 'Order')), eq(orders.userId, auth.user.id)));
    if (!o) throw new AppError('NOT_FOUND', 'Order not found');
    return serializeOrder(o);
  });

  route(router, opts, 'cancelOrder', async ({ auth, params }) => serializeOrder(await ex.orders.cancelOrder(auth.user.id, params.orderId)));

  route(router, opts, 'cancelAllOrders', async ({ auth, query }) => ({
    canceled: (await ex.orders.cancelAll(auth.user.id, query.symbol)).map(serializeOrder),
  }));

  route(router, opts, 'myTrades', async ({ auth, query }) => {
    const where: SQL[] = [eq(trades.userId, auth.user.id), ...timeRange(trades.createdAt, query)];
    if (query.symbol) where.push(eq(trades.symbol, query.symbol));
    const c = cursorId(query.cursor);
    if (c) where.push(lt(trades.id, c));
    const rows = await db
      .select()
      .from(trades)
      .where(and(...where))
      .orderBy(desc(trades.id))
      .limit(query.limit + 1);
    const p = page(rows, query.limit);
    return { items: p.items.map(serializeTrade), nextCursor: p.nextCursor };
  });

  // ───── OCO

  const ownedList = async (userId: string, listId: string) => {
    const l = await loadList(db, parseId(listId, 'Order list'));
    if (!l || l.list.userId !== userId) throw new AppError('NOT_FOUND', 'Order list not found');
    return serializeOrderList(l.list, l.legs);
  };

  route(router, opts, 'placeOco', async ({ auth, body }) => {
    orderLimit.consume(`user:${auth.user.id}`);
    const r = await ex.orders.placeOco(auth.user.id, body);
    return serializeOrderList(r.list, r.legs);
  });

  route(router, opts, 'openOrderLists', async ({ auth, query }) => {
    const where: SQL[] = [eq(orderLists.userId, auth.user.id), eq(orderLists.listStatus, 'EXECUTING')];
    if (query.symbol) where.push(eq(orderLists.symbol, query.symbol));
    const lists = await db
      .select()
      .from(orderLists)
      .where(and(...where))
      .orderBy(desc(orderLists.id));
    if (lists.length === 0) return { items: [] };
    const legs = await db
      .select()
      .from(orders)
      .where(
        inArray(
          orders.orderListId,
          lists.map((l) => l.id),
        ),
      )
      .orderBy(asc(orders.id));
    return { items: lists.map((l) => serializeOrderList(l, legs.filter((x) => x.orderListId === l.id))) };
  });

  route(router, opts, 'getOrderList', async ({ auth, params }) => ownedList(auth.user.id, params.listId));

  route(router, opts, 'cancelOrderList', async ({ auth, params }) => {
    await ex.orders.cancelOrderList(auth.user.id, params.listId);
    return ownedList(auth.user.id, params.listId);
  });

  // ───── portfolio

  route(router, opts, 'portfolio', async ({ auth }) => ex.portfolio.get(auth.user.id));
  route(router, opts, 'portfolioHistory', async ({ auth, query }) => ex.portfolio.history(auth.user.id, query.range));

  // ───── CSV exports

  route(router, opts, 'exportOrders', async ({ auth, query }) => {
    exportLimit.consume(`user:${auth.user.id}`);
    return exportOrdersCsv(db, auth.user.id, query);
  });
  route(router, opts, 'exportTrades', async ({ auth, query }) => {
    exportLimit.consume(`user:${auth.user.id}`);
    return exportTradesCsv(db, auth.user.id, query);
  });
  route(router, opts, 'exportLedger', async ({ auth, query }) => {
    exportLimit.consume(`user:${auth.user.id}`);
    return exportLedgerCsv(db, auth.user.id, query);
  });

  // ───── price alerts

  route(router, opts, 'listAlerts', async ({ auth, query }) => ({ items: await ex.alerts.list(auth.user.id, query.status) }));
  route(router, opts, 'createAlert', async ({ auth, body }) => ex.alerts.create(auth.user.id, body));
  route(router, opts, 'deleteAlert', async ({ auth, params }) => ex.alerts.cancel(auth.user.id, params.alertId));

  // ───── notifications

  route(router, opts, 'listNotifications', async ({ auth, query }) => ex.notifications.list(auth.user.id, query.unreadOnly === 'true', cursorId(query.cursor), query.limit));
  route(router, opts, 'unreadNotifications', async ({ auth }) => ({ unread: await ex.notifications.unread(auth.user.id) }));
  route(router, opts, 'markNotificationsRead', async ({ auth, body }) => ({ unread: await ex.notifications.markRead(auth.user.id, body) }));

  // ───── preferences

  route(router, opts, 'getPreferences', async ({ auth }) => ex.preferences.get(auth.user.id));
  route(router, opts, 'updatePreferences', async ({ auth, body }) => ex.preferences.update(auth.user.id, body));
}
