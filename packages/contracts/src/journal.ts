import { z } from 'zod';
import { BinaryFile, DecimalString, IsoDateTime, OrderSide, PaginationQuery, PositiveDecimalString, SymbolCode, TimeRangeQuery } from './common.ts';
import { RSummary, StatsBasis, TradeOutcome } from './stats.ts';

/**
 * Trading journal (phase 5, Module A — docs/plans/module-A-nhat-ky-giao-dich.md). 0.13.0.
 *
 * One entry = one round trip built by the server from the user's own fills (never typed in):
 *  - SPOT: at most one AUTO entry OPEN per (user, symbol). A BUY opens it or adds to it; a SELL is allocated up to the
 *    entry's open quantity (the rest is `unattributedQty`: coins bought before, from the faucet or by a bot); when what
 *    is left is below stepSize, or left × that fill's price < minNotional, the entry closes (the rest is `dustQty`).
 *  - FUTURES: one entry = one position. A fill has up to two legs: CLOSE (into the entry of the position it reduced)
 *    and OPEN (into the entry of the position it opened) — a flip appears in both entries, one leg each.
 *  - Auto-journal (on by default) only records fills made while it is on (`journalSettings`); it never back-fills.
 *    Fills outside its windows stay free: the user can journal them by hand (`journalCreate`, origin MANUAL).
 *  - Bot orders (GRID / DCA / later SIGNAL) and the bot account never enter the journal.
 *  - AUTO entries cannot be deleted (only annotated). MANUAL entries can; their fills become free again.
 *  - Results (PnL, R, outcome) are computed by the server with @cex/core — the UI shows them, never recomputes them.
 *    R = net PnL ÷ (|average entry − initial stop| × entry quantity); no initial stop → R is null (PnL still counts).
 *  - Reconciliation may adjust an entry (`adjustedAt` + `adjustmentReason`), void it (`status: 'VOID'`) or flag it
 *    (`needsReview`). Notes, setup, plan and images are never deleted by it. Statistics exclude VOID and needsReview
 *    entries and say how many (`JournalStats.excluded`).
 */

export const JOURNAL_LIMITS = {
  /** characters of `notes` (plain text, newlines allowed) */
  notes: 5000,
  tags: 10,
  tagLength: 24,
  setupLength: 40,
  attachmentsPerEntry: 4,
  /** bytes of one image after base64 decoding (1 MB) */
  attachmentBytes: 1_048_576,
  /** bytes of all journal images of one user (50 MB) */
  userQuotaBytes: 52_428_800,
  /** characters of `dataBase64` in one upload (1 MB of bytes is 1,398,104 characters) */
  attachmentBase64Chars: 1_400_000,
  /** orderIds / addOrderIds in one request */
  ordersPerRequest: 50,
} as const;

// ───────────────────────────── enums

export const JournalMarket = z.enum(['SPOT', 'FUTURES']);
export type JournalMarket = z.infer<typeof JournalMarket>;
/** SPOT entries are always LONG (spot cannot be sold short). */
export const JournalDirection = z.enum(['LONG', 'SHORT']);
export type JournalDirection = z.infer<typeof JournalDirection>;
/** VOID: cancelled by reconciliation (e.g. the account was reset) — kept for reading, never counted in statistics. */
export const JournalStatus = z.enum(['OPEN', 'CLOSED', 'VOID']);
export type JournalStatus = z.infer<typeof JournalStatus>;
/** AUTO: written by the auto-journal (not deletable). MANUAL: created by the user from free fills (deletable). */
export const JournalOrigin = z.enum(['AUTO', 'MANUAL']);
export type JournalOrigin = z.infer<typeof JournalOrigin>;
/** Fixed list of mistakes the user can tag; statistics group by it ("FOMO cost you 3.4R"). */
export const JournalMistake = z.enum(['FOMO', 'REVENGE', 'OVERSIZE', 'NO_STOP', 'MOVED_STOP', 'EARLY_EXIT', 'LATE_ENTRY', 'IGNORED_PLAN', 'OTHER']);
export type JournalMistake = z.infer<typeof JournalMistake>;
/** WIN / LOSS / BREAKEVEN by R (by net PnL when R is null). Same enum as `TradeOutcome` of the shared R statistics. */
export const JournalOutcome = TradeOutcome;
export type JournalOutcome = TradeOutcome;
/** Statistics range over `closedAt`. */
export const JournalStatsRange = z.enum(['7d', '30d', '90d', 'all']);
export type JournalStatsRange = z.infer<typeof JournalStatsRange>;
/** Why a fill never enters the journal (stored once so it is not looked at again). */
export const JournalFillSkipReason = z.enum([
  /** the order was placed by a bot (GRID, DCA, later SIGNAL) */
  'NOT_USER_SOURCE',
  /** the order belongs to the bot account */
  'BOT_ACCOUNT',
]);
export type JournalFillSkipReason = z.infer<typeof JournalFillSkipReason>;
/** SPOT: a spot fill. OPEN / CLOSE: the opening / closing part of a futures fill (a flip has both). */
export const JournalFillLeg = z.enum(['SPOT', 'OPEN', 'CLOSE']);
export type JournalFillLeg = z.infer<typeof JournalFillLeg>;
/** Why an entry ended. FILLS / LIQUIDATED: CLOSED. ACCOUNT_RESET / ADMIN_CLOSE: VOID (reconciliation). */
export const JournalCloseReason = z.enum(['FILLS', 'LIQUIDATED', 'ACCOUNT_RESET', 'ADMIN_CLOSE']);
export type JournalCloseReason = z.infer<typeof JournalCloseReason>;
/**
 * Differences the journal reconciliation finds (module A §2.3). Also the `adjustmentReason` of an adjusted entry.
 *  - MISSING_FILL: an eligible fill was not recorded yet → recorded now;
 *  - ACCOUNT_RESET: the account was reset (spot) or the position closed by an admin (futures) → entry VOID;
 *  - WALLET_SHORTFALL: the wallet holds less of the coin than the open entries → `needsReview` only;
 *  - FILL_CHANGED: a recorded fill changed → allocations rebuilt;
 *  - FILL_MISSING_SOURCE: a recorded fill no longer exists → rebuilt (entry VOID if it lost its opening fill);
 *  - ALLOCATION_DRIFT: stored allocations differ from a replay in id order → rebuilt;
 *  - RESULT_DRIFT: stored result differs from a recomputation → overwritten.
 */
export const JournalReconcileIssueType = z.enum(['MISSING_FILL', 'ACCOUNT_RESET', 'WALLET_SHORTFALL', 'FILL_CHANGED', 'FILL_MISSING_SOURCE', 'ALLOCATION_DRIFT', 'RESULT_DRIFT']);
export type JournalReconcileIssueType = z.infer<typeof JournalReconcileIssueType>;
/** Image types accepted for journal attachments (the server also checks the file signature). */
export const JournalImageType = z.enum(['image/png', 'image/jpeg', 'image/webp']);
export type JournalImageType = z.infer<typeof JournalImageType>;

/**
 * `details.reason` of a 409 CONFLICT from a journal endpoint (`details` may also carry `orderId` / `tradeId` /
 * `positionId` / `skipReason`). Order of the checks (the mock follows it exactly):
 *  - journalCreate with orderIds, for each id in the order sent: unknown or not yours → 404 NOT_FOUND · BOT_ORDER ·
 *    ORDER_NOT_FILLED · SYMBOL_MISMATCH · FILL_ALREADY_JOURNALED; then over all their fills in id order:
 *    NO_OPENING_FILL · MULTIPLE_ROUND_TRIPS.
 *  - journalCreate with futuresPositionId: unknown or not yours → 404 · FILL_ALREADY_JOURNALED (an entry or a journal row
 *    already has a leg of it) · LEGACY_FUTURES_FILL.
 *  - journalUpdate: entry not yours → 404 · addOrderIds (MARKET_MISMATCH · ENTRY_NOT_EXTENDABLE · the per-order checks
 *    above · NO_OPENING_FILL · MULTIPLE_ROUND_TRIPS) · STOP_LOCKED · STOP_WRONG_SIDE (both judged on the entry as it
 *    would be after addOrderIds). Nothing is changed when any check fails.
 */
export const JournalConflictReason = z.enum([
  /** a fill of the order (or a leg of the position) already belongs to an entry or was skipped as a bot fill */
  'FILL_ALREADY_JOURNALED',
  /** orders of different symbols, or not the entry's symbol */
  'SYMBOL_MISMATCH',
  /** `addOrderIds` on a FUTURES entry (futures entries follow one position) */
  'MARKET_MISMATCH',
  /** the order was placed by a bot (source ≠ USER) or by the bot account; details.skipReason: JournalFillSkipReason */
  'BOT_ORDER',
  /** the order has no fill yet */
  'ORDER_NOT_FILLED',
  /** `initialStop` sent after the first reducing fill (sell / CLOSE leg); change `plan.stop` instead (R does not move) */
  'STOP_LOCKED',
  /** `initialStop` on the wrong side of result.avgEntryPrice (LONG: stop ≥ entry; SHORT: stop ≤ entry) */
  'STOP_WRONG_SIDE',
  /** journalDelete on an AUTO entry (A-D2: auto entries can only be annotated) */
  'AUTO_ENTRY_NOT_DELETABLE',
  /** `addOrderIds` on an AUTO entry or an entry that is not OPEN */
  'ENTRY_NOT_EXTENDABLE',
  /** the entry already has JOURNAL_LIMITS.attachmentsPerEntry images */
  'TOO_MANY_ATTACHMENTS',
  /** nothing opens the entry: the earliest fill of the chosen spot orders is a SELL (spot cannot be sold short) */
  'NO_OPENING_FILL',
  /** the chosen orders make more than one round trip (buy → closed → buy or sell again): choose the orders of one trade */
  'MULTIPLE_ROUND_TRIPS',
  /** the position has fills from before the exchange recorded futures legs (they cannot be split into OPEN / CLOSE) */
  'LEGACY_FUTURES_FILL',
]);
export type JournalConflictReason = z.infer<typeof JournalConflictReason>;

// ───────────────────────────── shared field rules

/** Spot order id / futures position id (bigint in the database). */
const NumericId = z.string().regex(/^[1-9]\d{0,17}$/, 'numeric id');
const noControlChars = (s: string) => !/\p{Cc}/u.test(s);
const SetupName = z.string().trim().min(1).max(JOURNAL_LIMITS.setupLength).refine(noControlChars, 'no control characters');
const TagName = z.string().trim().min(1).max(JOURNAL_LIMITS.tagLength).refine(noControlChars, 'no control characters');
/** Price typed by the user (plan / initial stop): > 0 and fits numeric(38,18). */
const JournalPriceInput = PositiveDecimalString.refine((s) => /^\d{1,20}(\.\d{1,18})?$/.test(s), 'at most 20 integer and 18 decimal digits');
const unique = <T>(a: readonly T[]) => new Set(a).size === a.length;
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const JournalEntryIdParam = z.object({ entryId: z.uuid() });
export const JournalAttachmentIdParam = z.object({ attachmentId: z.uuid() });

// ───────────────────────────── entries

/** What the user planned (display only; R uses `initialStop`). */
export const JournalPlan = z.object({
  entry: DecimalString.nullable(),
  stop: DecimalString.nullable(),
  target: DecimalString.nullable(),
});
export type JournalPlan = z.infer<typeof JournalPlan>;

/**
 * Result computed by the server from the entry's own fills with @cex/core (`computeEntryResult` for SPOT,
 * `futuresEntryResult` for FUTURES — same field names). A-D7: spot PnL is against the entry's own cost, so it can differ
 * from the PnL analysis page while coins bought before are held. null = not known (yet) — show "—", never 0.
 * While OPEN: netPnl, rMultiple, outcome and holdingMs are null; the part already closed is `realizedPnl`.
 * VOID entries keep the last result but are never counted.
 */
export const JournalResult = z.object({
  /** `R_METRICS_VERSION` of @cex/core used for riskUsdt / rMultiple / outcome. */
  rMetricsVersion: z.number().int().positive(),
  market: JournalMarket,
  direction: JournalDirection,
  /** State of the fills when computed (OPEN / CLOSED). The entry's own status, incl. VOID, is `JournalEntry.status`. */
  status: z.enum(['OPEN', 'CLOSED']),
  /** SPOT: Σ bought quantity before fees. FUTURES: Σ quantity of the OPEN legs (not the position's maxQuantity). */
  entryQty: DecimalString.nullable(),
  /** Volume-weighted average entry price before fees (up to 12 decimals). */
  avgEntryPrice: DecimalString.nullable(),
  /** Average price of the allocated sells / CLOSE legs (up to 12 decimals); null before the first exit. */
  avgExitPrice: DecimalString.nullable(),
  /** Net PnL of the part already closed (OPEN entries too); null before the first exit. */
  realizedPnl: DecimalString.nullable(),
  /** USDT after every fee (and funding for futures) of the whole entry. Null until CLOSED. */
  netPnl: DecimalString.nullable(),
  /** Fees in USDT (spot buy fees, taken in the coin, valued at their fill price). Already inside the PnL. */
  fees: DecimalString.nullable(),
  /** FUTURES: net funding (+ received, − paid), inside the PnL. SPOT: null (does not apply). */
  funding: DecimalString.nullable(),
  /** |avgEntryPrice − initialStop| × entryQty (price risk only, fees not added); null without an initial stop. */
  riskUsdt: DecimalString.nullable(),
  /** netPnl ÷ riskUsdt (netPnl already carries the sign of a SHORT); null without an initial stop or while OPEN. */
  rMultiple: DecimalString.nullable(),
  outcome: JournalOutcome.nullable(),
  /** closedAt − openedAt in ms; null while OPEN. */
  holdingMs: z.number().int().nonnegative().nullable(),
  /** SPOT: quantity left below stepSize / minNotional when the entry closed (no PnL counted). FUTURES: null. */
  dustQty: DecimalString.nullable(),
  /** FUTURES: closed by liquidation. SPOT: null. */
  liquidated: z.boolean().nullable(),
  /** FUTURES: Σ OPEN legs − Σ CLOSE legs = the position's open quantity (false = legs missing; numbers still from the position). SPOT: null. */
  legsConsistent: z.boolean().nullable(),
});
export type JournalResult = z.infer<typeof JournalResult>;

/** One leg of one fill allocated to the entry (journalGet). */
export const JournalFill = z.object({
  id: z.string(),
  /** Spot trade id (leg SPOT) or futures trade id (legs OPEN / CLOSE; a flip shows the same tradeId in two entries). */
  tradeId: z.string(),
  orderId: z.string(),
  leg: JournalFillLeg,
  side: OrderSide,
  price: DecimalString,
  /** Quantity of the whole fill (both legs of a flip together). */
  quantity: DecimalString,
  /** Fee of the whole fill, in feeAsset (spot BUY: the coin; spot SELL and futures: USDT). */
  fee: DecimalString,
  feeAsset: z.string(),
  /** Part of the fill counted in this entry: spot ≤ the entry's open quantity; futures = this leg's quantity. */
  allocatedQty: DecimalString,
  /** Spot SELL part beyond the entry's open quantity (belongs to no entry); "0" otherwise. */
  unattributedQty: DecimalString,
  /** USDT of the allocated part (spot SELL: rounded down — what the user received). */
  allocatedQuote: DecimalString,
  /** Fee of the allocated part, in feeAsset. */
  allocatedFee: DecimalString,
  executedAt: IsoDateTime,
});
export type JournalFill = z.infer<typeof JournalFill>;

/** Image metadata. The bytes are at `journalAttachmentUrl(id)` (owner only, 404 for anyone else). */
export const JournalAttachment = z.object({
  id: z.string(),
  entryId: z.string(),
  contentType: JournalImageType,
  bytes: z.number().int().positive(),
  sha256: Sha256,
  createdAt: IsoDateTime,
});
export type JournalAttachment = z.infer<typeof JournalAttachment>;

export const JournalEntry = z.object({
  id: z.string(),
  market: JournalMarket,
  symbol: SymbolCode,
  direction: JournalDirection,
  status: JournalStatus,
  /** null while OPEN. */
  closeReason: JournalCloseReason.nullable(),
  /** Reconciliation found the wallet holds less of the coin than this entry ("check: coins may have been moved"). Not counted in statistics. */
  needsReview: z.boolean(),
  /** Last change made by reconciliation (show a "adjusted by reconciliation" badge with the reason); null if never. */
  adjustedAt: IsoDateTime.nullable(),
  adjustmentReason: JournalReconcileIssueType.nullable(),
  origin: JournalOrigin,
  /** FUTURES: the position this entry follows. SPOT: null. */
  futuresPositionId: z.string().nullable(),
  setup: z.string().nullable(),
  tags: z.array(z.string()),
  plan: JournalPlan,
  /**
   * Initial stop-loss — the denominator of R. Taken from the SL attached to the entry's first BUY order (spot) or to the
   * order that opened the position (futures); otherwise the first one the user enters. null = no stop (R null).
   */
  initialStop: DecimalString.nullable(),
  /** true after the first reducing fill: `initialStop` can no longer change (409 STOP_LOCKED). */
  initialStopLocked: z.boolean(),
  /** Plain text ('' = no notes yet). Never rendered as HTML. */
  notes: z.string(),
  mistakes: z.array(JournalMistake),
  /** Self-assessed execution 1–5; null = not rated. */
  executionScore: z.number().int().min(1).max(5).nullable(),
  /** Quantity still open (0 once CLOSED; for VOID, what was open when it was voided). */
  openQty: DecimalString,
  /** Σ allocated sell quantity / Σ CLOSE legs. */
  exitQty: DecimalString,
  result: JournalResult,
  /** Legs allocated to this entry (detail in journalGet). */
  fillCount: z.number().int().nonnegative(),
  attachmentCount: z.number().int().nonnegative(),
  openedAt: IsoDateTime,
  /** When it became CLOSED or VOID. */
  closedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type JournalEntry = z.infer<typeof JournalEntry>;

export const JournalEntryDetail = JournalEntry.extend({
  /** Oldest first (by fill id, then leg CLOSE before OPEN). */
  fills: z.array(JournalFill),
  attachments: z.array(JournalAttachment),
});
export type JournalEntryDetail = z.infer<typeof JournalEntryDetail>;

// ───────────────────────────── requests

/**
 * MANUAL entry from fills that belong to no entry (made while auto-journal was off, or freed by deleting a MANUAL entry).
 * Exactly one of:
 *  - `orderIds`: ≥ 1 filled spot orders of the same symbol — every fill of them is allocated in fill id order;
 *  - `futuresPositionId`: one futures position — every recorded leg of it.
 * Unknown keys → 400 (strict).
 */
export const JournalCreateRequest = z
  .strictObject({
    orderIds: z.array(NumericId).min(1).max(JOURNAL_LIMITS.ordersPerRequest).refine(unique, 'duplicate order id').optional(),
    futuresPositionId: NumericId.optional(),
  })
  .refine((r) => (r.orderIds === undefined) !== (r.futuresPositionId === undefined), { message: 'provide exactly one of orderIds or futuresPositionId' });
export type JournalCreateRequest = z.input<typeof JournalCreateRequest>;

export const JournalPlanInput = z
  .strictObject({
    entry: JournalPriceInput.nullable().optional(),
    stop: JournalPriceInput.nullable().optional(),
    target: JournalPriceInput.nullable().optional(),
  })
  .refine((p) => p.entry !== undefined || p.stop !== undefined || p.target !== undefined, { message: 'change at least one of entry, stop, target' });

/**
 * Annotate an entry (any status, AUTO or MANUAL). null clears a field. Server-computed fields cannot be written:
 * unknown keys → 400 (strict). `initialStop` after `initialStopLocked` → 409 STOP_LOCKED (omit it when locked);
 * on the wrong side of the average entry → 409 STOP_WRONG_SIDE. Changing it recomputes riskUsdt / rMultiple.
 * `addOrderIds`: only for an OPEN MANUAL SPOT entry (409 ENTRY_NOT_EXTENDABLE / MARKET_MISMATCH otherwise); the entry
 * is rebuilt from all its fills in id order. Order of the checks: see JournalConflictReason.
 */
export const JournalUpdateRequest = z
  .strictObject({
    setup: SetupName.nullable().optional(),
    tags: z.array(TagName).max(JOURNAL_LIMITS.tags).refine(unique, 'duplicate tag').optional(),
    plan: JournalPlanInput.optional(),
    initialStop: JournalPriceInput.nullable().optional(),
    notes: z.string().max(JOURNAL_LIMITS.notes).refine((s) => !s.includes('\u0000'), 'no NUL characters').optional(),
    mistakes: z.array(JournalMistake).refine(unique, 'duplicate mistake').optional(),
    executionScore: z.number().int().min(1).max(5).nullable().optional(),
    addOrderIds: z.array(NumericId).min(1).max(JOURNAL_LIMITS.ordersPerRequest).refine(unique, 'duplicate order id').optional(),
  })
  .refine((r) => Object.values(r).some((v) => v !== undefined), { message: 'change at least one field' });
export type JournalUpdateRequest = z.input<typeof JournalUpdateRequest>;

/** List filters; newest `openedAt` first. `from` / `to` filter `openedAt`. `excluded=true`: VOID or needsReview entries (the ones statistics leave out). */
export const JournalListQuery = z
  .object({
    status: JournalStatus.optional(),
    market: JournalMarket.optional(),
    symbol: SymbolCode.optional(),
    setup: z.string().trim().min(1).max(JOURNAL_LIMITS.setupLength).optional(),
    tag: z.string().trim().min(1).max(JOURNAL_LIMITS.tagLength).optional(),
    origin: JournalOrigin.optional(),
    excluded: z.enum(['true', 'false']).optional(),
  })
  .extend(TimeRangeQuery.shape)
  .extend(PaginationQuery.shape);
export type JournalListQuery = z.input<typeof JournalListQuery>;

// ───────────────────────────── statistics

/** Statistics over CLOSED entries whose `closedAt` is in the range (VOID and needsReview left out and counted in `excluded`). */
export const JournalStatsQuery = z.object({
  range: JournalStatsRange.default('30d'),
  market: JournalMarket.optional(),
  symbol: SymbolCode.optional(),
  setup: z.string().trim().min(1).max(JOURNAL_LIMITS.setupLength).optional(),
  tag: z.string().trim().min(1).max(JOURNAL_LIMITS.tagLength).optional(),
  direction: JournalDirection.optional(),
});
export type JournalStatsQuery = z.input<typeof JournalStatsQuery>;

/**
 * One group of a breakdown (`computeJournalStats` of @cex/core, from `summarizeR` of the group's entries — same names).
 * Only groups with at least one entry are listed, sorted by key ascending (null last; weekdays 1 … 7).
 */
const statsGroup = <K extends z.ZodType>(key: K) =>
  z.object({
    key,
    count: z.number().int().positive(),
    wins: z.number().int().nonnegative(),
    losses: z.number().int().nonnegative(),
    breakevens: z.number().int().nonnegative(),
    winRate: DecimalString.nullable(),
    /** entries of the group with an R */
    countWithR: z.number().int().nonnegative(),
    /** null when no entry of the group has an R */
    totalR: DecimalString.nullable(),
    expectancyR: DecimalString.nullable(),
    /** null without a losing R */
    profitFactorR: DecimalString.nullable(),
    totalNetPnl: DecimalString.nullable(),
  });
/** Group of bySetup: key = the setup, null = entries without a setup. */
export const JournalSetupGroup = statsGroup(z.string().nullable());
export const JournalSymbolGroup = statsGroup(SymbolCode);
export const JournalMarketGroup = statsGroup(JournalMarket);
export const JournalDirectionGroup = statsGroup(JournalDirection);
/** Group of byWeekday: key = ISO weekday of `closedAt` at GMT+7, 1 = Monday … 7 = Sunday. */
export const JournalWeekdayGroup = statsGroup(z.number().int().min(1).max(7));
/** Group of byMistake: an entry with several mistakes counts once in each ("FOMO cost you 3.4R"). */
export const JournalMistakeGroup = statsGroup(JournalMistake);
export type JournalStatsGroup = z.infer<typeof JournalSetupGroup>;

export const JournalStats = z.object({
  /** Always ACTUAL_FILLS: the user's own fills, never signals or bots. */
  basis: StatsBasis.extract(['ACTUAL_FILLS']),
  /** `R_METRICS_VERSION` of @cex/core (same as summary.rMetricsVersion). */
  rMetricsVersion: z.number().int().positive(),
  range: JournalStatsRange,
  /** null for 'all'. */
  from: IsoDateTime.nullable(),
  to: IsoDateTime,
  /** Offset of the weekday grouping in minutes east of UTC (420 = GMT+7). */
  weekdayUtcOffsetMinutes: z.number().int(),
  /** Entries in the same range and filters left out of every number below (show "N entries not counted", link to the list with excluded=true). */
  excluded: z.object({
    void: z.number().int().nonnegative(),
    needsReview: z.number().int().nonnegative(),
  }),
  summary: RSummary,
  bySetup: z.array(JournalSetupGroup),
  bySymbol: z.array(JournalSymbolGroup),
  byMarket: z.array(JournalMarketGroup),
  byDirection: z.array(JournalDirectionGroup),
  byWeekday: z.array(JournalWeekdayGroup),
  byMistake: z.array(JournalMistakeGroup),
});
export type JournalStats = z.infer<typeof JournalStats>;

/** Setups and tags the user already used, most used first (autocomplete). Counts every entry of the user. */
export const JournalNameCount = z.object({ name: z.string(), count: z.number().int().positive() });
export const JournalSetupList = z.object({
  setups: z.array(JournalNameCount),
  tags: z.array(JournalNameCount),
});
export type JournalSetupList = z.infer<typeof JournalSetupList>;

// ───────────────────────────── auto-journal settings (not in Preferences: users must not write the window times)

export const JournalSettings = z.object({
  autoJournal: z.boolean(),
  /** Start of the current auto-journal window ("auto-journal since …"); null when off. Read-only. */
  autoSince: IsoDateTime.nullable(),
});
export type JournalSettings = z.infer<typeof JournalSettings>;

/** Turn auto-journal on (opens a new window from now — earlier fills are never back-filled) or off. Only `autoJournal`: any other key → 400. */
export const JournalUpdateSettingsRequest = z.strictObject({ autoJournal: z.boolean() });
export type JournalUpdateSettingsRequest = z.input<typeof JournalUpdateSettingsRequest>;

// ───────────────────────────── images

/**
 * Upload one image as JSON. `dataBase64`: plain base64 (no `data:` prefix). The UI shrinks the image first (≤ 1600 px,
 * WebP/JPEG ≤ 1 MB). Server checks, in order: entry yours (404) → type and file signature match `contentType`
 * (415 UNSUPPORTED_MEDIA_TYPE; SVG/GIF/other → 415) → decoded size ≤ 1 MB (413 ATTACHMENT_TOO_LARGE) →
 * < 4 images on the entry (409 TOO_MANY_ATTACHMENTS) → user quota 50 MB (413 ATTACHMENT_QUOTA).
 */
export const JournalAttachmentUpload = z.strictObject({
  /** Declared type. Anything but a JournalImageType (e.g. image/svg+xml, image/gif) → 415, not 400 (module A, A4). */
  contentType: z.string().trim().min(1).max(100),
  dataBase64: z
    .string()
    .min(4)
    .max(JOURNAL_LIMITS.attachmentBase64Chars)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'plain base64 (no data: prefix)')
    .refine((s) => s.length % 4 === 0, 'base64 length must be a multiple of 4'),
});
export type JournalAttachmentUpload = z.input<typeof JournalAttachmentUpload>;

/** Bytes of one image (format 'binary'): served with its Content-Type, nosniff, CSP default-src 'none', private cache. */
export const JournalAttachmentFile = BinaryFile;
