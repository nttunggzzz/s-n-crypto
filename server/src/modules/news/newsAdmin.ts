import { and, eq, gt, gte, lte, sql, type SQL } from 'drizzle-orm';
import { NEWS_MACRO_EVENTS_MAX_DAYS, type DataStatus, type NewsItemAdmin, type NewsSourceHealth, type NewsSourceKind, type SnapshotMacroEvent } from '@cex/contracts';
import type { Db } from '../../db/client.ts';
import { macroEvents, newsItems, newsSources } from '../../db/schema.ts';
import { AppError } from '../../lib/errors.ts';
import { CALENDAR_SOURCE_NAME, NEWS_SOURCES } from './sources.ts';

/**
 * Read side of the admin news endpoints (Module N, N2b). Semantics are the ones of the contract mock
 * (`packages/contracts/src/mocks/news.ts`): the server and the mock must answer the same way.
 * Nothing here invents data: unknown values stay null (tone, actual, publishedAt, lag).
 */

const DAY_MS = 86_400_000;
/** A source is LIVE while its last success is at most this many polling cycles old (contract: "within 3 cycles"). */
export const STALE_AFTER_CYCLES = 3;
/** The calendar must list a HIGH event within this many days ahead, else the file has run out and the source is STALE. */
export const CALENDAR_HORIZON_DAYS = 45;

// ───────────────────────────── items

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeItemCursor(firstSeenAt: Date, id: string): string {
  return Buffer.from(`${firstSeenAt.toISOString()}|${id}`).toString('base64url');
}

/** Times the API accepts: the database cannot hold what `Date` can (year 0, +275760), and nothing here predates 1970. */
export const MIN_TIME = Date.UTC(1970, 0, 1);
export const MAX_TIME = Date.UTC(9999, 11, 31, 23, 59, 59, 999);

/** A `from` / `to` bound: a real instant between 1970 and 9999, else VALIDATION_ERROR (never a database error). */
export function parseBound(text: string, field: string): Date {
  const d = new Date(text);
  if (Number.isNaN(d.getTime()) || d.getTime() < MIN_TIME || d.getTime() > MAX_TIME) throw new AppError('VALIDATION_ERROR', `${field} is outside 1970-01-01 .. 9999-12-31`);
  return d;
}

/**
 * Opaque cursor = base64url of `firstSeenAt|id` as we wrote it (ISO with milliseconds, year 1970..9999, a uuid).
 * Anything else, including a date that does not read back identically, is a VALIDATION_ERROR (never an empty page).
 */
export function decodeItemCursor(cursor: string): { t: Date; id: string } {
  const bad = () => new AppError('VALIDATION_ERROR', 'Invalid cursor');
  const text = Buffer.from(cursor, 'base64url').toString();
  const sep = text.indexOf('|');
  if (sep < 0) throw bad();
  const time = text.slice(0, sep);
  const id = text.slice(sep + 1);
  const t = new Date(time);
  if (Number.isNaN(t.getTime()) || t.toISOString() !== time || t.getTime() < MIN_TIME || t.getTime() > MAX_TIME || !UUID.test(id)) throw bad();
  return { t, id: id.toLowerCase() };
}

/** numeric(38,18) comes back as "3.200000000000000000"; the API shows "3.2" (same value, no trailing zeros). */
export function plainDecimal(value: string): string {
  return value.includes('.') ? value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : value;
}

export interface NewsItemsFilter {
  symbol?: string | undefined;
  eventType?: string | undefined;
  sourceId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  cursor?: string | undefined;
  limit: number;
}

export async function listNewsItems(db: Db, q: NewsItemsFilter): Promise<{ items: NewsItemAdmin[]; nextCursor: string | null }> {
  const where: SQL[] = [];
  // a symbol filter returns items labelled with that symbol only, never market-wide news (`symbols = {}`)
  if (q.symbol) where.push(sql`${newsItems.symbols} @> ARRAY[${q.symbol}]::text[]`);
  if (q.eventType) where.push(sql`${newsItems.eventTypes} @> ARRAY[${q.eventType}]::text[]`);
  if (q.sourceId) where.push(eq(newsItems.sourceId, q.sourceId));
  if (q.from) where.push(gte(newsItems.firstSeenAt, parseBound(q.from, 'from')));
  if (q.to) where.push(lte(newsItems.firstSeenAt, parseBound(q.to, 'to')));
  if (q.cursor !== undefined) {
    const c = decodeItemCursor(q.cursor);
    where.push(sql`(${newsItems.firstSeenAt}, ${newsItems.id}) < (${c.t.toISOString()}::timestamptz, ${c.id}::uuid)`);
  }
  const rows = await db
    .select({ item: newsItems, source: newsSources.name, kind: newsSources.kind })
    .from(newsItems)
    .innerJoin(newsSources, eq(newsSources.id, newsItems.sourceId))
    .where(where.length > 0 ? and(...where) : undefined)
    // NULLS LAST = the order of the index news_items_first_seen_idx (both columns are NOT NULL)
    .orderBy(sql`${newsItems.firstSeenAt} DESC NULLS LAST`, sql`${newsItems.id} DESC NULLS LAST`)
    .limit(q.limit + 1);
  const more = rows.length > q.limit;
  const page = more ? rows.slice(0, q.limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map(({ item, source, kind }) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      source,
      publishedAt: item.publishedAt?.toISOString() ?? null,
      firstSeenAt: item.firstSeenAt.toISOString(),
      symbols: item.symbols,
      eventTypes: item.eventTypes as NewsItemAdmin['eventTypes'],
      tone: item.tone === null ? null : plainDecimal(item.tone),
      classifierVersion: item.classifierVersion,
      sourceId: item.sourceId,
      sourceKind: kind,
      ingestedRunId: item.ingestRunId,
    })),
    nextCursor: more && last ? encodeItemCursor(last.item.firstSeenAt, last.item.id) : null,
  };
}

// ───────────────────────────── source health

export interface SourceFacts {
  kind: NewsSourceKind;
  pollIntervalSec: number;
  /** `finished_at` of the newest OK run. */
  lastSuccessAt: Date | null;
  /** ERROR runs after the newest OK run (NOT_PUBLISHED_YET is neither a success nor a failure). */
  consecutiveFailures: number;
  /** Calendar only: a HIGH event is scheduled within the next 45 days (`hasHighEventAhead`). */
  highEventAhead?: boolean;
}

/**
 * LIVE = last success within 3 polling cycles; STALE = succeeded before but not within 3 cycles; UNAVAILABLE = never
 * succeeded. A static calendar file is LIVE while its latest load succeeded and it still lists a HIGH event in the next
 * 45 days (it is only read at start-up, so its age says nothing, but a file that ran out of dates is stale data);
 * STALE when the latest load failed and older data is kept, or when no HIGH event lies ahead.
 */
export function sourceStatus(f: SourceFacts, now: Date): DataStatus {
  if (f.lastSuccessAt === null) return 'UNAVAILABLE';
  if (f.kind === 'OFFICIAL_CALENDAR') return f.consecutiveFailures === 0 && f.highEventAhead === true ? 'LIVE' : 'STALE';
  return now.getTime() - f.lastSuccessAt.getTime() <= STALE_AFTER_CYCLES * f.pollIntervalSec * 1000 ? 'LIVE' : 'STALE';
}

interface HealthRow extends Record<string, unknown> {
  id: string;
  name: string;
  kind: NewsSourceKind;
  enabled: boolean;
  poll_interval_sec: number;
  last_success_ms: string | null;
  last_error_ms: string | null;
  failures: string;
  items_24h: string;
  median_lag_ms: string | null;
}

/** Is a HIGH macro event scheduled in (now, now + 45 days]? A range on `macro_events_at_idx`. */
export async function hasHighEventAhead(db: Db, now: Date): Promise<boolean> {
  const rows = await db
    .select({ id: macroEvents.id })
    .from(macroEvents)
    .where(and(sql`${macroEvents.importance} = 'HIGH'`, gt(macroEvents.scheduledAt, now), lte(macroEvents.scheduledAt, new Date(now.getTime() + CALENDAR_HORIZON_DAYS * DAY_MS))))
    .limit(1);
  return rows.length > 0;
}

const catalogueOrder = new Map(NEWS_SOURCES.map((s, i) => [s.id, i]));

/** Health of every source from `news_ingest_runs` and `news_items` (the last 24 h before `now`). */
export async function listSourceHealth(db: Db, now: Date = new Date()): Promise<NewsSourceHealth[]> {
  const since = new Date(now.getTime() - DAY_MS).toISOString();
  const highAhead = await hasHighEventAhead(db, now);
  const { rows } = await db.execute<HealthRow>(sql`
    SELECT s.id, s.name, s.kind, s.enabled, s.poll_interval_sec,
           floor(extract(epoch FROM ok.finished_at) * 1000)::bigint AS last_success_ms,
           floor(extract(epoch FROM err.at) * 1000)::bigint AS last_error_ms,
           (SELECT count(*) FROM news_ingest_runs r WHERE r.source_id = s.id AND r.status = 'ERROR' AND (ok.started_at IS NULL OR r.started_at > ok.started_at)) AS failures,
           (SELECT count(*) FROM news_items i WHERE i.source_id = s.id AND i.first_seen_at > ${since}::timestamptz AND i.first_seen_at <= ${now.toISOString()}::timestamptz) AS items_24h,
           (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (i.first_seen_at - i.published_at)) * 1000))::numeric)::bigint
              FROM news_items i WHERE i.source_id = s.id AND i.published_at IS NOT NULL AND i.first_seen_at > ${since}::timestamptz AND i.first_seen_at <= ${now.toISOString()}::timestamptz) AS median_lag_ms
      FROM news_sources s
      LEFT JOIN LATERAL (
        SELECT r.started_at, r.finished_at FROM news_ingest_runs r
         WHERE r.source_id = s.id AND r.status = 'OK' AND r.finished_at IS NOT NULL
         ORDER BY r.started_at DESC LIMIT 1
      ) ok ON true
      LEFT JOIN LATERAL (
        SELECT coalesce(r.finished_at, r.started_at) AS at FROM news_ingest_runs r
         WHERE r.source_id = s.id AND r.status = 'ERROR'
         ORDER BY r.started_at DESC LIMIT 1
      ) err ON true`);
  return rows
    .map((r): NewsSourceHealth => {
      const consecutiveFailures = Number(r.failures);
      // the raw driver hands timestamps over as text, so the query asks for epoch milliseconds
      const lastSuccessAt = r.last_success_ms === null ? null : new Date(Number(r.last_success_ms));
      const lastErrorAt = r.last_error_ms === null ? null : new Date(Number(r.last_error_ms));
      return {
        id: r.id,
        name: r.name,
        kind: r.kind,
        enabled: r.enabled,
        status: sourceStatus({ kind: r.kind, pollIntervalSec: r.poll_interval_sec, lastSuccessAt, consecutiveFailures, highEventAhead: highAhead }, now),
        lastSuccessAt: lastSuccessAt?.toISOString() ?? null,
        lastErrorAt: lastErrorAt?.toISOString() ?? null,
        consecutiveFailures,
        medianLagMs: r.median_lag_ms === null ? null : Number(r.median_lag_ms),
        itemsLast24h: Number(r.items_24h),
      };
    })
    .sort((a, b) => (catalogueOrder.get(a.id) ?? 1e6) - (catalogueOrder.get(b.id) ?? 1e6) || (a.id < b.id ? -1 : 1));
}

// ───────────────────────────── macro events

export interface MacroEventsFilter {
  code?: string | undefined;
  importance?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

/**
 * Window of `adminNewsMacroEvents`: both bounds given = as asked (<= 400 days is checked by the query schema); only `from`
 * = 400 days from it; only `to` = the 400 days ending there; none = 400 days from `now`.
 */
export function macroEventsWindow(q: Pick<MacroEventsFilter, 'from' | 'to'>, now: Date): { from: Date; to: Date } {
  const span = NEWS_MACRO_EVENTS_MAX_DAYS * DAY_MS;
  const given = { from: q.from === undefined ? undefined : parseBound(q.from, 'from').getTime(), to: q.to === undefined ? undefined : parseBound(q.to, 'to').getTime() };
  const from = given.from ?? (given.to !== undefined ? given.to - span : now.getTime());
  const to = given.to ?? from + span;
  // a one-sided window can reach past the supported years: clamp it (no event can lie there)
  const clamp = (ms: number) => new Date(Math.min(Math.max(ms, MIN_TIME), MAX_TIME));
  return { from: clamp(from), to: clamp(to) };
}

export async function listMacroEvents(db: Db, q: MacroEventsFilter, now: Date = new Date()): Promise<SnapshotMacroEvent[]> {
  const w = macroEventsWindow(q, now);
  const where: SQL[] = [gte(macroEvents.scheduledAt, w.from), lte(macroEvents.scheduledAt, w.to)];
  if (q.code) where.push(sql`${macroEvents.code} = ${q.code}`);
  if (q.importance) where.push(sql`${macroEvents.importance} = ${q.importance}`);
  const rows = await db
    .select()
    .from(macroEvents)
    .where(and(...where))
    .orderBy(macroEvents.scheduledAt, macroEvents.code);
  return rows.map((e) => ({
    code: e.code,
    name: e.name,
    scheduledAt: e.scheduledAt.toISOString(),
    importance: e.importance,
    source: CALENDAR_SOURCE_NAME,
    actual: e.actual === null ? null : plainDecimal(e.actual),
    actualKnownAt: e.actualKnownAt?.toISOString() ?? null,
  }));
}
