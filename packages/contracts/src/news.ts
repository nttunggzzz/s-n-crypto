import { z } from 'zod';
import { DataStatus, IsoDateTime, PaginationQuery, SymbolCode, TimeRangeQuery } from './common.ts';
import { MacroEventCode, MacroEventImportance, NewsEventType, NewsSourceKind, SnapshotMacroEvent, SnapshotNewsItem } from './analysis.ts';

/**
 * Module N (0.17.0) — admin-only view of the news layer behind the analysis system (C-D1: no user-facing endpoint).
 * Item/event schemas shared with the snapshot live in analysis.ts (`NewsEventType`, `NewsSourceKind`, `SnapshotNewsItem`,
 * `SnapshotMacroEvent`). Only titles, URLs, sources, times and derived labels are stored — never article text (copyright).
 */

/**
 * Health of one ingestion source. `status`: LIVE = last success within 3 cycles; STALE = more than 3 cycles without
 * success; UNAVAILABLE = never succeeded since start. A static calendar source is LIVE while its file is loaded.
 * Unknown measurements are null, never 0.
 * `medianLagMs` = median of (firstSeenAt − publishedAt) in milliseconds over the recent window; null when no item has a
 * publishedAt (GDELT never has one). It MAY be negative: the source stamps publication times in the future relative to our
 * clock. It is never clamped to 0.
 */
export const NewsSourceHealth = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: NewsSourceKind,
  enabled: z.boolean(),
  status: DataStatus,
  lastSuccessAt: IsoDateTime.nullable(),
  lastErrorAt: IsoDateTime.nullable(),
  consecutiveFailures: z.number().int().nonnegative(),
  medianLagMs: z.number().int().nullable(),
  itemsLast24h: z.number().int().nonnegative(),
});
export type NewsSourceHealth = z.infer<typeof NewsSourceHealth>;

/** Snapshot item + where it came from. `sourceId` = `NewsSourceHealth.id` of the source that produced it. */
export const NewsItemAdmin = SnapshotNewsItem.extend({
  sourceId: z.string().min(1),
  sourceKind: NewsSourceKind,
  /** Ingestion run that first stored it; null for items without a recorded run (backfill). */
  ingestedRunId: z.string().min(1).nullable(),
});
export type NewsItemAdmin = z.infer<typeof NewsItemAdmin>;

/** `from` > `to` is an error; an unparsable date is left to the format error of the field itself. */
const fromAfterTo = (q: { from?: string | undefined; to?: string | undefined }) => {
  if (q.from === undefined || q.to === undefined) return false;
  const a = Date.parse(q.from);
  const b = Date.parse(q.to);
  return !Number.isNaN(a) && !Number.isNaN(b) && a > b;
};

/**
 * Filter of the admin news list. Order is `(firstSeenAt DESC, id DESC)`; the cursor is opaque (base64url of
 * `firstSeenAt|id` of the last item; the next page is everything strictly before it). A malformed cursor is a
 * VALIDATION_ERROR, never an empty page. `from`/`to` bound `firstSeenAt` (inclusive), the point-in-time axis, not
 * `publishedAt`. `sourceId` = `NewsSourceHealth.id`. A `symbol` filter returns only items labelled with that symbol,
 * NOT market-wide macro news (`symbols: []`). `from` > `to` is a VALIDATION_ERROR.
 */
export const AdminNewsItemsQuery = z
  .object({
    symbol: SymbolCode.optional(),
    eventType: NewsEventType.optional(),
    sourceId: z.string().min(1).max(100).optional(),
  })
  .extend(TimeRangeQuery.shape)
  .extend(PaginationQuery.shape)
  .refine((q) => !fromAfterTo(q), { message: 'from must not be after to', path: ['from'] });
export type AdminNewsItemsQuery = z.infer<typeof AdminNewsItemsQuery>;

export const AdminNewsSources = z.object({ items: z.array(NewsSourceHealth) });
export type AdminNewsSources = z.infer<typeof AdminNewsSources>;

/** Longest `scheduledAt` window of `adminNewsMacroEvents`. */
export const NEWS_MACRO_EVENTS_MAX_DAYS = 400;
const DAY_MS = 86_400_000;

/**
 * Filter of the scheduled macro events (ordered by `scheduledAt` ascending, no paging). `from`/`to` bound `scheduledAt`
 * (inclusive). Both given: span must be <= 400 days (else VALIDATION_ERROR). Only one given: the window is 400 days from
 * `from` (or ending at `to`). None: 400 days starting now. `from` > `to` is a VALIDATION_ERROR.
 */
export const AdminNewsMacroEventsQuery = z
  .object({
    code: MacroEventCode.optional(),
    importance: MacroEventImportance.optional(),
  })
  .extend(TimeRangeQuery.shape)
  .refine((q) => !fromAfterTo(q), { message: 'from must not be after to', path: ['from'] })
  .refine(
    (q) => {
      if (q.from === undefined || q.to === undefined) return true;
      const a = Date.parse(q.from);
      const b = Date.parse(q.to);
      return Number.isNaN(a) || Number.isNaN(b) || b - a <= NEWS_MACRO_EVENTS_MAX_DAYS * DAY_MS;
    },
    { message: `the window must not exceed ${NEWS_MACRO_EVENTS_MAX_DAYS} days`, path: ['to'] },
  );
export type AdminNewsMacroEventsQuery = z.infer<typeof AdminNewsMacroEventsQuery>;

export const AdminNewsMacroEvents = z.object({ items: z.array(SnapshotMacroEvent) });
export type AdminNewsMacroEvents = z.infer<typeof AdminNewsMacroEvents>;
