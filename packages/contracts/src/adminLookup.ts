import { z } from 'zod';
import { DecimalString, IsoDateTime, OrderSide, OrderStatus, PaginationQuery, SymbolCode, TimeRangeQuery } from './common.ts';
import { OrderSource } from './orders.ts';

/**
 * Back office lookup and export (batch AD1): every order / fill of the whole exchange, a customer's live sessions,
 * and CSV exports of the audit log and the user list. Read-only.
 */

export const AdminMarket = z.enum(['SPOT', 'FUTURES']);
export type AdminMarket = z.infer<typeof AdminMarket>;

/** A user reference the admin may type: the 8-digit UID or the user id (uuid). Anything else is a VALIDATION_ERROR. */
export const AdminUserRef = z
  .string()
  .trim()
  .regex(/^(\d{8}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i, 'UID (8 digits) or user id (uuid)');

const NumericId = z.string().trim().regex(/^\d{1,18}$/, 'numeric id');

export const AdminOrderSearchQuery = z
  .object({
    market: AdminMarket,
    symbol: SymbolCode.optional(),
    /** open = NEW / PARTIALLY_FILLED; closed = every other status. Default all. */
    status: z.enum(['open', 'closed', 'all']).default('all'),
    side: OrderSide.optional(),
    user: AdminUserRef.optional(),
    orderId: NumericId.optional(),
    clientOrderId: z.string().trim().min(1).max(64).optional(),
  })
  .extend(TimeRangeQuery.shape);
export const AdminOrderSearchListQuery = AdminOrderSearchQuery.extend(PaginationQuery.shape);

/** One order of any user, Spot or Futures, with the owner's identity. Money is a string; `null` = not applicable / unknown. */
export const AdminOrderRow = z.object({
  market: AdminMarket,
  id: z.string(),
  clientOrderId: z.string(),
  userId: z.string(),
  uid: z.string(),
  email: z.string(),
  /** Spot: USER / GRID / DCA. Futures orders have no source (null). */
  source: OrderSource.nullable(),
  /** Grid bot id / DCA plan id for bot orders. */
  sourceId: z.string().nullable(),
  symbol: SymbolCode,
  side: OrderSide,
  /** Spot: MARKET, LIMIT, STOP_LIMIT, …; Futures: MARKET or LIMIT. */
  type: z.string(),
  status: OrderStatus,
  price: DecimalString.nullable(),
  quantity: DecimalString.nullable(),
  executedQty: DecimalString,
  avgPrice: DecimalString.nullable(),
  /** Futures only. */
  leverage: z.number().int().nullable(),
  closeReason: z.string().nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type AdminOrderRow = z.infer<typeof AdminOrderRow>;

export const AdminTradeSearchQuery = z
  .object({
    market: AdminMarket,
    symbol: SymbolCode.optional(),
    side: OrderSide.optional(),
    user: AdminUserRef.optional(),
    orderId: NumericId.optional(),
  })
  .extend(TimeRangeQuery.shape);
export const AdminTradeSearchListQuery = AdminTradeSearchQuery.extend(PaginationQuery.shape);

/** One fill of any user. `tax` is Spot only (null for Futures); `realizedPnl` is null for a Spot BUY / a SELL without a cost basis. */
export const AdminTradeRow = z.object({
  market: AdminMarket,
  id: z.string(),
  orderId: z.string(),
  userId: z.string(),
  uid: z.string(),
  email: z.string(),
  symbol: SymbolCode,
  side: OrderSide,
  price: DecimalString,
  quantity: DecimalString,
  quoteQty: DecimalString,
  fee: DecimalString,
  feeAsset: z.string(),
  tax: DecimalString.nullable(),
  liquidity: z.enum(['MAKER', 'TAKER']),
  realizedPnl: DecimalString.nullable(),
  createdAt: IsoDateTime,
});
export type AdminTradeRow = z.infer<typeof AdminTradeRow>;

/** A session that is still valid. The token (or its hash) is never returned. */
export const AdminUserSession = z.object({
  id: z.string(),
  createdAt: IsoDateTime,
  lastSeenAt: IsoDateTime,
  expiresAt: IsoDateTime,
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  mfaVerified: z.boolean(),
});
export type AdminUserSession = z.infer<typeof AdminUserSession>;
export const AdminUserSessions = z.object({ items: z.array(AdminUserSession) });

/** Header of `adminAuditExport` (before / after are JSON text). Times in UTC and GMT+7. */
export const AUDIT_EXPORT_COLUMNS = ['auditId', 'time_utc', 'time_gmt7', 'actorId', 'actorEmail', 'action', 'targetType', 'targetId', 'reason', 'ip', 'before', 'after'] as const;

/** Header of `adminUsersExport` (contains e-mail addresses: permission `users.export`). */
export const USERS_EXPORT_COLUMNS = ['uid', 'userId', 'email', 'name', 'role', 'status', 'emailVerified', 'twoFactorEnabled', 'signalsAccess', 'isBot', 'createdAt_utc', 'lastSeenAt_utc'] as const;

/**
 * CSV injection guard for FREE-TEXT cells (e-mail, name, reason, ip, JSON text): a cell that a spreadsheet could read as a
 * formula (first character `=` `+` `-` `@`, tab or CR) gets a leading apostrophe. Never apply it to number cells
 * (a negative amount legitimately starts with `-`).
 */
export function csvTextCell(v: string | null): string | null {
  return v !== null && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}
