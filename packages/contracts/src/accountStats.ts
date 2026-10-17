import { z } from 'zod';
import { DecimalString, IsoDateTime } from './common.ts';
import { TaxCategory, TaxMode, TaxMonth } from './tax.ts';

/**
 * Trading volume and withheld tax of ONE user (0.19.0): the profile page shows it for the signed-in user
 * (`accountTradingStats`), the admin user detail for the user it opens (`AdminUserDetail.trading`). Same numbers,
 * same computation on the server. The UI shows them, it never recomputes them.
 *
 * Day and month boundaries are Vietnam time (GMT+7, no daylight saving) - the same rule as the PnL analysis (days) and
 * the tax module (months). Everything is a window ending now: a fill is counted in every window that contains it.
 */

/**
 * Volume of the user's OWN fills (bot-placed orders on the user's account included), in USDT: the sum of the quote
 * notional (`quoteQty`) of every fill, BUY and SELL both. Only USDT-quoted pairs are summed (spot pairs quoted in another
 * asset are counted in `TradingVolume.excludedNonUsdtFills` instead, never converted with a guessed rate). Futures
 * (USDT-margined) volume is the notional of every futures fill, opening and closing.
 */
export const VolumeBucket = z.object({
  spot: DecimalString,
  futures: DecimalString,
  /** spot + futures */
  total: DecimalString,
  /** Number of fills summed (spot + futures). */
  fills: z.number().int().nonnegative(),
});
export type VolumeBucket = z.infer<typeof VolumeBucket>;

export const TradingVolume = z.object({
  /** Since 00:00 GMT+7 today. */
  today: VolumeBucket,
  /** Calendar days GMT+7: today and the 6 days before it. */
  last7d: VolumeBucket,
  /** Calendar days GMT+7: today and the 29 days before it. */
  last30d: VolumeBucket,
  /** Since 00:00 GMT+7 on the 1st of the current month. */
  thisMonth: VolumeBucket,
  /** The whole previous calendar month, GMT+7 (1st 00:00 up to, not including, the 1st of this month). */
  previousMonth: VolumeBucket,
  /**
   * Spot fills in the last 30 days of pairs NOT quoted in USDT (or of a pair this exchange no longer lists): they are in
   * none of the sums above. 0 on an exchange that only lists USDT pairs.
   */
  excludedNonUsdtFills: z.number().int().nonnegative(),
});
export type TradingVolume = z.infer<typeof TradingVolume>;

/**
 * Tax already WITHHELD (đã khấu trừ) from the user's spot SELL fills in one calendar month GMT+7 - money taken from the
 * proceeds at the fill, not an amount still to pay. USDT. "0.00000000" while the tax was off, and always for a
 * DOMESTIC_ORG user (self-declared: nothing is withheld).
 */
export const MonthTax = z.object({
  month: TaxMonth,
  withheldCount: z.number().int().nonnegative(),
  withheldAmount: DecimalString,
});
export type MonthTax = z.infer<typeof MonthTax>;

export const AccountTradingStats = z.object({
  asOf: IsoDateTime,
  volume: TradingVolume,
  tax: z.object({
    /** The exchange's current tax mode (OFF: nothing is withheld from new fills). */
    taxMode: TaxMode,
    /** The user's self-declared category now (INDIVIDUAL when never chosen). */
    category: TaxCategory,
    thisMonth: MonthTax,
    previousMonth: MonthTax,
  }),
});
export type AccountTradingStats = z.infer<typeof AccountTradingStats>;
