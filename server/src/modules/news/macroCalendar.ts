import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq, gt, sql } from 'drizzle-orm';
import { MacroEventCode, MacroEventImportance } from '@cex/contracts';
import type { Db } from '../../db/client.ts';
import { macroEvents, newsIngestRuns } from '../../db/schema.ts';
import { logger } from '../../logger.ts';
import type { Alerter } from '../../ops/alerts.ts';
import { CALENDAR_SOURCE_ID } from './sources.ts';

/**
 * Scheduled macro events (FOMC, CPI, NFP, PCE) from `data/macro-calendar.csv` into `macro_events` (Module N, N2b).
 *
 * Rules (module N section 4, N0 report section 3):
 *  - the file is validated first (header, UTC times, known code and importance, no duplicate); a bad file changes nothing,
 *    is logged, raises an operator alert and never stops the server;
 *  - FUTURE events (`scheduled_at` > now) follow the file exactly: a moved date removes the old future row and adds the new one;
 *  - PAST events are evidence: rows already stored are never changed or deleted (rows of the file that are missing are added);
 *  - everything happens in ONE transaction under an advisory lock, so a crash or a second loader leaves one consistent state.
 * `parseMacroCalendar` and `planMacroCalendar` are pure (tested without a database).
 */

export const MACRO_CALENDAR_HEADER = ['code', 'name', 'scheduledAtUtc', 'importance', 'referencePeriod', 'sourceUrl', 'note'] as const;

export interface MacroCalendarRow {
  code: MacroEventCode;
  name: string;
  scheduledAt: Date;
  importance: MacroEventImportance;
  referencePeriod: string;
  sourceUrl: string;
  note: string | null;
}

/** A calendar file that must not be loaded; `problems` lists every defect found (not only the first). */
export class MacroCalendarError extends Error {
  constructor(readonly problems: string[]) {
    super(`macro calendar rejected: ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? ` (+${problems.length - 5} more)` : ''}`);
    this.name = 'MacroCalendarError';
  }
}

/** Minimal RFC 4180 reader: comma separated, double-quoted fields (with `""`), CRLF or LF, blank lines skipped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let touched = false;
  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    if (touched || row.length > 0) {
      endField();
      if (!(row.length === 1 && row[0] === '')) rows.push(row);
    }
    row = [];
    touched = false;
  };
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') {
      quoted = true;
      touched = true;
    } else if (c === ',') {
      touched = true;
      endField();
    } else if (c === '\n') endRow();
    else if (c === '\r') continue;
    else {
      field += c;
      touched = true;
    }
  }
  if (quoted) throw new MacroCalendarError(['unterminated quoted field']);
  endRow();
  return rows;
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function parseUtc(value: string): Date | null {
  if (!ISO_UTC.test(value)) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // `2021-02-30` must not roll over into March
  return d.toISOString().slice(0, 19) === value.slice(0, 19) ? d : null;
}

const isHttpUrl = (value: string): boolean => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

export const macroKey = (code: string, scheduledAt: Date): string => `${code}|${scheduledAt.getTime()}`;

/** Parses and validates the calendar file; throws `MacroCalendarError` listing every problem. */
export function parseMacroCalendar(text: string): MacroCalendarRow[] {
  const table = parseCsv(text);
  const header = table[0];
  if (!header || header.length !== MACRO_CALENDAR_HEADER.length || header.some((h, i) => h !== MACRO_CALENDAR_HEADER[i])) {
    throw new MacroCalendarError([`header must be exactly "${MACRO_CALENDAR_HEADER.join(',')}"`]);
  }
  const problems: string[] = [];
  const rows: MacroCalendarRow[] = [];
  const seen = new Map<string, number>();
  table.slice(1).forEach((cells, idx) => {
    const line = idx + 2;
    let ok = true;
    const bad = (why: string) => {
      ok = false;
      problems.push(`line ${line}: ${why}`);
    };
    if (cells.length !== MACRO_CALENDAR_HEADER.length) return bad(`expected ${MACRO_CALENDAR_HEADER.length} columns, got ${cells.length}`);
    const [code, name, at, importance, referencePeriod, sourceUrl, note] = cells.map((c) => c.trim()) as [string, string, string, string, string, string, string];
    const codeOk = MacroEventCode.safeParse(code);
    const importanceOk = MacroEventImportance.safeParse(importance);
    const scheduledAt = parseUtc(at);
    if (!codeOk.success) bad(`unknown code "${code}"`);
    if (!importanceOk.success) bad(`unknown importance "${importance}"`);
    if (scheduledAt === null) bad(`scheduledAtUtc "${at}" is not an ISO UTC time (YYYY-MM-DDTHH:MM:SSZ)`);
    if (name === '') bad('name is empty');
    if (referencePeriod === '') bad('referencePeriod is empty');
    if (!isHttpUrl(sourceUrl)) bad(`sourceUrl "${sourceUrl}" is not an http(s) URL`);
    if (!ok || !codeOk.success || !importanceOk.success || scheduledAt === null) return;
    const key = macroKey(code, scheduledAt);
    const first = seen.get(key);
    if (first !== undefined) return bad(`duplicate of line ${first} (${code} at ${at})`);
    seen.set(key, line);
    rows.push({ code: codeOk.data, name, scheduledAt, importance: importanceOk.data, referencePeriod, sourceUrl, note: note === '' ? null : note });
  });
  if (problems.length === 0 && rows.length === 0) problems.push('the file has no events');
  if (problems.length > 0) throw new MacroCalendarError(problems);
  return rows;
}

export interface ExistingMacroEvent {
  code: MacroEventCode;
  scheduledAt: Date;
}

export interface MacroCalendarPlan {
  /** File rows after `now`: inserted, or their descriptive fields refreshed when the row already exists. */
  upsertFuture: MacroCalendarRow[];
  /** File rows up to `now` that are not stored yet (stored past rows are never touched). */
  insertPast: MacroCalendarRow[];
  /** Stored rows after `now` that the file no longer lists. */
  deleteFuture: ExistingMacroEvent[];
  /** Rows that did not exist before (future and past). */
  newRows: number;
}

/** What loading `rows` would change, given what is stored and the time `now`. Pure. */
export function planMacroCalendar(rows: readonly MacroCalendarRow[], existing: readonly ExistingMacroEvent[], now: Date): MacroCalendarPlan {
  const stored = new Set(existing.map((e) => macroKey(e.code, e.scheduledAt)));
  const inFile = new Set(rows.map((r) => macroKey(r.code, r.scheduledAt)));
  const isFuture = (d: Date) => d.getTime() > now.getTime();
  const upsertFuture = rows.filter((r) => isFuture(r.scheduledAt));
  const insertPast = rows.filter((r) => !isFuture(r.scheduledAt) && !stored.has(macroKey(r.code, r.scheduledAt)));
  const deleteFuture = existing.filter((e) => isFuture(e.scheduledAt) && !inFile.has(macroKey(e.code, e.scheduledAt)));
  const newRows = [...upsertFuture, ...insertPast].filter((r) => !stored.has(macroKey(r.code, r.scheduledAt))).length;
  return { upsertFuture, insertPast, deleteFuture, newRows };
}

/**
 * The calendar file: next to this module (`data/`), or - when the server runs as the esbuild bundle `dist/main.js`,
 * where `import.meta.url` is the bundle - under `src/modules/news/data/` of the nearest parent folder that has it.
 */
export function findMacroCalendarFile(from: string = path.dirname(fileURLToPath(import.meta.url))): string {
  for (let dir = from; ; dir = path.dirname(dir)) {
    for (const candidate of [path.join(dir, 'data', 'macro-calendar.csv'), path.join(dir, 'src', 'modules', 'news', 'data', 'macro-calendar.csv')]) {
      if (existsSync(candidate)) return candidate;
    }
    if (path.dirname(dir) === dir) return path.join(from, 'data', 'macro-calendar.csv'); // not found: the read reports it
  }
}

export type MacroCalendarLoad = { ok: true; rows: number; inserted: number; refreshedFuture: number; deletedFuture: number } | { ok: false; error: string };

export interface MacroCalendarOptions {
  csvPath?: string;
  /** Test clock. */
  now?: () => Date;
  /** Operator alerts (Telegram); without one a bad file is only logged. */
  alerter?: Pick<Alerter, 'send'>;
}

/**
 * Loads the calendar file into `macro_events` (see the rules above). NEVER throws: a bad file or a database error is
 * logged, alerted, recorded as an ERROR run of the calendar source, and the stored data stays as it was.
 * The `official-calendar` row of `news_sources` must exist (`syncNewsSources`).
 */
export async function loadMacroCalendar(db: Db, opts: MacroCalendarOptions = {}): Promise<MacroCalendarLoad> {
  const startedAt = (opts.now ?? (() => new Date()))();
  try {
    const rows = parseMacroCalendar(readFileSync(opts.csvPath ?? findMacroCalendarFile(), 'utf8'));
    const plan = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('news:macro-calendar'))`);
      const existing = await tx.select({ code: macroEvents.code, scheduledAt: macroEvents.scheduledAt }).from(macroEvents);
      const p = planMacroCalendar(rows, existing, startedAt);
      // the `scheduled_at > now` guards repeat the plan in SQL: a past row can never be reached by these statements
      for (const e of p.deleteFuture) {
        await tx.delete(macroEvents).where(and(eq(macroEvents.code, e.code), eq(macroEvents.scheduledAt, e.scheduledAt), gt(macroEvents.scheduledAt, startedAt)));
      }
      if (p.upsertFuture.length > 0) {
        await tx
          .insert(macroEvents)
          .values(p.upsertFuture)
          .onConflictDoUpdate({
            target: [macroEvents.code, macroEvents.scheduledAt],
            setWhere: gt(macroEvents.scheduledAt, startedAt),
            set: { name: sql`excluded.name`, importance: sql`excluded.importance`, referencePeriod: sql`excluded.reference_period`, sourceUrl: sql`excluded.source_url`, note: sql`excluded.note` },
          });
      }
      if (p.insertPast.length > 0) await tx.insert(macroEvents).values(p.insertPast).onConflictDoNothing();
      await tx.insert(newsIngestRuns).values({ sourceId: CALENDAR_SOURCE_ID, startedAt, finishedAt: new Date(), status: 'OK', itemsSeen: rows.length, itemsInserted: p.newRows });
      return p;
    });
    logger.info({ rows: rows.length, inserted: plan.newRows, deletedFuture: plan.deleteFuture.length }, 'macro calendar loaded');
    return { ok: true, rows: rows.length, inserted: plan.newRows, refreshedFuture: plan.upsertFuture.length, deletedFuture: plan.deleteFuture.length };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'macro calendar not loaded - keeping the stored events');
    await opts.alerter?.send('news-calendar', 'warn', `Lịch vĩ mô (macro-calendar.csv) không nạp được, giữ dữ liệu cũ: ${error.slice(0, 500)}`).catch(() => undefined);
    await db
      .insert(newsIngestRuns)
      .values({ sourceId: CALENDAR_SOURCE_ID, startedAt, finishedAt: new Date(), status: 'ERROR', error: error.slice(0, 1000) })
      .catch((e: unknown) => logger.error({ err: e }, 'could not record the failed calendar run'));
    return { ok: false, error };
  }
}
