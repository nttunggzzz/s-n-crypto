import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { asc, eq, sql } from 'drizzle-orm';
import { createDatabase, type Database } from '../../db/client.ts';
import { macroEvents, newsIngestRuns, newsSources } from '../../db/schema.ts';
import { TEST_DB_URL } from '../../../test/constants.ts';
import {
  findMacroCalendarFile,
  loadMacroCalendar,
  MACRO_CALENDAR_HEADER,
  MacroCalendarError,
  parseCsv,
  parseMacroCalendar,
  planMacroCalendar,
  type MacroCalendarRow,
} from './macroCalendar.ts';
import { CALENDAR_SOURCE_ID, syncNewsSources } from './sources.ts';

const HEADER = MACRO_CALENDAR_HEADER.join(',');
const URL_FED = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';
const csv = (...lines: string[]) => [HEADER, ...lines].join('\n') + '\n';
const row = (code: string, at: string, over: Partial<Record<'name' | 'importance' | 'period' | 'url' | 'note', string>> = {}) =>
  [code, over.name ?? 'FOMC statement', at, over.importance ?? 'HIGH', over.period ?? 'Period', over.url ?? URL_FED, over.note ?? ''].join(',');
const problemsOf = (text: string): string[] => {
  try {
    parseMacroCalendar(text);
  } catch (e) {
    if (e instanceof MacroCalendarError) return e.problems;
    throw e;
  }
  return [];
};
const rowOf = (code: MacroCalendarRow['code'], at: string): MacroCalendarRow => ({ code, name: 'n', scheduledAt: new Date(at), importance: 'HIGH', referencePeriod: 'p', sourceUrl: URL_FED, note: null });

describe('macro calendar file (the real one)', () => {
  const rows = parseMacroCalendar(readFileSync(findMacroCalendarFile(), 'utf8'));

  it('parses: 119 events, FOMC 56 / PCE 35 / CPI 14 / NFP 14, all with a source link, no duplicates', () => {
    expect(rows).toHaveLength(119);
    const by = (c: string) => rows.filter((r) => r.code === c).length;
    expect([by('FOMC_DECISION'), by('PCE'), by('CPI'), by('NFP')]).toEqual([56, 35, 14, 14]);
    expect(rows.every((r) => r.sourceUrl.startsWith('http') && r.name !== '' && r.referencePeriod !== '')).toBe(true);
    expect(new Set(rows.map((r) => `${r.code}|${r.scheduledAt.toISOString()}`)).size).toBe(119);
  });

  it('keeps the ET to UTC conversion right on both sides of the daylight-saving changes (golden, hand-checked)', () => {
    const at = (code: string, ref: string) => rows.find((r) => r.code === code && r.referencePeriod === ref)!.scheduledAt.toISOString();
    expect(at('FOMC_DECISION', 'October 27-28 2026')).toBe('2026-10-28T18:00:00.000Z'); // 14:00 EDT = UTC-4
    expect(at('FOMC_DECISION', 'December 8-9 2026')).toBe('2026-12-09T19:00:00.000Z'); // 14:00 EST = UTC-5
    expect(at('CPI', 'February 2027')).toBe('2027-03-10T13:30:00.000Z'); // 8:30 EST, 4 days before the change on 14 March
    expect(at('CPI', 'March 2027')).toBe('2027-04-13T12:30:00.000Z'); // 8:30 EDT
  });
});

describe('parseCsv / parseMacroCalendar', () => {
  it('reads quoted fields (comma, doubled quote), CRLF, a BOM and skips blank lines', () => {
    expect(parseCsv('﻿a,b\r\n\r\n"x,1","he said ""hi"""\r\n,\n')).toEqual([
      ['a', 'b'],
      ['x,1', 'he said "hi"'],
      ['', ''],
    ]);
    const text = '﻿' + csv(`FOMC_DECISION,"FOMC, statement",2026-12-09T19:00:00Z,HIGH,"Dec ""8-9""",${URL_FED},"SEP, meeting"`).replace(/\n/g, '\r\n');
    const [only] = parseMacroCalendar(text);
    expect(only).toMatchObject({ name: 'FOMC, statement', referencePeriod: 'Dec "8-9"', note: 'SEP, meeting', importance: 'HIGH' });
    expect(only!.scheduledAt.toISOString()).toBe('2026-12-09T19:00:00.000Z');
    expect(parseMacroCalendar(csv(row('CPI', '2026-12-09T19:00:00Z')))[0]!.note).toBeNull(); // an empty note is NULL
  });

  it('rejects a wrong header, no events, an unterminated quote', () => {
    expect(problemsOf('code,name\nCPI,x\n')[0]).toMatch(/header must be exactly/);
    expect(problemsOf(HEADER.replace('importance', 'priority') + '\n')[0]).toMatch(/header must be exactly/);
    expect(problemsOf('')[0]).toMatch(/header must be exactly/);
    expect(problemsOf(csv())).toEqual(['the file has no events']);
    expect(problemsOf(csv('CPI,"broken,2026-12-09T19:00:00Z,HIGH,p,https://x.test/,'))[0]).toBe('unterminated quoted field');
  });

  it('rejects, line by line: unknown code / importance, non-UTC or impossible time, empty name or period, bad URL, wrong column count, duplicate', () => {
    const p = problemsOf(
      csv(
        row('GDP', '2026-12-09T19:00:00Z'), // 2
        row('CPI', '2026-12-09T19:00:00Z', { importance: 'URGENT' }), // 3
        row('CPI', '2026-12-09T19:00:00+07:00'), // 4: an offset, not UTC
        row('CPI', '2026-12-09 19:00:00'), // 5: not ISO
        row('CPI', '2026-02-30T19:00:00Z'), // 6: no 30 February
        row('CPI', '2026-12-09T25:00:00Z'), // 7
        row('CPI', '2026-12-09T19:00:00Z', { name: '' }), // 8
        row('CPI', '2026-12-09T19:00:00Z', { period: '' }), // 9
        row('CPI', '2026-12-09T19:00:00Z', { url: 'javascript:alert(1)' }), // 10
        row('CPI', '2026-12-09T19:00:00Z', { url: 'not a url' }), // 11
        'CPI,only,three', // 12
        row('PCE', '2026-12-10T13:30:00Z'), // 13 ok
        row('PCE', '2026-12-10T13:30:00Z'), // 14 duplicate of 13
      ),
    );
    expect(p).toHaveLength(12);
    expect(p.join('\n')).toMatch(/line 2: unknown code "GDP"/);
    expect(p.join('\n')).toMatch(/line 3: unknown importance "URGENT"/);
    for (const n of [4, 5, 6, 7]) expect(p.find((x) => x.startsWith(`line ${n}:`))).toMatch(/not an ISO UTC time/);
    expect(p.find((x) => x.startsWith('line 8:'))).toMatch(/name is empty/);
    expect(p.find((x) => x.startsWith('line 9:'))).toMatch(/referencePeriod is empty/);
    for (const n of [10, 11]) expect(p.find((x) => x.startsWith(`line ${n}:`))).toMatch(/not an http\(s\) URL/);
    expect(p.find((x) => x.startsWith('line 12:'))).toMatch(/expected 7 columns, got 3/);
    expect(p.find((x) => x.startsWith('line 14:'))).toMatch(/duplicate of line 13/);
  });

  it('the same time under another code is not a duplicate', () => {
    expect(parseMacroCalendar(csv(row('CPI', '2026-12-10T13:30:00Z'), row('NFP', '2026-12-10T13:30:00Z')))).toHaveLength(2);
  });
});

describe('planMacroCalendar (pure)', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const past = rowOf('CPI', '2026-05-01T12:30:00Z');
  const fut1 = rowOf('CPI', '2026-07-01T12:30:00Z');
  const fut2 = rowOf('NFP', '2026-07-03T12:30:00Z');

  it('first load: past rows are added, future rows upserted, nothing deleted', () => {
    const p = planMacroCalendar([past, fut1, fut2], [], now);
    expect(p.insertPast).toEqual([past]);
    expect(p.upsertFuture).toEqual([fut1, fut2]);
    expect(p.deleteFuture).toEqual([]);
    expect(p.newRows).toBe(3);
  });

  it('a moved future date: the old future row is deleted, the new one added', () => {
    const moved = rowOf('CPI', '2026-07-02T12:30:00Z');
    const p = planMacroCalendar([past, moved, fut2], [past, fut1, fut2], now);
    expect(p.deleteFuture.map((e) => e.scheduledAt.toISOString())).toEqual(['2026-07-01T12:30:00.000Z']);
    expect(p.upsertFuture).toEqual([moved, fut2]);
    expect(p.insertPast).toEqual([]);
    expect(p.newRows).toBe(1);
  });

  it('a stored past row missing from the file, or changed in it, is left alone', () => {
    const p = planMacroCalendar([{ ...past, name: 'renamed' }, fut1], [past, rowOf('PCE', '2026-04-01T12:30:00Z')], now);
    expect(p.deleteFuture).toEqual([]);
    expect(p.insertPast).toEqual([]); // `past` is stored: not touched even though the file says something else
    expect(p.newRows).toBe(1);
  });

  it('exactly now counts as past, one millisecond later as future', () => {
    const atNow = rowOf('CPI', now.toISOString());
    const after = rowOf('NFP', new Date(now.getTime() + 1).toISOString());
    const p = planMacroCalendar([atNow, after], [], now);
    expect(p.insertPast).toEqual([atNow]);
    expect(p.upsertFuture).toEqual([after]);
    // a stored row at exactly `now` that the file dropped is evidence, not a future row
    expect(planMacroCalendar([], [{ code: 'CPI', scheduledAt: now }], now).deleteFuture).toEqual([]);
  });
});

describe('loadMacroCalendar (database)', () => {
  let database: Database;
  let dir: string;
  // 2026-10-15T00:00:00Z, +1 ms per call, so that the runs of one test have distinct, ordered start times
  let tick = Date.parse('2026-10-15T00:00:00Z');
  const now = () => new Date(tick++);
  const file = (name: string, text: string) => {
    const p = path.join(dir, name);
    writeFileSync(p, text);
    return p;
  };
  const stored = async () => (await database.db.select().from(macroEvents).orderBy(asc(macroEvents.scheduledAt), asc(macroEvents.code))).map((e) => `${e.code}|${e.scheduledAt.toISOString()}|${e.name}|${e.importance}`);
  const runs = () => database.db.select().from(newsIngestRuns).where(eq(newsIngestRuns.sourceId, CALENDAR_SOURCE_ID)).orderBy(asc(newsIngestRuns.startedAt), asc(newsIngestRuns.id));

  beforeAll(() => {
    database = createDatabase(TEST_DB_URL, 4);
    dir = mkdtempSync(path.join(os.tmpdir(), 'macro-cal-'));
  });
  afterAll(async () => {
    await database.close();
    rmSync(dir, { recursive: true, force: true });
  });
  beforeEach(async () => {
    tick = Date.parse('2026-10-15T00:00:00Z');
    await database.db.execute(sql`TRUNCATE news_items, news_ingest_runs, news_sources, macro_events CASCADE`);
    await syncNewsSources(database.db, { ingest: false, calendar: true });
  });

  it('loads the real file and loading it again changes nothing (same rows, same ids, no new events)', async () => {
    const first = await loadMacroCalendar(database.db, { now });
    expect(first).toEqual({ ok: true, rows: 119, inserted: 119, refreshedFuture: 53, deletedFuture: 0 });
    const before = await database.db.select().from(macroEvents).orderBy(asc(macroEvents.id));
    expect(before).toHaveLength(119);
    const second = await loadMacroCalendar(database.db, { now });
    expect(second).toMatchObject({ ok: true, rows: 119, inserted: 0, deletedFuture: 0 });
    expect(await database.db.select().from(macroEvents).orderBy(asc(macroEvents.id))).toEqual(before);
    const r = await runs();
    expect(r.map((x) => [x.status, x.itemsSeen, x.itemsInserted])).toEqual([
      ['OK', 119, 119],
      ['OK', 119, 0],
    ]);
  });

  it('two loaders at the same time end in one consistent state (advisory lock, no unique violation)', async () => {
    const results = await Promise.all([loadMacroCalendar(database.db, { now }), loadMacroCalendar(database.db, { now }), loadMacroCalendar(database.db, { now })]);
    expect(results.every((x) => x.ok)).toBe(true);
    expect(await database.db.select().from(macroEvents)).toHaveLength(119);
    expect((await runs()).map((x) => x.itemsInserted).sort((a, b) => a - b)).toEqual([0, 0, 119]);
  });

  it('a moved future date replaces the old row; a changed future name keeps the row (id, actual); past rows never change', async () => {
    const v1 = file('v1.csv', csv(row('CPI', '2026-05-01T12:30:00Z', { name: 'old-past' }), row('CPI', '2026-12-01T13:30:00Z', { name: 'moves' }), row('NFP', '2027-01-08T13:30:00Z', { name: 'renamed-later' })));
    expect(await loadMacroCalendar(database.db, { csvPath: v1, now })).toMatchObject({ ok: true, inserted: 3 });
    const [nfpBefore] = await database.db.select().from(macroEvents).where(eq(macroEvents.code, 'NFP'));
    await database.db.update(macroEvents).set({ actual: '3.5', actualKnownAt: new Date('2026-12-01T00:00:00Z') }).where(eq(macroEvents.id, nfpBefore!.id));

    const v2 = file(
      'v2.csv',
      csv(
        row('CPI', '2026-05-01T12:30:00Z', { name: 'CHANGED-past', importance: 'LOW' }), // past row in the file differs: stored row stays
        row('CPI', '2026-12-02T13:30:00Z', { name: 'moves' }), // moved one day
        row('NFP', '2027-01-08T13:30:00Z', { name: 'renamed-now', importance: 'MEDIUM' }),
      ),
    );
    expect(await loadMacroCalendar(database.db, { csvPath: v2, now })).toEqual({ ok: true, rows: 3, inserted: 1, refreshedFuture: 2, deletedFuture: 1 });
    expect(await stored()).toEqual([
      'CPI|2026-05-01T12:30:00.000Z|old-past|HIGH',
      'CPI|2026-12-02T13:30:00.000Z|moves|HIGH',
      'NFP|2027-01-08T13:30:00.000Z|renamed-now|MEDIUM',
    ]);
    const [nfpAfter] = await database.db.select().from(macroEvents).where(eq(macroEvents.code, 'NFP'));
    expect(nfpAfter).toMatchObject({ id: nfpBefore!.id, actual: '3.500000000000000000' }); // same row, the published value is kept
  });

  it('once an event is past, a file that moves or drops it cannot touch it', async () => {
    const v1 = file('p1.csv', csv(row('CPI', '2026-12-01T13:30:00Z', { name: 'evidence' }), row('NFP', '2026-12-05T13:30:00Z', { name: 'dropped' })));
    await loadMacroCalendar(database.db, { csvPath: v1, now });
    const later = () => new Date('2026-12-10T00:00:00Z'); // both are past now
    const v2 = file('p2.csv', csv(row('CPI', '2026-12-20T13:30:00Z', { name: 'moved-after-it-happened' }))); // old CPI moved, NFP dropped
    expect(await loadMacroCalendar(database.db, { csvPath: v2, now: later })).toMatchObject({ ok: true, inserted: 1, deletedFuture: 0 });
    expect(await stored()).toEqual(['CPI|2026-12-01T13:30:00.000Z|evidence|HIGH', 'NFP|2026-12-05T13:30:00.000Z|dropped|HIGH', 'CPI|2026-12-20T13:30:00.000Z|moved-after-it-happened|HIGH']);
  });

  it('a broken file changes nothing, is recorded as an ERROR run and alerts the operator; the server is not stopped (no throw)', async () => {
    const good = file('good.csv', csv(row('CPI', '2026-12-01T13:30:00Z'), row('NFP', '2026-12-05T13:30:00Z')));
    await loadMacroCalendar(database.db, { csvPath: good, now });
    const before = await database.db.select().from(macroEvents).orderBy(asc(macroEvents.id));
    const send = vi.fn(async () => undefined);
    for (const [name, text] of [
      ['bad-code.csv', csv(row('CPI', '2026-12-01T13:30:00Z'), row('GDP', '2026-12-05T13:30:00Z'))],
      ['bad-header.csv', 'code,when\nCPI,x\n'],
      ['empty.csv', csv()],
      ['bad-time.csv', csv(row('CPI', '2026-12-01 13:30'))],
    ] as const) {
      const r = await loadMacroCalendar(database.db, { csvPath: file(name, text), now, alerter: { send } });
      expect(r.ok, name).toBe(false);
      expect(await database.db.select().from(macroEvents).orderBy(asc(macroEvents.id)), name).toEqual(before);
    }
    const missing = await loadMacroCalendar(database.db, { csvPath: path.join(dir, 'nope.csv'), now, alerter: { send } });
    expect(missing.ok).toBe(false);
    expect(send).toHaveBeenCalledTimes(5);
    expect(send).toHaveBeenCalledWith('news-calendar', 'warn', expect.stringContaining('không nạp được'));
    const r = await runs();
    expect(r.map((x) => x.status)).toEqual(['OK', 'ERROR', 'ERROR', 'ERROR', 'ERROR', 'ERROR']);
    expect(r[1]!.error).toMatch(/unknown code "GDP"/);
    // no alerter: still no throw
    expect((await loadMacroCalendar(database.db, { csvPath: file('bad2.csv', 'nope'), now })).ok).toBe(false);
  });

  it('a database failure in the middle rolls everything back (all or nothing)', async () => {
    // the OK run row references the source; without the source the last statement of the transaction fails
    await database.db.delete(newsSources).where(eq(newsSources.id, CALENDAR_SOURCE_ID));
    const r = await loadMacroCalendar(database.db, { csvPath: file('rb.csv', csv(row('CPI', '2026-12-01T13:30:00Z'), row('NFP', '2026-05-05T13:30:00Z'))), now });
    expect(r.ok).toBe(false);
    expect(await database.db.select().from(macroEvents)).toEqual([]); // not even the events inserted before the failing statement
  });
});
