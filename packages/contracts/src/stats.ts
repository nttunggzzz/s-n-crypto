import { z } from 'zod';
import { DecimalString, IsoDateTime } from './common.ts';

/**
 * Shared shapes for R statistics (docs/plans/quy-uoc-R-va-nguon-du-lieu.md). Used by the trading journal
 * (Module A, `journalStats`) and later by the signal statistics / M3 gate (Module C). Every number is computed
 * by `@cex/core` (`summarizeR` in rMetrics.ts) on the server — field names are the same as there. The UI shows these
 * values, it never recomputes them.
 */

/**
 * Where the numbers of a statistics response come from. One response = exactly one basis; sources are never mixed.
 *  - ACTUAL_FILLS: the user's own fills on this exchange (trading journal);
 *  - MODELED_CANDLES: the signal engine scored on closed 1m candles + its fee/slippage model (Module C);
 *  - BOT_FILLS: real orders of the signal bot account on this exchange (Module C, compared only, never merged).
 */
export const StatsBasis = z.enum(['ACTUAL_FILLS', 'MODELED_CANDLES', 'BOT_FILLS']);
export type StatsBasis = z.infer<typeof StatsBasis>;

/** WIN when R > 0 (or net PnL > 0 when R is null), LOSS when < 0, BREAKEVEN when 0 after rounding to 8 decimals (`rOutcome`). */
export const TradeOutcome = z.enum(['WIN', 'LOSS', 'BREAKEVEN']);
export type TradeOutcome = z.infer<typeof TradeOutcome>;

/** A point of the cumulative R curve (items with an R only), in the order of (closedAt, id). */
export const RCurvePoint = z.object({
  /** journal entry id / signal id */
  id: z.string(),
  /** when the item closed (journal: entry closedAt; signals: exitedAt) */
  closedAt: IsoDateTime,
  r: DecimalString,
  /** Σ r up to this item. The curve starts at 0 before the first point (C_0 = 0). */
  cumR: DecimalString,
});
export type RCurvePoint = z.infer<typeof RCurvePoint>;

/** A point of the cumulative net-PnL curve (items with a net PnL only), in the order of (closedAt, id). */
export const PnlCurvePoint = z.object({
  id: z.string(),
  closedAt: IsoDateTime,
  netPnl: DecimalString,
  cumNetPnl: DecimalString,
});
export type PnlCurvePoint = z.infer<typeof PnlCurvePoint>;

/**
 * Summary of a series of closed items (`summarizeR`). With count = 0 every metric is null (counts 0, curves empty) —
 * never 0 by guess. Decimal values have 8 decimals; ratios are fractions ("0.57142857" = 57.14 %).
 * R metrics use only items with an R; USDT metrics only items with a net PnL; outcomes (win rate, streaks) every item.
 */
export const RSummary = z.object({
  /** `R_METRICS_VERSION` of @cex/core that produced these numbers (changes when the R method changes). */
  rMetricsVersion: z.number().int().positive(),
  count: z.number().int().nonnegative(),
  /** items with an R (journal: entries with an initial stop) */
  countWithR: z.number().int().nonnegative(),
  countWithNetPnl: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  breakevens: z.number().int().nonnegative(),
  /** wins ÷ count (breakevens in the denominator) */
  winRate: DecimalString.nullable(),
  totalR: DecimalString.nullable(),
  /** mean R = totalR ÷ countWithR */
  expectancyR: DecimalString.nullable(),
  /** mean R of the winning R (null if none) */
  avgWinR: DecimalString.nullable(),
  /** mean R of the losing R, negative (null if none) */
  avgLossR: DecimalString.nullable(),
  /** Σ winning R ÷ |Σ losing R|; null without a losing R, "0.00000000" without a winning R */
  profitFactorR: DecimalString.nullable(),
  /** largest fall of the cumulative R from a previous peak (curve starting at 0), positive */
  maxDrawdownR: DecimalString.nullable(),
  /** Σ net PnL in USDT (fees and funding included) */
  totalNetPnl: DecimalString.nullable(),
  avgNetPnl: DecimalString.nullable(),
  /** Σ winning USDT ÷ |Σ losing USDT|; null without a loss */
  profitFactorUsdt: DecimalString.nullable(),
  maxDrawdownUsdt: DecimalString.nullable(),
  /** longest run of WIN / LOSS (a BREAKEVEN ends both runs) */
  longestWinStreak: z.number().int().nonnegative().nullable(),
  longestLossStreak: z.number().int().nonnegative().nullable(),
  rCurve: z.array(RCurvePoint),
  pnlCurve: z.array(PnlCurvePoint),
});
export type RSummary = z.infer<typeof RSummary>;
