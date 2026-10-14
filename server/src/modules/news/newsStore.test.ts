import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, sql } from 'drizzle-orm';
import { loadConfig } from '../../config.ts';
import { createDatabase, MIGRATIONS_DIR, runMigrations, type Database, type Db } from '../../db/client.ts';
import { announcements, macroEvents, newsIngestRuns, newsItems, newsSources, users } from '../../db/schema.ts';
import { TEST_DB_PORT, TEST_DB_URL } from '../../../test/constants.ts';
import { purgeUntaggedNews, startNews, UNTAGGED_NEWS_KEEP_DAYS } from './index.ts';
import { CALENDAR_SOURCE_ID, NEWS_SOURCES, syncNewsSources } from './sources.ts';

let database: Database;
const db = () => database.db;
const uid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const DAY = 86_400_000;

beforeAll(() => {
  database = createDatabase(TEST_DB_URL, 4);
});
afterAll(async () => {
  await database.close();
});
beforeEach(async () => {
  await db().execute(sql`TRUNCATE news_items, news_ingest_runs, news_sources, macro_events CASCADE`);
});

describe('configuration (NEWS_INGEST_ENABLED, NEWS_CALENDAR_ENABLED)', () => {
  const prod = { NODE_ENV: 'production', DATA_ENCRYPTION_KEY: 'k', EMAIL_TRANSPORT: 'log' };
  it('ingest defaults to off in production, on in development and tests; an explicit value always wins', () => {
    expect(loadConfig(prod).NEWS_INGEST_ENABLED).toBe(false);
    expect(loadConfig({ ...prod, NEWS_INGEST_ENABLED: 'true' }).NEWS_INGEST_ENABLED).toBe(true);
    expect(loadConfig({ NODE_ENV: 'development' }).NEWS_INGEST_ENABLED).toBe(true);
    expect(loadConfig({ NODE_ENV: 'test' }).NEWS_INGEST_ENABLED).toBe(true);
    expect(loadConfig({}).NEWS_INGEST_ENABLED).toBe(true);
    expect(loadConfig({ NODE_ENV: 'test', NEWS_INGEST_ENABLED: 'false' }).NEWS_INGEST_ENABLED).toBe(false);
  });
  it('the calendar defaults to on everywhere and can be switched off', () => {
    expect(loadConfig(prod).NEWS_CALENDAR_ENABLED).toBe(true);
    expect(loadConfig({}).NEWS_CALENDAR_ENABLED).toBe(true);
    expect(loadConfig({ NEWS_CALENDAR_ENABLED: 'false' }).NEWS_CALENDAR_ENABLED).toBe(false);
  });
  it('anything but true/false is refused', () => {
    expect(() => loadConfig({ NEWS_INGEST_ENABLED: 'yes' })).toThrow();
    expect(() => loadConfig({ NEWS_CALENDAR_ENABLED: '1' })).toThrow();
  });
});

describe('source catalogue and sync', () => {
  it('has the 8 sources with the URLs of the N0 report, stable ids and polling cycles (RSS 180 s, GDELT 900 s, calendar daily)', () => {
    expect(NEWS_SOURCES.map((s) => s.id)).toEqual(['rss-coindesk', 'rss-cointelegraph', 'rss-decrypt', 'rss-theblock', 'rss-fed', 'rss-sec', 'gdelt-gkg', 'official-calendar']);
    const by = new Map(NEWS_SOURCES.map((s) => [s.id, s]));
    expect(by.get('rss-coindesk')!.url).toBe('https://www.coindesk.com/arc/outboundfeeds/rss/');
    expect(by.get('rss-fed')!.url).toBe('https://www.federalreserve.gov/feeds/press_all.xml');
    expect(by.get('gdelt-gkg')).toMatchObject({ kind: 'GDELT', url: 'https://data.gdeltproject.org/gdeltv2/lastupdate.txt', pollIntervalSec: 900 });
    expect(NEWS_SOURCES.filter((s) => s.kind === 'RSS').every((s) => s.pollIntervalSec === 180 && s.url.startsWith('https://'))).toBe(true);
    expect(by.get('official-calendar')).toMatchObject({ kind: 'OFFICIAL_CALENDAR', pollIntervalSec: 86_400 });
    expect(new Set(NEWS_SOURCES.map((s) => s.name)).size).toBe(8);
  });

  it('sync is idempotent: same rows, updated_at untouched when nothing changed; a change in configuration or catalogue is applied', async () => {
    await syncNewsSources(db(), { ingest: true, calendar: true });
    const first = await db().select().from(newsSources).orderBy(newsSources.id);
    expect(first).toHaveLength(8);
    await syncNewsSources(db(), { ingest: true, calendar: true });
    expect(await db().select().from(newsSources).orderBy(newsSources.id)).toEqual(first);

    await syncNewsSources(db(), { ingest: false, calendar: true });
    const off = await db().select().from(newsSources).orderBy(newsSources.id);
    expect(off.filter((s) => s.enabled).map((s) => s.id)).toEqual(['official-calendar']);
    expect(off.find((s) => s.id === 'gdelt-gkg')!.updatedAt.getTime()).toBeGreaterThan(first.find((s) => s.id === 'gdelt-gkg')!.updatedAt.getTime());
    expect(off.find((s) => s.id === 'official-calendar')!.updatedAt).toEqual(first.find((s) => s.id === 'official-calendar')!.updatedAt); // unchanged row

    await syncNewsSources(db(), { ingest: true, calendar: false });
    expect((await db().select().from(newsSources).where(eq(newsSources.id, 'official-calendar')))[0]!.enabled).toBe(false);

    // a renamed source / changed URL in the catalogue is picked up; a source no longer in the catalogue is left alone
    await syncNewsSources(db(), { ingest: true, calendar: true }, [{ ...NEWS_SOURCES[0]!, name: 'CoinDesk RSS', url: 'https://example.com/new' }]);
    expect((await db().select().from(newsSources).where(eq(newsSources.id, 'rss-coindesk')))[0]).toMatchObject({ name: 'CoinDesk RSS', url: 'https://example.com/new' });
    expect(await db().select().from(newsSources)).toHaveLength(8);
  });

  it('two syncs at once do not collide', async () => {
    await Promise.all([syncNewsSources(db(), { ingest: true, calendar: true }), syncNewsSources(db(), { ingest: true, calendar: true }), syncNewsSources(db(), { ingest: false, calendar: true })]);
    expect(await db().select().from(newsSources)).toHaveLength(8);
  });
});

describe('startNews (server start-up)', () => {
  it('syncs the sources and loads the real calendar; run twice it changes nothing', async () => {
    const send = vi.fn(async () => undefined);
    const news = await startNews(db(), { NEWS_INGEST_ENABLED: false, NEWS_CALENDAR_ENABLED: true }, { alerter: { send } });
    news.stop();
    expect(await db().select().from(newsSources)).toHaveLength(8);
    const events = await db().select().from(macroEvents);
    expect(events).toHaveLength(119);
    const runs = await db().select().from(newsIngestRuns).where(eq(newsIngestRuns.sourceId, CALENDAR_SOURCE_ID));
    expect(runs.map((r) => [r.status, r.itemsSeen, r.itemsInserted])).toEqual([['OK', 119, 119]]);
    (await startNews(db(), { NEWS_INGEST_ENABLED: false, NEWS_CALENDAR_ENABLED: true })).stop();
    expect(await db().select().from(macroEvents)).toHaveLength(119);
    expect(send).not.toHaveBeenCalled();
  });

  it('calendar switched off: sources are synced (calendar disabled), no event is loaded', async () => {
    (await startNews(db(), { NEWS_INGEST_ENABLED: true, NEWS_CALENDAR_ENABLED: false })).stop();
    expect(await db().select().from(macroEvents)).toEqual([]);
    expect((await db().select().from(newsSources).where(eq(newsSources.id, 'official-calendar')))[0]!.enabled).toBe(false);
  });

  it('an error in the news layer is logged and alerted, and start-up carries on (it never throws)', async () => {
    const send = vi.fn(async () => undefined);
    const broken = { insert: () => { throw new Error('database is gone'); } } as unknown as Db;
    const news = await startNews(broken, { NEWS_INGEST_ENABLED: false, NEWS_CALENDAR_ENABLED: true }, { alerter: { send } });
    news.stop();
    expect(send).toHaveBeenCalledWith('news-start', 'warn', expect.stringContaining('database is gone'));
  });
});

describe('clean-up of old untagged news (purgeUntaggedNews)', () => {
  const NOW = new Date('2026-10-14T09:00:00Z');
  const base = { sourceId: 'rss-decrypt', titleFingerprint: 'f', classifierVersion: 'rules-v0.1' };
  let run: string;
  const item = (n: number, over: Partial<typeof newsItems.$inferInsert>) => ({ id: uid(n), url: `https://n.test/${n}`, urlCanonical: `https://n.test/${n}`, title: `t${n}`, eventTypes: ['OTHER'], symbols: [], firstSeenAt: new Date(NOW.getTime() - 40 * DAY), ingestRunId: run, ...base, ...over });

  beforeEach(async () => {
    await syncNewsSources(db(), { ingest: true, calendar: true });
    const [r] = await db().insert(newsIngestRuns).values({ sourceId: 'rss-decrypt', startedAt: NOW, finishedAt: NOW, status: 'OK' }).returning();
    run = r!.id;
  });

  it('removes only live-ingested items with no pair, not macro, older than 30 days', async () => {
    expect(UNTAGGED_NEWS_KEEP_DAYS).toBe(30);
    await db()
      .insert(newsItems)
      .values([
        item(1, {}), // 40 days, untagged, OTHER: deleted
        item(2, { firstSeenAt: new Date(NOW.getTime() - 31 * DAY), eventTypes: ['ADOPTION'] }), // 31 days: deleted
        item(3, { firstSeenAt: new Date(NOW.getTime() - 29 * DAY) }), // 29 days: kept
        item(4, { firstSeenAt: new Date(NOW.getTime() - 30 * DAY) }), // exactly 30 days: kept (the cut is strictly older)
        item(5, { eventTypes: ['MACRO_DATA'] }), // macro: kept
        item(6, { eventTypes: ['CENTRAL_BANK', 'OTHER'] }), // macro among others: kept
        item(7, { symbols: ['BTCUSDT'] }), // names a pair: kept
        item(8, { ingestRunId: null }), // backfill (no run): kept, it is research data
      ]);
    expect(await purgeUntaggedNews(db(), NOW)).toBe(2);
    const left = (await db().select({ id: newsItems.id }).from(newsItems).orderBy(newsItems.id)).map((r) => r.id);
    expect(left).toEqual([3, 4, 5, 6, 7, 8].map(uid));
    expect(await purgeUntaggedNews(db(), NOW)).toBe(0); // nothing left to remove
  });
});

describe('table constraints', () => {
  const src = 'rss-decrypt';
  const row = (n: number, over: Partial<typeof newsItems.$inferInsert> = {}) => ({ sourceId: src, url: `https://n.test/${n}`, urlCanonical: `https://n.test/${n}`, title: 't', titleFingerprint: 'f', firstSeenAt: new Date(), eventTypes: ['OTHER'], classifierVersion: 'rules-v0.1', ...over });
  const code = async (p: Promise<unknown>) => ((await p.then(() => null, (e: unknown) => e)) as { cause?: { code?: string } } | null)?.cause?.code ?? null;
  beforeEach(async () => {
    await syncNewsSources(db(), { ingest: true, calendar: true });
  });

  it('an item needs at least one event type (CHECK), a unique canonical URL, a known source', async () => {
    expect(await code(db().insert(newsItems).values(row(1, { eventTypes: [] })))).toBe('23514');
    await db().insert(newsItems).values(row(2));
    expect(await code(db().insert(newsItems).values(row(2, { url: 'https://n.test/2?utm_source=x' })))).toBe('23505'); // same canonical URL
    expect(await code(db().insert(newsItems).values(row(3, { sourceId: 'no-such-source' })))).toBe('23503');
  });

  it('symbols default to {} (market-wide); tone NULL is not 0; title fingerprints may repeat', async () => {
    const [a] = await db().insert(newsItems).values(row(4)).returning();
    expect(a!.symbols).toEqual([]);
    expect(a!.tone).toBeNull();
    const [b] = await db().insert(newsItems).values(row(5, { titleFingerprint: 'f', tone: '0' })).returning();
    expect(b!.tone).toBe('0.000000000000000000');
  });

  it('macro events: (code, scheduled_at) is unique; the same time under another code is fine', async () => {
    const e = { code: 'CPI' as const, name: 'CPI', scheduledAt: new Date('2026-12-10T13:30:00Z'), importance: 'HIGH' as const, referencePeriod: 'Nov 2026', sourceUrl: 'https://x.test/' };
    await db().insert(macroEvents).values(e);
    expect(await code(db().insert(macroEvents).values(e))).toBe('23505');
    await db().insert(macroEvents).values({ ...e, code: 'NFP' });
  });

  it('the text[] columns survive the JSON round trip of the host backup (row_to_json -> json_populate_recordset)', async () => {
    await db().insert(newsItems).values(row(6, { symbols: ['BTCUSDT', 'ETHUSDT'], eventTypes: ['ETF', 'OTHER'], tone: '-1.4' }));
    const { rows } = await db().execute<{ symbols: string[]; event_types: string[]; tone: string }>(
      sql`SELECT r.symbols, r.event_types, r.tone::text AS tone FROM json_populate_recordset(NULL::news_items, (SELECT json_agg(row_to_json(x)) FROM news_items x)) r`,
    );
    expect(rows).toEqual([{ symbols: ['BTCUSDT', 'ETHUSDT'], event_types: ['ETF', 'OTHER'], tone: '-1.400000000000000000' }]);
  });
});

describe('migration 0010 on a database that already has data', () => {
  const MIG_DB = 'cex_news_migration_test';
  const adminUrl = `postgres://postgres:postgres@localhost:${TEST_DB_PORT}/postgres`;
  const url = `postgres://postgres:postgres@localhost:${TEST_DB_PORT}/${MIG_DB}`;
  let dir: string;
  let old: Database | null = null;

  afterAll(async () => {
    await old?.close();
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${MIG_DB} WITH (FORCE)`);
    } finally {
      await admin.end();
    }
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('applies on top of the schema of main (0000-0009) with data in it: old rows untouched, new tables empty, 11 migrations recorded', async () => {
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${MIG_DB} WITH (FORCE)`);
      await admin.query(`CREATE DATABASE ${MIG_DB} WITH ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`);
    } finally {
      await admin.end();
    }
    // the folder as it was before this batch: the journal cut after 0009_tax_t3_trade_category
    dir = mkdtempSync(path.join(os.tmpdir(), 'mig-before-'));
    mkdirSync(path.join(dir, 'meta'));
    const journal = JSON.parse(readFileSync(path.join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8')) as { entries: { idx: number; tag: string }[] };
    const before = journal.entries.filter((e) => e.idx <= 9);
    expect(journal.entries.find((e) => e.idx === 10)!.tag).toBe('0010_news_n2b_store');
    writeFileSync(path.join(dir, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries: before }));
    for (const e of before) copyFileSync(path.join(MIGRATIONS_DIR, `${e.tag}.sql`), path.join(dir, `${e.tag}.sql`));

    old = createDatabase(url, 2);
    await migrate(old.db, { migrationsFolder: dir });
    const tables = async () => (await old!.db.execute<{ t: string }>(sql`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1`)).rows.map((r) => r.t);
    expect(await tables()).not.toContain('news_items');

    // data a live exchange has: users, an announcement, the single settings row
    const [u] = await old.db.insert(users).values({ email: 'old@test.local', name: 'Old', passwordHash: null }).returning();
    await old.db.insert(announcements).values({ title: 'Bảo trì', body: 'Sàn sẽ bảo trì lúc 2 giờ', level: 'MAINTENANCE', createdBy: u!.id });
    const countOf = async (t: string) => Number((await old!.db.execute<{ n: string }>(sql.raw(`SELECT count(*)::text AS n FROM ${t}`))).rows[0]!.n);
    const snapshot = { users: await countOf('users'), exchange_settings: await countOf('exchange_settings'), announcements: await countOf('announcements') };
    expect([snapshot.users, snapshot.announcements]).toEqual([1, 1]);

    await runMigrations(old.db); // the full folder, as the server does at start-up

    expect(await tables()).toEqual(expect.arrayContaining(['news_sources', 'news_items', 'news_ingest_runs', 'macro_events']));
    expect({ users: await countOf('users'), exchange_settings: await countOf('exchange_settings'), announcements: await countOf('announcements') }).toEqual(snapshot);
    expect((await old.db.select().from(users))[0]).toMatchObject({ email: 'old@test.local', name: 'Old' });
    expect((await old.db.select().from(announcements))[0]).toMatchObject({ title: 'Bảo trì', body: 'Sàn sẽ bảo trì lúc 2 giờ' }); // UTF-8 intact
    for (const t of ['news_sources', 'news_items', 'news_ingest_runs', 'macro_events']) expect(await countOf(t), t).toBe(0);
    expect(await countOf('drizzle.__drizzle_migrations')).toBe(11);
    // and the new layer works on it
    await syncNewsSources(old.db, { ingest: true, calendar: true });
    expect(await old.db.select().from(newsSources)).toHaveLength(8);
  });
});
