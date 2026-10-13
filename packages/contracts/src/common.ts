import { z } from 'zod';

/** Money, price and quantity: always a decimal string, never a JS number. Example: "64250.12000000". */
export const DecimalString = z.string().regex(/^-?\d+(\.\d+)?$/, 'must be a decimal string');
export type DecimalString = z.infer<typeof DecimalString>;

/** Strictly positive decimal string (request inputs). */
export const PositiveDecimalString = DecimalString.refine((s) => !s.startsWith('-') && /[1-9]/.test(s), 'must be > 0');

/** ISO 8601 UTC timestamp, e.g. "2026-10-09T03:00:00.000Z". */
export const IsoDateTime = z.iso.datetime();

/** Epoch milliseconds (used only for candles / market trades, like Binance). */
export const EpochMs = z.number().int().nonnegative();

export const SymbolCode = z.string().regex(/^[A-Z0-9]{2,20}$/, 'symbol like BTCUSDT');
export const AssetCode = z.string().regex(/^[A-Z0-9]{2,12}$/);

export const OrderSide = z.enum(['BUY', 'SELL']);
export type OrderSide = z.infer<typeof OrderSide>;

export const OrderType = z.enum(['MARKET', 'LIMIT', 'STOP_MARKET', 'STOP_LIMIT', 'TRAILING_STOP_MARKET']);
export type OrderType = z.infer<typeof OrderType>;

/** Stop / trailing orders: WAITING until the trigger price is reached, then TRIGGERED. null for other types. */
export const TriggerState = z.enum(['WAITING', 'TRIGGERED']);
export type TriggerState = z.infer<typeof TriggerState>;

/** UP: triggers when the last price rises to >= stopPrice. DOWN: when it falls to <= stopPrice. */
export const TriggerDirection = z.enum(['UP', 'DOWN']);
export type TriggerDirection = z.infer<typeof TriggerDirection>;

/** Why an order ended CANCELED / EXPIRED. */
export const CloseReason = z.enum([
  'USER_CANCELED',
  /** the other leg of its OCO filled or triggered */
  'OCO_SIBLING',
  /** IOC remainder, or a triggered stop-market that the visible book could not fully fill */
  'IOC_REMAINDER',
  'ADMIN',
  /** its grid bot was stopped */
  'BOT_STOPPED',
]);
export type CloseReason = z.infer<typeof CloseReason>;

/** Optional ISO time range filter for history and exports. */
export const TimeRangeQuery = z.object({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

export const TimeInForce = z.enum(['GTC', 'IOC']);
export type TimeInForce = z.infer<typeof TimeInForce>;

export const OrderStatus = z.enum(['NEW', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'REJECTED', 'EXPIRED']);
export type OrderStatus = z.infer<typeof OrderStatus>;

/**
 * Freshness of market data for one symbol.
 * LIVE: updated within the threshold. STALE: no update for too long -> matching is paused.
 * UNAVAILABLE: never received data since start.
 */
export const DataStatus = z.enum(['LIVE', 'STALE', 'UNAVAILABLE']);
export type DataStatus = z.infer<typeof DataStatus>;

export const CandleInterval = z.enum(['1m', '5m', '15m', '1h', '4h', '1d']);
export type CandleInterval = z.infer<typeof CandleInterval>;

export const Role = z.enum(['user', 'support', 'admin', 'owner']);
export type Role = z.infer<typeof Role>;

export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

export const PaginationQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const Empty = z.object({});

/**
 * Response of an endpoint with `format: 'binary'` (0.14.0): raw bytes sent as-is with `contentType`.
 * The server does not validate it against a schema; the typed client has no method for these endpoints —
 * the UI loads them by URL (`<img src={journalAttachmentUrl(id)}>`).
 */
export const BinaryFile = z.object({
  contentType: z.string().min(1),
  data: z.custom<Uint8Array>((v) => v instanceof Uint8Array, 'must be bytes (Uint8Array / Buffer)'),
});
export type BinaryFile = z.infer<typeof BinaryFile>;
