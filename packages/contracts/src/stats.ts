import { z } from 'zod';
import { DecimalString, IsoDateTime } from './common.ts';

/**
 * Shared shapes for R statistics (docs/plans/quy-uoc-R-va-nguon-du-lieu.md). Used by the trading journal
 * (Module A, `journalStats`) and later by the signal statistics / M3 gate (Module C). Every number is computed
 * by `@cex/core/rMetrics` on the server — the UI shows these values, it never recomputes them.
 */

/**
 * Where the numbers of a statistics response come from. One response = exactly one basis; sources are never mixed.
 *  - ACTUAL_FILLS: the user's own fills on this exchange (trading journal);
 *  - MODELED_CANDLES: the signal engine scored on closed 1m candles + its fee/slippage model (Module C);
 *  - BOT_FILLS: real orders of the signal bot account on this exchange (Module C, compared only, never merged).
 */
export const StatsBasis = z.enum(['ACTUAL_FILLS', 'MODELED_CANDLES', 'BOT_FILLS']);
export type StatsBasis = z.infer<typeof StatsBasis>;

/** WIN when R > 0 (or net PnL > 0 when R is null), LOSS when < 0, BREAKEVEN when 0 after rounding to 8 decimals. */
export const TradeOutcome = z.enum(['WIN', 'LOSS', 'BREAKEVEN']);
export type TradeOutcome = z.infer<typeof TradeOutcome>;

/** One closed item (journal entry / signal) on the cumulative curve, in the order of (closedAt, id). */
export const RCurvePoint = z.object({
  /** When the item closed (journal: entry closedAt; signals: exitedAt). */
  at: IsoDateTime,
  /** Journal entry id / signal id (ties on `at` are ordered by id). */
  id: z.string(),
  /** R of this item; null without an initial stop (the cumulative R does not move). */
  r: DecimalString.nullable(),
  /** Running Σ R after this item. The curve starts at 0 before the first point. */
  cumulativeR: DecimalString,
  /** Net PnL in USDT of this item; null when the basis has no USDT amount. */
  netPnl: DecimalString.nullable(),
  cumulativePnl: DecimalString.nullable(),
});
export type RCurvePoint = z.infer<typeof RCurvePoint>;

/**
 * Summary of a series of closed items (`summarizeR`). With count = 0 every metric is null (never 0 by guess)
 * and `curve` is empty. Ratios are decimal strings, e.g. winRate "0.57142857" = 57.14 %.
 */
export const RSummary = z.object({
  /** `R_METRICS_VERSION` of @cex/core that produced these numbers (changes when the R method changes). */
  rMetricsVersion: z.number().int().positive(),
  /** Closed items in the series. */
  count: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  breakevens: z.number().int().nonnegative(),
  /** wins / count. */
  winRate: DecimalString.nullable(),
  /** Items that have an R (an initial stop); R metrics use only these. */
  rCount: z.number().int().nonnegative(),
  totalR: DecimalString.nullable(),
  /** Average R per item with an R (= expectancy in R). */
  expectancyR: DecimalString.nullable(),
  /** Σ R of wins / |Σ R of losses|; null without a losing R. */
  profitFactorR: DecimalString.nullable(),
  /** Σ USDT of wins / |Σ USDT of losses|; null without a loss. */
  profitFactorUsdt: DecimalString.nullable(),
  /** Σ net PnL in USDT (fees and funding included). */
  netPnl: DecimalString.nullable(),
  /** Largest fall of the cumulative R from a previous peak (curve starting at 0); "0" when it never fell. */
  maxDrawdownR: DecimalString.nullable(),
  maxDrawdownUsdt: DecimalString.nullable(),
  longestWinStreak: z.number().int().nonnegative().nullable(),
  longestLossStreak: z.number().int().nonnegative().nullable(),
  curve: z.array(RCurvePoint),
});
export type RSummary = z.infer<typeof RSummary>;
