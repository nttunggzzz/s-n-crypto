import { z } from 'zod';
import { dec } from '@cex/core';
import { AssetCode, DecimalString, IsoDateTime, PaginationQuery, SymbolCode, TimeRangeQuery } from './common.ts';

/**
 * Vietnam crypto tax — module T (0.15.0). See docs/plans/module-T-thue-viet-nam.md §0, §3.
 *
 * TEST EXCHANGE: the numbers are computed and booked the way a licensed exchange would (TT 32/2026, TT 41/2026),
 * on virtual money. Nothing here is a tax document; the UI labels every tax screen "thử nghiệm" and never uses the
 * name or number of a state form.
 *
 * Rule (decided, do not change in the UI):
 *  - only a spot SELL fill is withheld, when `taxMode = 'WITHHOLD'` at the moment of the fill and the seller's
 *    category is not DOMESTIC_ORG;
 *  - tax of ONE fill = roundUp 8 decimals of (quoteQty × taxRate), on the GROSS value (fee not deducted first),
 *    profit or loss alike; taken in the quote asset (USDT) right after the proceeds and the fee;
 *  - BUY, futures, wallet transfers, faucet, admin adjustments and account resets are never withheld;
 *  - bot SELL fills (grid) are withheld like the user's own.
 * The UI may ESTIMATE it with `roundUp(dec(quoteQty).mul(taxRate))` of @cex/core per fill; the server's number is the truth.
 */

/** OFF: nothing withheld (server default). WITHHOLD: spot SELL fills are withheld at `taxRate`. */
export const TaxMode = z.enum(['OFF', 'WITHHOLD']);
export type TaxMode = z.infer<typeof TaxMode>;

/**
 * Self-declared taxpayer category (no identity document is collected).
 *  - INDIVIDUAL (default): personal income tax 0.1% withheld per SELL fill (resident or not);
 *  - FOREIGN_ORG: corporate income tax 0.1% of the sale, withheld the same way;
 *  - DOMESTIC_ORG: NOT withheld — the organisation declares 20% of (sale − cost − fees) itself;
 *    the summary gives it the sales, fees and realized PnL to do so.
 * A change applies to fills from then on (records keep the category of their own fill).
 */
export const TaxCategory = z.enum(['INDIVIDUAL', 'FOREIGN_ORG', 'DOMESTIC_ORG']);
export type TaxCategory = z.infer<typeof TaxCategory>;

export const TAX_LIMITS = {
  /** Highest `taxRate` an admin can set (1%, like feeRate). */
  maxRate: '0.01',
  /** Rate the server starts with (still OFF until an admin turns it on). */
  defaultRate: '0.001',
  /** Max rows of a CSV export (newest first), like the other exports. */
  exportMaxRows: 10_000,
} as const;

/** Whole Vietnamese dong as a decimal string without decimals, e.g. "16109". Display only (the ledger is in USDT). */
export const VndAmount = z.string().regex(/^\d+$/, 'whole dong');

const atMost8Decimals = (s: string) => !s.includes('.') || s.split('.')[1]!.length <= 8;
const isPositive = (s: string) => !s.startsWith('-') && /[1-9]/.test(s);
/** Exact comparison with @cex/core (refinements also run after a failed regex: never throw on a bad string). */
const atMostMaxRate = (s: string) => {
  try {
    return !dec(s).gt(TAX_LIMITS.maxRate);
  } catch {
    return true; // the DecimalString check already reports it
  }
};

/** 0 < rate ≤ 0.01, at most 8 decimals ("0.001" = 0.1%). Turn withholding off with taxMode OFF, not with rate 0. */
export const TaxRateInput = DecimalString.refine(isPositive, 'must be > 0')
  .refine(atMost8Decimals, 'at most 8 decimals')
  .refine(atMostMaxRate, `must be at most ${TAX_LIMITS.maxRate}`);

/** VND for 1 USDT, > 0, at most 8 decimals (e.g. "26350"). Reference rate typed by the admin — not a market feed. */
export const VndRateInput = DecimalString.refine(isPositive, 'must be > 0').refine(atMost8Decimals, 'at most 8 decimals');

// ───────────────────────────── settings (admin)

export const TaxSettings = z.object({
  taxMode: TaxMode,
  /** Rate used for fills from now on (each record keeps the rate of its own fill). */
  taxRate: DecimalString,
  /** VND per 1 USDT set by the admin; null = not set → every VND amount is null (never guessed). */
  taxVndRate: DecimalString.nullable(),
  /** When taxVndRate was last set or cleared; null = never. */
  taxVndRateUpdatedAt: IsoDateTime.nullable(),
  updatedAt: IsoDateTime,
});
export type TaxSettings = z.infer<typeof TaxSettings>;

/** Only the fields sent change; `taxVndRate: null` clears the rate. Audited (TAX_SETTINGS_UPDATE) with `reason`. */
export const UpdateTaxSettingsRequest = z
  .object({
    taxMode: TaxMode.optional(),
    taxRate: TaxRateInput.optional(),
    taxVndRate: VndRateInput.nullable().optional(),
    /** Same rule as admin `Reason` (not imported: market.ts imports this file and admin.ts imports market.ts). */
    reason: z.string().trim().min(5, 'at least 5 characters').max(500),
  })
  .refine((r) => r.taxMode !== undefined || r.taxRate !== undefined || r.taxVndRate !== undefined, { message: 'change at least one setting' });
export type UpdateTaxSettingsRequest = z.input<typeof UpdateTaxSettingsRequest>;

// ───────────────────────────── taxpayer profile (user)

export const TaxProfile = z.object({
  category: TaxCategory,
  /** Last change by the user; null = never chosen (default INDIVIDUAL). */
  updatedAt: IsoDateTime.nullable(),
});
export type TaxProfile = z.infer<typeof TaxProfile>;

/** Only `category` — any other field (e.g. an ID number) → 400 VALIDATION_ERROR. No document is ever collected. */
export const UpdateTaxProfileRequest = z.strictObject({ category: TaxCategory });
export type UpdateTaxProfileRequest = z.input<typeof UpdateTaxProfileRequest>;

// ───────────────────────────── withholding records

/**
 * One withheld SELL fill (one row per trade, never two). VND fields use the reference rate in force at the fill
 * (snapshot); all three are null when no rate was set then.
 */
export const TaxWithholding = z.object({
  id: z.string(),
  tradeId: z.string(),
  orderId: z.string(),
  symbol: SymbolCode,
  /** Asset of grossQuote and taxAmount: the pair's quote asset (USDT) — same as the trade's feeAsset on SELL. */
  asset: AssetCode,
  /** Base quantity sold. */
  quantity: DecimalString,
  price: DecimalString,
  /** = Trade.quoteQty (before fee and tax). */
  grossQuote: DecimalString,
  /** Rate applied to this fill. */
  taxRate: DecimalString,
  /** = Trade.tax = roundUp8(grossQuote × taxRate). */
  taxAmount: DecimalString,
  /** Category of the seller at the fill (never DOMESTIC_ORG: those fills are not withheld). */
  category: TaxCategory,
  /** VND per 1 USDT at the fill; null = no reference rate then. */
  vndRate: DecimalString.nullable(),
  /** floor(grossQuote × vndRate) whole dong. */
  grossVnd: VndAmount.nullable(),
  /** ceil(taxAmount × vndRate) whole dong (rounded up, like everything the user pays). */
  taxVnd: VndAmount.nullable(),
  createdAt: IsoDateTime,
});
export type TaxWithholding = z.infer<typeof TaxWithholding>;

/** Admin view of a record: the same + whose it is. */
export const AdminTaxWithholding = TaxWithholding.extend({ userId: z.string() });
export type AdminTaxWithholding = z.infer<typeof AdminTaxWithholding>;

/** Filter of the user's records and CSV (newest first). */
export const TaxWithholdingQuery = z.object({ symbol: SymbolCode.optional() }).extend(TimeRangeQuery.shape);
export const TaxWithholdingListQuery = TaxWithholdingQuery.extend(PaginationQuery.shape);

/** Filter of every user's records and of the admin CSV (newest first). */
export const AdminTaxWithholdingQuery = TaxWithholdingQuery.extend({ userId: z.uuid().optional() });
export const AdminTaxWithholdingListQuery = AdminTaxWithholdingQuery.extend(PaginationQuery.shape);

// ───────────────────────────── summaries

/**
 * Totals of a group of withholding records. VND totals are the sum of the records' VND amounts, and null as soon
 * as one record of the group has no VND (`vndMissingCount` > 0) — a partial sum would look complete.
 */
export const TaxTotals = z.object({
  withholdingCount: z.number().int().nonnegative(),
  /** Σ grossQuote of the withheld fills. */
  withheldGrossQuote: DecimalString,
  /** Σ taxAmount. */
  taxAmount: DecimalString,
  withheldGrossVnd: VndAmount.nullable(),
  taxVnd: VndAmount.nullable(),
  /** Records of the group without a VND rate. */
  vndMissingCount: z.number().int().nonnegative(),
});
export type TaxTotals = z.infer<typeof TaxTotals>;

/**
 * The user's own sales in the group: EVERY spot SELL fill, withheld or not (tax OFF, DOMESTIC_ORG, …).
 * DOMESTIC_ORG uses it to declare 20% itself: sellGrossQuote − sellFees − realizedPnl = cost of what was sold.
 */
export const TaxSales = z.object({
  sellCount: z.number().int().nonnegative(),
  /** Σ quoteQty of the SELL fills (gross). */
  sellGrossQuote: DecimalString,
  /** Σ fee of the SELL fills (quote asset). */
  sellFees: DecimalString,
  /** Σ Trade.realizedPnl of the SELL fills that have one (after fee and tax). */
  realizedPnl: DecimalString,
  /** SELL fills without a cost basis (realizedPnl null) — left out of realizedPnl. */
  sellsWithoutCostBasis: z.number().int().nonnegative(),
});
export type TaxSales = z.infer<typeof TaxSales>;

/** Calendar month in Vietnam time (UTC+7), "YYYY-MM" — the withholding declaration period. */
export const TaxMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'YYYY-MM');

/** `year` in Vietnam time (UTC+7); omitted = the current year there. */
export const TaxSummaryQuery = z.object({ year: z.coerce.number().int().min(2020).max(2100).optional() });

export const TaxSummary = z.object({
  year: z.number().int(),
  /** Quote asset of every amount (USDT). */
  asset: AssetCode,
  /** The user's category now (records keep their own). */
  category: TaxCategory,
  totals: TaxTotals.extend(TaxSales.shape),
  /** Always 12 rows, January … December of `year` (UTC+7); a month without activity has zeros. */
  months: z.array(TaxTotals.extend(TaxSales.shape).extend({ month: TaxMonth })),
});
export type TaxSummary = z.infer<typeof TaxSummary>;

/** "YYYY-MM" (month) or "YYYY-Qn" (quarter, n = 1…4), in Vietnam time (UTC+7). */
export const TaxPeriod = z.string().regex(/^\d{4}-((0[1-9]|1[0-2])|Q[1-4])$/, 'YYYY-MM or YYYY-Qn');
export const AdminTaxSummaryQuery = z.object({ period: TaxPeriod });

const AdminTaxGroup = TaxTotals.extend({ userCount: z.number().int().nonnegative() });

export const AdminTaxSummary = z.object({
  period: TaxPeriod,
  /** Start of the period (00:00 UTC+7) as a UTC instant, inclusive. Pass from/to to the withholding list / CSV. */
  from: IsoDateTime,
  /** Last millisecond of the period (inclusive, like every `to` of TimeRangeQuery), e.g. 2026-10 → "2026-10-31T16:59:59.999Z". */
  to: IsoDateTime,
  asset: AssetCode,
  /** All withholding records of the period; userCount = distinct users. */
  totals: AdminTaxGroup,
  /** One row per TaxCategory in enum order (DOMESTIC_ORG is always zero: never withheld). */
  byCategory: z.array(AdminTaxGroup.extend({ category: TaxCategory })),
  /** Pairs with at least one record, highest taxAmount first. */
  bySymbol: z.array(AdminTaxGroup.extend({ symbol: SymbolCode })),
});
export type AdminTaxSummary = z.infer<typeof AdminTaxSummary>;

// ───────────────────────────── CSV exports (UTF-8 with BOM, like the other exports)

/** Header of `taxExport` — "Bảng tổng hợp thuế đã khấu trừ (thử nghiệm)"; times in UTC and GMT+7. */
export const TAX_EXPORT_COLUMNS = [
  'withholdingId',
  'tradeId',
  'orderId',
  'time_utc',
  'time_gmt7',
  'symbol',
  'quantity',
  'price',
  'grossQuote',
  'asset',
  'taxRate',
  'taxAmount',
  'category',
  'vndRate',
  'grossVnd',
  'taxVnd',
] as const;

/** Header of `adminTaxExport` (statement of every user's withholdings). Empty cell = null. */
export const ADMIN_TAX_EXPORT_COLUMNS = [
  'withholdingId',
  'tradeId',
  'orderId',
  'time_utc',
  'time_gmt7',
  'userId',
  'symbol',
  'quantity',
  'price',
  'grossQuote',
  'asset',
  'taxRate',
  'taxAmount',
  'category',
  'vndRate',
  'grossVnd',
  'taxVnd',
] as const;
