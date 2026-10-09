import { z } from 'zod';
import { AssetCode, DecimalString, IsoDateTime } from './common.ts';

/**
 * Average-cost accounting in USDT, maintained by the server on every fill:
 *   BUY  → avgCost = (held × avgCost + USDT paid) / (held + base received after fee)
 *   SELL → realizedPnl += USDT received after fee − quantity × avgCost  (avgCost unchanged)
 * Values that need a live price are null when the price is STALE/UNAVAILABLE — never 0.
 */
export const Position = z.object({
  asset: AssetCode,
  /** Total held (available + locked). */
  quantity: DecimalString,
  /** USDT per unit; null if the asset was never bought on the exchange (e.g. USDT itself). */
  avgCost: DecimalString.nullable(),
  /** quantity × avgCost */
  costBasis: DecimalString.nullable(),
  marketPrice: DecimalString.nullable(),
  marketValue: DecimalString.nullable(),
  unrealizedPnl: DecimalString.nullable(),
  /** unrealizedPnl / costBasis × 100 */
  unrealizedPnlPercent: DecimalString.nullable(),
  /** Lifetime realized PnL of this asset in USDT (after fees). */
  realizedPnl: DecimalString,
  /** Share of the priced total, in percent; null when unpriced. */
  allocationPercent: DecimalString.nullable(),
});
export type Position = z.infer<typeof Position>;

export const Portfolio = z.object({
  positions: z.array(Position),
  /** Same as wallet totalValueUsdt (priced assets only). */
  totalValueUsdt: DecimalString,
  /** Sum over priced non-USDT positions; null if none could be priced. */
  totalUnrealizedPnl: DecimalString.nullable(),
  totalRealizedPnl: DecimalString,
  /** Fees paid, converted to USDT at the fill price. */
  totalFeesUsdt: DecimalString,
  unpricedAssets: z.array(AssetCode),
  asOf: IsoDateTime,
});
export type Portfolio = z.infer<typeof Portfolio>;

export const PortfolioRange = z.enum(['24h', '7d', '30d', '90d', 'all']);
export type PortfolioRange = z.infer<typeof PortfolioRange>;

/**
 * Account value over time from hourly snapshots taken by the server (24h/7d: hourly points;
 * 30d/90d/all: one point per day at 00:00 UTC). History starts when snapshots started — nothing
 * is back-filled. A point is null when some asset had no live price at snapshot time.
 */
export const PortfolioHistory = z.object({
  range: PortfolioRange,
  points: z.array(z.object({ time: IsoDateTime, totalValueUsdt: DecimalString.nullable() })),
});
export type PortfolioHistory = z.infer<typeof PortfolioHistory>;
