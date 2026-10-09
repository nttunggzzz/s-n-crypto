import type { Router } from 'express';
import { and, desc, eq, inArray, lt, notInArray, type SQL } from 'drizzle-orm';
import { dec, toFixedStr, ZERO, type Dec } from '@cex/core';
import { ledgerEntries, OPEN_STATUSES, orders, trades } from '../../db/schema.ts';
import type { Db } from '../../db/client.ts';
import { route, type RouteOptions } from '../../lib/http.ts';
import { AppError } from '../../lib/errors.ts';
import { RateLimiter } from '../../lib/rateLimit.ts';
import type { MarketDataService } from '../market/marketData.ts';
import type { Exchange } from './index.ts';
import { getBalances } from './ledger.ts';
import { serializeBalance, serializeLedger, serializeOrder, serializeTrade } from './serializers.ts';

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

export function registerExchangeRoutes(router: Router, opts: RouteOptions, db: Db, ex: Exchange, market: MarketDataService): void {
  const orderLimit = new RateLimiter(10, 1000);
  const priceOf = makePriceOf(market);

  // ───── wallet

  route(router, opts, 'balances', async ({ auth }) => {
    const rows = await getBalances(db, auth.user.id);
    const items = rows.map((r) => serializeBalance(r.asset, dec(r.available), dec(r.locked), priceOf));
    let total = ZERO;
    const unpricedAssets: string[] = [];
    for (const b of items) {
      if (b.valueUsdt === null) {
        if (dec(b.total).gt(0)) unpricedAssets.push(b.asset);
      } else total = total.add(dec(b.valueUsdt));
    }
    return { items, totalValueUsdt: toFixedStr(total), unpricedAssets };
  });

  route(router, opts, 'ledger', async ({ auth, query }) => {
    const where: SQL[] = [eq(ledgerEntries.userId, auth.user.id)];
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
    const where: SQL[] = [eq(orders.userId, auth.user.id), notInArray(orders.status, [...OPEN_STATUSES])];
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
    const id = Number(params.orderId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new AppError('NOT_FOUND', 'Order not found');
    const [o] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.userId, auth.user.id)));
    if (!o) throw new AppError('NOT_FOUND', 'Order not found');
    return serializeOrder(o);
  });

  route(router, opts, 'cancelOrder', async ({ auth, params }) => serializeOrder(await ex.orders.cancelOrder(auth.user.id, params.orderId)));

  route(router, opts, 'cancelAllOrders', async ({ auth, query }) => ({
    canceled: (await ex.orders.cancelAll(auth.user.id, query.symbol)).map(serializeOrder),
  }));

  route(router, opts, 'myTrades', async ({ auth, query }) => {
    const where: SQL[] = [eq(trades.userId, auth.user.id)];
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
}
