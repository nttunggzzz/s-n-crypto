import { z } from 'zod';
import { DataStatus, DecimalString, IsoDateTime, PaginationQuery, SymbolCode, TimeRangeQuery } from './common.ts';
import { PositionSide } from './futures.ts';

/**
 * Back office: Futures risk and exchange numbers (module AD, batch AD2) — read-only, staff only, exchange-wide.
 * Every number that depends on the mark price is `null` while the mark price of that symbol is not LIVE
 * (STALE / UNAVAILABLE): never a stale or guessed value. Days are Vietnam time (GMT+7).
 */

// ───────────────────────────── open positions at risk

export const RISK_POSITION_SORTS = ['liqDistance', 'notional'] as const;

/**
 * `sort=liqDistance` (default): closest to liquidation first (ascending, can be negative); `sort=notional`: largest
 * notional first (descending). In both, rows whose sort key is `null` come last; ties break by `positionId` ascending.
 * `cursor` is an opaque offset into the order computed at request time (the mark prices move, so a page boundary can
 * shift between two requests). `symbol` and `side` narrow `items`; `symbol` also narrows `totals`, `side` does not.
 */
export const AdminRiskPositionsQuery = z.object({
  symbol: SymbolCode.optional(),
  side: PositionSide.optional(),
  sort: z.enum(RISK_POSITION_SORTS).default('liqDistance'),
  ...PaginationQuery.shape,
});
export type AdminRiskPositionsQuery = z.infer<typeof AdminRiskPositionsQuery>;

export const RiskPosition = z.object({
  positionId: z.string(),
  userId: z.string(),
  /** Public 8-digit account number. */
  uid: z.string(),
  email: z.string(),
  /** Signal-bot account (internal), kept so the screen can tell it apart. */
  isBot: z.boolean(),
  symbol: SymbolCode,
  side: PositionSide,
  leverage: z.number().int(),
  /** Open quantity. */
  quantity: DecimalString,
  entryPrice: DecimalString,
  /** LIVE mark price of the symbol; null when it is not LIVE (then notional, unrealizedPnl, liqDistance, marginRatio are null). */
  markPrice: DecimalString.nullable(),
  /** quantity × markPrice. */
  notional: DecimalString.nullable(),
  /** Isolated margin of the position. */
  margin: DecimalString,
  unrealizedPnl: DecimalString.nullable(),
  /** Same estimate as the user's own view (tick-aligned, `liquidationPrice` of @cex/core); null if it can never be liquidated. */
  liquidationPrice: DecimalString.nullable(),
  /**
   * Distance from the mark price to the liquidation price as a fraction of the mark price (6 dp): "0.05" = 5 %.
   * LONG (mark − liq) / mark, SHORT (liq − mark) / mark; negative = the mark is already beyond the liquidation price.
   * null without a live mark, or when the position can never be liquidated.
   */
  liqDistance: DecimalString.nullable(),
  /**
   * maintenanceMargin / (margin + unrealizedPnl) (6 dp), capped at "1.000000" (1 = liquidation threshold; equity ≤ 0 also gives 1).
   * null without a live mark.
   */
  marginRatio: DecimalString.nullable(),
  openedAt: IsoDateTime,
});
export type RiskPosition = z.infer<typeof RiskPosition>;

/** Open interest of one symbol. Quantities are always known; notionals follow the mark price (null when not LIVE). */
export const RiskSymbolTotals = z.object({
  symbol: SymbolCode,
  positions: z.number().int(),
  longQty: DecimalString,
  shortQty: DecimalString,
  longNotional: DecimalString.nullable(),
  shortNotional: DecimalString.nullable(),
  /** Sum of the isolated margins. */
  margin: DecimalString,
  markStatus: DataStatus,
});
export type RiskSymbolTotals = z.infer<typeof RiskSymbolTotals>;

export const AdminRiskPositions = z.object({
  items: z.array(RiskPosition),
  nextCursor: z.string().nullable(),
  /** One row per symbol that has an open position (symbol ascending). */
  totals: z.array(RiskSymbolTotals),
  asOf: IsoDateTime,
});
export type AdminRiskPositions = z.infer<typeof AdminRiskPositions>;

// ───────────────────────────── liquidations

/** Newest first (`liquidatedAt`, then id, descending). `from`/`to` bound `liquidatedAt` (both inclusive). */
export const AdminLiquidationsQuery = TimeRangeQuery.extend({
  symbol: SymbolCode.optional(),
  ...PaginationQuery.shape,
});
export type AdminLiquidationsQuery = z.infer<typeof AdminLiquidationsQuery>;

/**
 * One position closed by the liquidation engine. Quantity, price and fee come from the liquidation order, margin and
 * loss from the ledger entry of the liquidation; each is null only if that record is missing.
 */
export const AdminLiquidation = z.object({
  positionId: z.string(),
  userId: z.string(),
  uid: z.string(),
  email: z.string(),
  isBot: z.boolean(),
  symbol: SymbolCode,
  side: PositionSide,
  leverage: z.number().int(),
  quantity: DecimalString.nullable(),
  entryPrice: DecimalString,
  /** Price the position was closed at (the mark price when it was liquidated). */
  liquidationPrice: DecimalString.nullable(),
  /** Margin of the position just before it was liquidated. */
  margin: DecimalString.nullable(),
  /** Margin the user lost = margin − what was paid back (never negative). */
  lostMargin: DecimalString.nullable(),
  fee: DecimalString.nullable(),
  liquidatedAt: IsoDateTime,
});
export type AdminLiquidation = z.infer<typeof AdminLiquidation>;

// ───────────────────────────── funding

/** Longest window of `adminFundingSummary`. */
export const FUNDING_SUMMARY_MAX_DAYS = 366;
const DAY_MS = 86_400_000;

/**
 * Funding payments with `fundingTime` in [from, to] (both inclusive). Defaults: `to` = now, `from` = 7 days before `to`.
 * `from` > `to` or a window longer than 366 days is a VALIDATION_ERROR.
 */
export const AdminFundingSummaryQuery = TimeRangeQuery.extend({ symbol: SymbolCode.optional() }).refine(
  (q) => {
    if (q.from === undefined || q.to === undefined) return true;
    const a = Date.parse(q.from);
    const b = Date.parse(q.to);
    return Number.isNaN(a) || Number.isNaN(b) || (a <= b && b - a <= FUNDING_SUMMARY_MAX_DAYS * DAY_MS);
  },
  { message: `from must not be after to, and the window must not exceed ${FUNDING_SUMMARY_MAX_DAYS} days`, path: ['to'] },
);
export type AdminFundingSummaryQuery = z.infer<typeof AdminFundingSummaryQuery>;

/** What the holders of one side paid and received. `paid` and `received` are positive; `net` = received − paid. */
export const FundingSide = z.object({
  paid: DecimalString,
  received: DecimalString,
  net: DecimalString,
  payments: z.number().int(),
});
export type FundingSide = z.infer<typeof FundingSide>;

export const FundingSymbolSummary = z.object({
  symbol: SymbolCode,
  long: FundingSide,
  short: FundingSide,
  /** long.net + short.net from the users' point of view: negative = users paid more than they received. */
  net: DecimalString,
  payments: z.number().int(),
});
export type FundingSymbolSummary = z.infer<typeof FundingSymbolSummary>;

export const AdminFundingSummary = z.object({
  /** The window really used (defaults applied). */
  from: IsoDateTime,
  to: IsoDateTime,
  items: z.array(FundingSymbolSummary),
  totals: FundingSymbolSummary.omit({ symbol: true }),
});
export type AdminFundingSummary = z.infer<typeof AdminFundingSummary>;

// ───────────────────────────── exchange numbers per day

export const METRICS_RANGES = ['7d', '30d', '90d'] as const;
export const AdminMetricsQuery = z.object({ range: z.enum(METRICS_RANGES).default('7d') });
export type AdminMetricsQuery = z.infer<typeof AdminMetricsQuery>;

/**
 * One calendar day in Vietnam time (00:00 – 24:00 GMT+7). Volumes are USDT `quoteQty` of the fills (Spot: USDT-quoted
 * pairs only), fees are USDT (a Spot fee paid in the base coin is valued at the price of its own fill), `taxWithheld` is the
 * Vietnam tax withheld on Spot sells. Signal-bot accounts are left out of every number.
 */
export const MetricsDay = z.object({
  /** YYYY-MM-DD, the Vietnam date. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  spotVolume: DecimalString,
  futuresVolume: DecimalString,
  spotFees: DecimalString,
  futuresFees: DecimalString,
  taxWithheld: DecimalString,
  newUsers: z.number().int(),
  /** Distinct users with at least one Spot or Futures fill that day. */
  activeTraders: z.number().int(),
  /** Positions closed by liquidation that day. */
  liquidations: z.number().int(),
});
export type MetricsDay = z.infer<typeof MetricsDay>;

export const MetricsTotals = MetricsDay.omit({ date: true });
export type MetricsTotals = z.infer<typeof MetricsTotals>;

/** `days` holds EVERY day of the range, oldest first, zero days included (today is the last, partial day). */
export const AdminMetrics = z.object({
  range: z.enum(METRICS_RANGES),
  /** Start of the first day (00:00 GMT+7) and the time of the request. */
  from: IsoDateTime,
  to: IsoDateTime,
  days: z.array(MetricsDay),
  /** Sums of the days, except `activeTraders`: distinct users over the whole range. */
  totals: MetricsTotals,
  /** Spot fills of non-USDT pairs in the range: never summed or converted. */
  excludedNonUsdtFills: z.number().int(),
});
export type AdminMetrics = z.infer<typeof AdminMetrics>;
