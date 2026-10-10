import { z } from 'zod';
import { DecimalString, IsoDateTime, SymbolCode } from './common.ts';

/**
 * PnL analysis (phase 2.6). Only REALIZED results — open positions are in portfolio / futuresAccount.
 *  - spot: realized PnL of SELL fills against the average cost, already net of fees;
 *  - futures: PnL of closing fills − fees + funding.
 * Days are calendar days in GMT+7. "Closed trades" (win rate) = spot SELL orders with a cost basis
 * + closed futures positions.
 */
export const PnlRange = z.enum(['7d', '30d', '90d', 'all']);
export type PnlRange = z.infer<typeof PnlRange>;

export const PnlDay = z.object({
  /** YYYY-MM-DD (GMT+7) */
  date: z.string(),
  spot: DecimalString,
  futures: DecimalString,
  total: DecimalString,
  /** Running total since the start of the range. */
  cumulative: DecimalString,
});

export const PnlBySymbol = z.object({
  market: z.enum(['SPOT', 'FUTURES']),
  symbol: SymbolCode,
  realized: DecimalString,
  trades: z.number().int(),
  wins: z.number().int(),
});

export const PnlAnalysis = z.object({
  range: PnlRange,
  from: IsoDateTime.nullable(),
  to: IsoDateTime,
  totalRealized: DecimalString,
  spotRealized: DecimalString,
  futuresRealized: DecimalString,
  /** Futures fees and net funding inside futuresRealized (spot fees are inside spotRealized). */
  futuresFees: DecimalString,
  futuresFunding: DecimalString,
  /** Every day of the range (zeros included), oldest first. */
  daily: z.array(PnlDay),
  trades: z.object({
    count: z.number().int(),
    wins: z.number().int(),
    losses: z.number().int(),
    /** wins / count, e.g. "0.6"; null when count = 0. */
    winRate: DecimalString.nullable(),
    avgWin: DecimalString.nullable(),
    avgLoss: DecimalString.nullable(),
    largestWin: DecimalString.nullable(),
    largestLoss: DecimalString.nullable(),
    /** gross wins / |gross losses|; null without losses. */
    profitFactor: DecimalString.nullable(),
  }),
  bySymbol: z.array(PnlBySymbol),
  /** Spot account value drawdown from the hourly snapshots; null without data. e.g. "0.12" = −12 %. */
  maxDrawdown: DecimalString.nullable(),
});
export type PnlAnalysis = z.infer<typeof PnlAnalysis>;

export const PnlQuery = z.object({ range: PnlRange.default('30d') });
