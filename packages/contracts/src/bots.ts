import { z } from 'zod';
import { DecimalString, IsoDateTime, PositiveDecimalString, SymbolCode } from './common.ts';

/**
 * Trading bots on the SPOT wallet (phase 2.6). Their orders are normal spot orders with
 * `source` = 'DCA' | 'GRID' (shown with a badge; a bot's orders can only be canceled by stopping the bot).
 */

// ───────────────────────────── recurring buy (DCA)

export const DcaInterval = z.enum(['DAILY', 'WEEKLY', 'MONTHLY']);
export const DcaStatus = z.enum(['ACTIVE', 'PAUSED', 'CANCELED']);

export const DcaPlan = z.object({
  id: z.string(),
  symbol: SymbolCode,
  /** USDT spent per run (market buy). */
  quoteAmount: DecimalString,
  interval: DcaInterval,
  /** Hour of day, GMT+7 (0–23). */
  hour: z.number().int(),
  /** WEEKLY: 1 = Monday … 7 = Sunday. */
  dayOfWeek: z.number().int().nullable(),
  /** MONTHLY: 1–28. */
  dayOfMonth: z.number().int().nullable(),
  status: DcaStatus,
  nextRunAt: IsoDateTime.nullable(),
  lastRunAt: IsoDateTime.nullable(),
  runs: z.number().int(),
  skipped: z.number().int(),
  totalSpent: DecimalString,
  /** Base received (net of fees). */
  totalBought: DecimalString,
  /** totalSpent / totalBought; null before the first buy. */
  avgPrice: DecimalString.nullable(),
  createdAt: IsoDateTime,
});
export type DcaPlan = z.infer<typeof DcaPlan>;

export const CreateDcaPlanRequest = z
  .object({
    symbol: SymbolCode,
    quoteAmount: PositiveDecimalString,
    interval: DcaInterval,
    hour: z.number().int().min(0).max(23).default(9),
    dayOfWeek: z.number().int().min(1).max(7).optional(),
    dayOfMonth: z.number().int().min(1).max(28).optional(),
  })
  .refine((r) => r.interval !== 'WEEKLY' || r.dayOfWeek !== undefined, { message: 'dayOfWeek is required for WEEKLY', path: ['dayOfWeek'] })
  .refine((r) => r.interval !== 'MONTHLY' || r.dayOfMonth !== undefined, { message: 'dayOfMonth is required for MONTHLY', path: ['dayOfMonth'] });

export const UpdateDcaPlanRequest = z
  .object({
    quoteAmount: PositiveDecimalString.optional(),
    status: z.enum(['ACTIVE', 'PAUSED']).optional(),
  })
  .refine((r) => r.quoteAmount !== undefined || r.status !== undefined, { message: 'change at least one field' });

export const DcaRun = z.object({
  id: z.string(),
  planId: z.string(),
  scheduledAt: IsoDateTime,
  executedAt: IsoDateTime.nullable(),
  status: z.enum(['FILLED', 'SKIPPED']),
  orderId: z.string().nullable(),
  quoteSpent: DecimalString,
  baseBought: DecimalString,
  price: DecimalString.nullable(),
  /** Why it was skipped: error code (INSUFFICIENT_BALANCE, TRADING_HALTED, MARKET_DATA_STALE, …). */
  reason: z.string().nullable(),
});
export type DcaRun = z.infer<typeof DcaRun>;

export const DcaPlanIdParam = z.object({ planId: z.string().regex(/^\d+$/) });

// ───────────────────────────── spot grid bot

export const GridMode = z.enum(['ARITHMETIC', 'GEOMETRIC']);
export const GridBotStatus = z.enum(['RUNNING', 'STOPPED', 'ERROR']);

export const GridBotParams = z.object({
  symbol: SymbolCode,
  lowerPrice: PositiveDecimalString,
  upperPrice: PositiveDecimalString,
  /** Number of cells between the lower and upper price (levels = gridCount + 1). */
  gridCount: z.number().int().min(2).max(100),
  mode: GridMode.default('ARITHMETIC'),
  /** USDT the bot may use from the spot wallet. */
  investment: PositiveDecimalString,
});

/** What the bot would do right now with these params (no order is placed). */
export const GridPreview = z.object({
  levels: z.array(DecimalString),
  lastPrice: DecimalString,
  /** Base quantity traded in each cell. */
  quantityPerGrid: DecimalString,
  buyOrders: z.number().int(),
  sellOrders: z.number().int(),
  /** Base bought at market when the bot starts (for the cells above the price). */
  initialBuyQuantity: DecimalString,
  /** Profit of one buy→sell round in a cell after fees, lowest and highest over the cells (e.g. "0.0042" = 0.42 %). */
  profitPerGridMin: DecimalString,
  profitPerGridMax: DecimalString,
  /** Smallest investment that satisfies the pair's minimum quantity / order value. */
  minInvestment: DecimalString,
});
export type GridPreview = z.infer<typeof GridPreview>;

export const GridBot = z.object({
  id: z.string(),
  symbol: SymbolCode,
  lowerPrice: DecimalString,
  upperPrice: DecimalString,
  gridCount: z.number().int(),
  mode: GridMode,
  investment: DecimalString,
  quantityPerGrid: DecimalString,
  status: GridBotStatus,
  /** Why it stopped: USER, ADMIN, ORDER_CANCELED, START_FAILED, … */
  stopReason: z.string().nullable(),
  /** Realized profit of completed buy→sell rounds (USDT, after fees). */
  gridProfit: DecimalString,
  completedRounds: z.number().int(),
  /** What a running bot holds now (in its orders — partial fills included — + spare). "0" once stopped. */
  baseHeld: DecimalString,
  quoteHeld: DecimalString,
  /**
   * Running: baseHeld × live price + quoteHeld (null when the price is not live).
   * Stopped / error: the value when it stopped (base sold at market, or valued at the price then) — kept for the history.
   */
  totalValue: DecimalString.nullable(),
  /** totalValue − investment (fees included; right after the start ≈ −fee of the initial buy). */
  totalPnl: DecimalString.nullable(),
  openOrders: z.number().int(),
  createdAt: IsoDateTime,
  stoppedAt: IsoDateTime.nullable(),
});
export type GridBot = z.infer<typeof GridBot>;

export const GridBotIdParam = z.object({ botId: z.string().regex(/^\d+$/) });

export const StopGridBotRequest = z.object({
  /** Sell the base the bot holds at market after canceling its orders. */
  sellBase: z.boolean().default(false),
});
