import { z } from 'zod';
import { DataStatus, IsoDateTime, PaginationQuery, SymbolCode, TimeRangeQuery } from './common.ts';
import { NewsEventType, SnapshotNewsItem } from './analysis.ts';

/**
 * Module N (0.17.0) — admin-only view of the news layer behind the analysis system (C-D1: no user-facing endpoint).
 * Item/event schemas shared with the snapshot live in analysis.ts (`NewsEventType`, `SnapshotNewsItem`, `SnapshotMacroEvent`).
 * Only titles, URLs, sources, times and derived labels are stored — never article text (copyright).
 */

/** How a source delivers news. */
export const NewsSourceKind = z.enum(['GDELT', 'RSS', 'OFFICIAL_CALENDAR', 'FRED']);
export type NewsSourceKind = z.infer<typeof NewsSourceKind>;

/**
 * Health of one ingestion source. `status`: LIVE = last success within 3 cycles; STALE = more than 3 cycles without
 * success; UNAVAILABLE = never succeeded since start. Unknown measurements are null, never 0
 * (`medianLagSeconds` = median of firstSeenAt − publishedAt over the recent window, null when no item has a publishedAt).
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
  medianLagSeconds: z.number().int().nonnegative().nullable(),
  itemsLast24h: z.number().int().nonnegative(),
});
export type NewsSourceHealth = z.infer<typeof NewsSourceHealth>;

/** Snapshot item + where it came from. */
export const NewsItemAdmin = SnapshotNewsItem.extend({
  sourceKind: NewsSourceKind,
  /** Ingestion run that first stored it; null for items without a recorded run (backfill). */
  ingestedRunId: z.string().min(1).nullable(),
});
export type NewsItemAdmin = z.infer<typeof NewsItemAdmin>;

/**
 * Filter of the admin news list (newest `firstSeenAt` first). `from`/`to` bound `firstSeenAt` (inclusive), the
 * point-in-time axis, not `publishedAt`. `source` = exact source `name`. `from` > `to` is a VALIDATION_ERROR.
 */
export const AdminNewsItemsQuery = z
  .object({
    symbol: SymbolCode.optional(),
    eventType: NewsEventType.optional(),
    source: z.string().min(1).max(100).optional(),
  })
  .extend(TimeRangeQuery.shape)
  .extend(PaginationQuery.shape)
  .refine((q) => q.from === undefined || q.to === undefined || Date.parse(q.from) <= Date.parse(q.to), {
    message: 'from must not be after to',
    path: ['from'],
  });
export type AdminNewsItemsQuery = z.infer<typeof AdminNewsItemsQuery>;

export const AdminNewsSources = z.object({ items: z.array(NewsSourceHealth) });
export type AdminNewsSources = z.infer<typeof AdminNewsSources>;
