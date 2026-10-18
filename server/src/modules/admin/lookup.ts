import { and, desc, eq, gt, gte, inArray, isNull, lt, lte, notInArray, type SQL } from 'drizzle-orm';
import type { AdminMarket, AdminOrderRow, AdminTradeRow, AdminUserSession } from '@cex/contracts';
import { futuresOrders, futuresTrades, OPEN_STATUSES, orders, sessions, trades, users } from '../../db/schema.ts';
import type { Db } from '../../db/client.ts';
import { AppError } from '../../lib/errors.ts';
import { serializeOrder, serializeTrade } from '../exchange/serializers.ts';
import { serializeFuturesOrder, serializeFuturesTrade } from '../futures/serializers.ts';

/**
 * Batch AD1, read-only: order / fill lookup across ALL users (for support and audit) and one user's live sessions.
 * Cursor = id of the last row of the previous page (ids are bigserial; newest first = id desc).
 */

const SESSION_LIMIT = 100;

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

function cursorId(cursor: string | undefined): number | undefined {
  if (cursor === undefined) return undefined;
  const n = Number(cursor);
  if (!Number.isSafeInteger(n) || n <= 0) throw new AppError('VALIDATION_ERROR', 'Invalid cursor');
  return n;
}

function numericId(v: string): number {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) throw new AppError('VALIDATION_ERROR', 'Invalid id');
  return n;
}

/** uuid or 8-digit UID -> user id. Not found -> 404 (a filter on a user that does not exist is a wrong reference, not an empty list). */
async function resolveUserId(db: Db, ref: string): Promise<string> {
  const isUid = /^\d{8}$/.test(ref);
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(isUid ? eq(users.uid, Number(ref)) : eq(users.id, ref.toLowerCase()));
  if (!u) throw new AppError('NOT_FOUND', 'User not found');
  return u.id;
}

export interface OrderSearch {
  market: AdminMarket;
  symbol?: string;
  status: 'open' | 'closed' | 'all';
  side?: 'BUY' | 'SELL';
  user?: string;
  orderId?: string;
  clientOrderId?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit: number;
}

export async function searchOrders(db: Db, q: OrderSearch): Promise<Page<AdminOrderRow>> {
  const userId = q.user ? await resolveUserId(db, q.user) : undefined;
  const c = cursorId(q.cursor);
  const take = q.limit + 1;
  const owner = (r: { uid: number; email: string; userId: string }) => ({ userId: r.userId, uid: String(r.uid), email: r.email });

  let items: AdminOrderRow[];
  if (q.market === 'SPOT') {
    const where: SQL[] = [];
    if (userId) where.push(eq(orders.userId, userId));
    if (q.symbol) where.push(eq(orders.symbol, q.symbol));
    if (q.side) where.push(eq(orders.side, q.side));
    if (q.orderId) where.push(eq(orders.id, numericId(q.orderId)));
    if (q.clientOrderId) where.push(eq(orders.clientOrderId, q.clientOrderId));
    if (q.status === 'open') where.push(inArray(orders.status, [...OPEN_STATUSES]));
    if (q.status === 'closed') where.push(notInArray(orders.status, [...OPEN_STATUSES]));
    if (q.from) where.push(gte(orders.createdAt, new Date(q.from)));
    if (q.to) where.push(lte(orders.createdAt, new Date(q.to)));
    if (c) where.push(lt(orders.id, c));
    const rows = await db
      .select({ o: orders, uid: users.uid, email: users.email })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(orders.id))
      .limit(take);
    items = rows.map(({ o, uid, email }) => {
      const s = serializeOrder(o);
      return {
        market: 'SPOT',
        id: s.id,
        clientOrderId: s.clientOrderId,
        ...owner({ uid, email, userId: o.userId }),
        source: s.source,
        sourceId: s.sourceId,
        symbol: s.symbol,
        side: s.side,
        type: s.type,
        status: s.status,
        price: s.price,
        quantity: s.quantity,
        executedQty: s.executedQty,
        avgPrice: s.avgPrice,
        leverage: null,
        closeReason: s.closeReason,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      };
    });
  } else {
    const where: SQL[] = [];
    if (userId) where.push(eq(futuresOrders.userId, userId));
    if (q.symbol) where.push(eq(futuresOrders.symbol, q.symbol));
    if (q.side) where.push(eq(futuresOrders.side, q.side));
    if (q.orderId) where.push(eq(futuresOrders.id, numericId(q.orderId)));
    if (q.clientOrderId) where.push(eq(futuresOrders.clientOrderId, q.clientOrderId));
    if (q.status === 'open') where.push(inArray(futuresOrders.status, [...OPEN_STATUSES]));
    if (q.status === 'closed') where.push(notInArray(futuresOrders.status, [...OPEN_STATUSES]));
    if (q.from) where.push(gte(futuresOrders.createdAt, new Date(q.from)));
    if (q.to) where.push(lte(futuresOrders.createdAt, new Date(q.to)));
    if (c) where.push(lt(futuresOrders.id, c));
    const rows = await db
      .select({ o: futuresOrders, uid: users.uid, email: users.email })
      .from(futuresOrders)
      .innerJoin(users, eq(users.id, futuresOrders.userId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(futuresOrders.id))
      .limit(take);
    items = rows.map(({ o, uid, email }) => {
      const s = serializeFuturesOrder(o);
      return {
        market: 'FUTURES',
        id: s.id,
        clientOrderId: s.clientOrderId,
        ...owner({ uid, email, userId: o.userId }),
        source: null,
        sourceId: null,
        symbol: s.symbol,
        side: s.side,
        type: s.type,
        status: s.status,
        price: s.price,
        quantity: s.quantity,
        executedQty: s.executedQty,
        avgPrice: s.avgPrice,
        leverage: s.leverage,
        closeReason: s.closeReason,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      };
    });
  }
  const more = items.length > q.limit;
  const page = more ? items.slice(0, q.limit) : items;
  return { items: page, nextCursor: more ? page[page.length - 1]!.id : null };
}

export interface TradeSearch {
  market: AdminMarket;
  symbol?: string;
  side?: 'BUY' | 'SELL';
  user?: string;
  orderId?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit: number;
}

export async function searchTrades(db: Db, q: TradeSearch): Promise<Page<AdminTradeRow>> {
  const userId = q.user ? await resolveUserId(db, q.user) : undefined;
  const c = cursorId(q.cursor);
  const take = q.limit + 1;

  let items: AdminTradeRow[];
  if (q.market === 'SPOT') {
    const where: SQL[] = [];
    if (userId) where.push(eq(trades.userId, userId));
    if (q.symbol) where.push(eq(trades.symbol, q.symbol));
    if (q.side) where.push(eq(trades.side, q.side));
    if (q.orderId) where.push(eq(trades.orderId, numericId(q.orderId)));
    if (q.from) where.push(gte(trades.createdAt, new Date(q.from)));
    if (q.to) where.push(lte(trades.createdAt, new Date(q.to)));
    if (c) where.push(lt(trades.id, c));
    const rows = await db
      .select({ t: trades, uid: users.uid, email: users.email })
      .from(trades)
      .innerJoin(users, eq(users.id, trades.userId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(trades.id))
      .limit(take);
    items = rows.map(({ t, uid, email }) => {
      const s = serializeTrade(t);
      return { market: 'SPOT', id: s.id, orderId: s.orderId, userId: t.userId, uid: String(uid), email, symbol: s.symbol, side: s.side, price: s.price, quantity: s.quantity, quoteQty: s.quoteQty, fee: s.fee, feeAsset: s.feeAsset, tax: s.tax, liquidity: s.liquidity, realizedPnl: s.realizedPnl, createdAt: s.createdAt };
    });
  } else {
    const where: SQL[] = [];
    if (userId) where.push(eq(futuresTrades.userId, userId));
    if (q.symbol) where.push(eq(futuresTrades.symbol, q.symbol));
    if (q.side) where.push(eq(futuresTrades.side, q.side));
    if (q.orderId) where.push(eq(futuresTrades.orderId, numericId(q.orderId)));
    if (q.from) where.push(gte(futuresTrades.createdAt, new Date(q.from)));
    if (q.to) where.push(lte(futuresTrades.createdAt, new Date(q.to)));
    if (c) where.push(lt(futuresTrades.id, c));
    const rows = await db
      .select({ t: futuresTrades, uid: users.uid, email: users.email })
      .from(futuresTrades)
      .innerJoin(users, eq(users.id, futuresTrades.userId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(futuresTrades.id))
      .limit(take);
    items = rows.map(({ t, uid, email }) => {
      const s = serializeFuturesTrade(t);
      return { market: 'FUTURES', id: s.id, orderId: s.orderId, userId: t.userId, uid: String(uid), email, symbol: s.symbol, side: s.side, price: s.price, quantity: s.quantity, quoteQty: s.quoteQty, fee: s.fee, feeAsset: s.feeAsset, tax: null, liquidity: s.liquidity, realizedPnl: s.realizedPnl, createdAt: s.createdAt };
    });
  }
  const more = items.length > q.limit;
  const page = more ? items.slice(0, q.limit) : items;
  return { items: page, nextCursor: more ? page[page.length - 1]!.id : null };
}

/** The user's sessions that are still valid (not revoked, not expired), newest first. Only metadata: no token, no token hash. */
export async function userSessions(db: Db, userId: string): Promise<{ items: AdminUserSession[] }> {
  const rows = await db
    .select({ id: sessions.id, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, expiresAt: sessions.expiresAt, ip: sessions.ip, userAgent: sessions.userAgent, mfaVerified: sessions.mfaVerified })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.createdAt), desc(sessions.id))
    .limit(SESSION_LIMIT);
  return { items: rows.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), lastSeenAt: r.lastSeenAt.toISOString(), expiresAt: r.expiresAt.toISOString(), ip: r.ip, userAgent: r.userAgent, mfaVerified: r.mfaVerified })) };
}
