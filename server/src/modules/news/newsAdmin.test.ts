import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { sql } from 'drizzle-orm';
import { ApiError, createApiClient, type ApiClient, type NewsItemAdmin } from '@cex/contracts';
import { fixtureMacroEvents, fixtureNewsItems, fixtureNewsSources } from '@cex/contracts/fixtures';
import { macroEvents, newsIngestRuns, newsItems, newsSources } from '../../db/schema.ts';
import { ApiHarness, type Browser } from '../../../test/apiHarness.ts';
import { syncNewsSources } from './sources.ts';

/** Admin news endpoints (Module N, N2b): permissions, order, cursor, filters, source health, and "server = mock". */
const h = new ApiHarness();

/**
 * The contract mock (msw handlers + store). Imported at run time, not statically: the mock sources use browser types and
 * do not compile under the server's tsconfig (no DOM lib), which would break the typecheck of every server file.
 */
interface MockApi {
  createMockHandlers(o: { baseUrl: string; latencyMs: number }): Parameters<typeof setupServer>;
  resetMockStore(): void;
  setMockRole(role: string, twoFactor?: boolean): void;
}
const MOCKS_MODULE = '@cex/contracts/mocks';
let mocks: MockApi;
let nowMs = Date.now();
let useFixedNow = false;
const clock = () => new Date(useFixedNow ? nowMs : Date.now());
const db = () => h.env.database.db;

let support: Browser;
let admin: Browser;
let plain: Browser;
let noMfa: Browser;
let anon: Browser;

async function expectApiError(p: Promise<unknown>, code: string, status: number) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof ApiError && e.code === code && e.status === status);
}
const uid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const iso = (ms: number) => new Date(ms).toISOString();
const DAY = 86_400_000;

beforeAll(async () => {
  await h.start({ newsClock: clock });
  support = (await h.staff('support')).b;
  admin = (await h.staff('admin')).b;
  plain = (await h.user()).b;
  noMfa = (await h.user('admin')).b;
  anon = h.browser();
});
afterAll(async () => {
  await h.stop();
});
beforeEach(async () => {
  useFixedNow = false;
  await db().execute(sql`TRUNCATE news_items, news_ingest_runs, news_sources, macro_events CASCADE`);
});

// ───────────────────────────── access control

describe('access control: staff + 2FA + news.view, nothing for users', () => {
  it('signed out 401, plain user 403, staff without 2FA TWO_FACTOR_REQUIRED, support and admin with 2FA 200 - on all three endpoints', async () => {
    const calls: [string, (b: ApiClient) => Promise<unknown>][] = [
      ['adminNewsItems', (b) => b.adminNewsItems({})],
      ['adminNewsSources', (b) => b.adminNewsSources({})],
      ['adminNewsMacroEvents', (b) => b.adminNewsMacroEvents({})],
    ];
    for (const [name, call] of calls) {
      await expectApiError(call(anon), 'UNAUTHENTICATED', 401);
      await expectApiError(call(plain), 'FORBIDDEN', 403);
      await expectApiError(call(noMfa), 'TWO_FACTOR_REQUIRED', 403);
      await expect(call(support), name).resolves.toBeDefined();
      await expect(call(admin), name).resolves.toBeDefined();
    }
  });

  it('a plain user cannot read news even by guessing a query; the typed client and a raw request agree', async () => {
    const u = await h.user();
    const res = await fetch(`${h.base}/api/v1/admin/news/items?limit=1`, { headers: { cookie: u.b.cookie() } });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('FORBIDDEN');
  });
});

// ───────────────────────────── items

describe('adminNewsItems', () => {
  const T0 = Date.parse('2026-10-14T08:00:00.000Z');
  const SRC_A = { id: 'src-a', name: 'Crypto RSS A', kind: 'RSS' as const, url: 'https://a.test/rss', pollIntervalSec: 180, enabled: true };
  const SRC_G = { id: 'src-g', name: 'GDELT GKG', kind: 'GDELT' as const, url: 'https://g.test/', pollIntervalSec: 900, enabled: true };

  async function seed() {
    await db().insert(newsSources).values([SRC_A, SRC_G]);
    const [run] = await db().insert(newsIngestRuns).values({ sourceId: 'src-a', startedAt: new Date(T0), finishedAt: new Date(T0), status: 'OK' }).returning();
    const base = { classifierVersion: 'rules-v0.1', titleFingerprint: 'fp' };
    const item = (n: number, o: Partial<typeof newsItems.$inferInsert>) => ({ id: uid(n), url: `https://news.test/${n}`, urlCanonical: `https://news.test/${n}`, title: `Title ${n}`, symbols: [], eventTypes: ['OTHER'], sourceId: 'src-a', firstSeenAt: new Date(T0), ...base, ...o });
    await db()
      .insert(newsItems)
      .values([
        item(1, { symbols: ['BTCUSDT'], eventTypes: ['HACK_EXPLOIT', 'EXCHANGE_INCIDENT'], ingestRunId: run!.id }),
        item(2, { symbols: [], eventTypes: ['OTHER'], publishedAt: new Date(T0 - 4_000) }),
        item(3, { symbols: ['ETHUSDT', 'BTCUSDT'], eventTypes: ['ETF'], tone: '3.2', sourceId: 'src-g' }),
        item(9, { symbols: ['SOLUSDT'], eventTypes: ['REGULATORY_ACTION'], firstSeenAt: new Date(T0 + 3_600_000), tone: '0', sourceId: 'src-g' }),
        item(5, { symbols: [], eventTypes: ['CENTRAL_BANK', 'MACRO_DATA'], firstSeenAt: new Date(T0 - DAY), tone: '-1.4', sourceId: 'src-g' }),
        item(6, { symbols: ['BNBUSDT'], eventTypes: ['LISTING'], firstSeenAt: new Date(T0 - 2 * DAY) }),
      ]);
    return run!;
  }
  /** Newest first; items 1, 2, 3 share one firstSeenAt, so the id decides: 3, 2, 1. */
  const ORDER = [9, 3, 2, 1, 5, 6].map(uid);
  const ids = (r: { items: { id: string }[] }) => r.items.map((i) => i.id);

  it('order is (firstSeenAt DESC, id DESC) and every field comes back as stored, null stays null', async () => {
    const run = await seed();
    const all = await support.adminNewsItems({});
    expect(ids(all)).toEqual(ORDER);
    expect(all.nextCursor).toBeNull();
    const byId = new Map(all.items.map((i) => [i.id, i]));
    expect(byId.get(uid(1))).toEqual({
      id: uid(1),
      title: 'Title 1',
      url: 'https://news.test/1',
      source: 'Crypto RSS A',
      publishedAt: null,
      firstSeenAt: '2026-10-14T08:00:00.000Z',
      symbols: ['BTCUSDT'],
      eventTypes: ['HACK_EXPLOIT', 'EXCHANGE_INCIDENT'],
      tone: null, // NULL stays null, never "0"
      classifierVersion: 'rules-v0.1',
      sourceId: 'src-a',
      sourceKind: 'RSS',
      ingestedRunId: run.id,
    });
    expect(byId.get(uid(2))).toMatchObject({ publishedAt: '2026-10-14T07:59:56.000Z', ingestedRunId: null, symbols: [] });
    expect(byId.get(uid(3))).toMatchObject({ tone: '3.2', sourceKind: 'GDELT', symbols: ['ETHUSDT', 'BTCUSDT'] });
    expect(byId.get(uid(9))!.tone).toBe('0'); // a stored zero is "0" and a missing score is null: two different things
    expect(byId.get(uid(5))!.tone).toBe('-1.4');
  });

  it('three items with the same firstSeenAt cross a page boundary with limit=1 / 2 / 4: nothing lost, nothing repeated', async () => {
    await seed();
    for (const limit of [1, 2, 4]) {
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let guard = 0; guard < 10; guard++) {
        const page = await support.adminNewsItems({ query: { limit, cursor } });
        expect(page.items.length).toBeLessThanOrEqual(limit);
        seen.push(...ids(page));
        if (page.nextCursor === null) break;
        cursor = page.nextCursor;
      }
      expect(seen, `limit ${limit}`).toEqual(ORDER);
    }
    // the cursor is base64url of "firstSeenAt|id" of the last item shown
    const first = await support.adminNewsItems({ query: { limit: 2 } });
    expect(Buffer.from(first.nextCursor!, 'base64url').toString()).toBe(`2026-10-14T08:00:00.000Z|${uid(3)}`);
    expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('an item added after a page was read does not shift the next page (cursor is a position, not an offset)', async () => {
    await seed();
    const first = await support.adminNewsItems({ query: { limit: 2 } });
    await db().insert(newsItems).values({ id: uid(50), sourceId: 'src-a', url: 'https://news.test/50', urlCanonical: 'https://news.test/50', title: 'Fresh', titleFingerprint: 'fp', firstSeenAt: new Date(T0 + 2 * 3_600_000), eventTypes: ['OTHER'], classifierVersion: 'rules-v0.1' });
    const rest = await support.adminNewsItems({ query: { limit: 10, cursor: first.nextCursor! } });
    expect(ids(rest)).toEqual([2, 1, 5, 6].map(uid));
  });

  it('a malformed cursor is VALIDATION_ERROR (400), never an empty page', async () => {
    await seed();
    const b64 = (s: string) => Buffer.from(s).toString('base64url');
    for (const cursor of ['!!!', 'x', 'AAAA', b64('no-separator'), b64('not-a-date|' + uid(1)), b64('2026-10-14T08:00:00.000Z|'), b64('2026-10-14T08:00:00.000Z|not-a-uuid'), b64('|' + uid(1))]) {
      await expectApiError(support.adminNewsItems({ query: { cursor } }), 'VALIDATION_ERROR', 400);
    }
  });

  it('filters: symbol (market-wide news is not returned), eventType (any of the item types), sourceId', async () => {
    await seed();
    expect(ids(await support.adminNewsItems({ query: { symbol: 'BTCUSDT' } }))).toEqual([3, 1].map(uid));
    expect(ids(await support.adminNewsItems({ query: { symbol: 'ETHUSDT' } }))).toEqual([uid(3)]);
    expect(ids(await support.adminNewsItems({ query: { symbol: 'DOGEUSDT' } }))).toEqual([]); // no such label: an empty page, still 200
    expect(ids(await support.adminNewsItems({ query: { eventType: 'MACRO_DATA' } }))).toEqual([uid(5)]);
    expect(ids(await support.adminNewsItems({ query: { eventType: 'EXCHANGE_INCIDENT' } }))).toEqual([uid(1)]);
    expect(ids(await support.adminNewsItems({ query: { eventType: 'OTHER' } }))).toEqual([uid(2)]);
    expect(ids(await support.adminNewsItems({ query: { sourceId: 'src-g' } }))).toEqual([9, 3, 5].map(uid));
    expect(ids(await support.adminNewsItems({ query: { sourceId: 'no-such-source' } }))).toEqual([]);
    expect(ids(await support.adminNewsItems({ query: { symbol: 'BTCUSDT', sourceId: 'src-g' } }))).toEqual([uid(3)]);
    // a filter and paging together
    const p1 = await support.adminNewsItems({ query: { symbol: 'BTCUSDT', limit: 1 } });
    expect(ids(p1)).toEqual([uid(3)]);
    expect(ids(await support.adminNewsItems({ query: { symbol: 'BTCUSDT', limit: 1, cursor: p1.nextCursor! } }))).toEqual([uid(1)]);
  });

  it('from / to bound firstSeenAt and include both ends; the cursor and the range work together', async () => {
    await seed();
    const at = (n: number) => iso(T0 + n);
    expect(ids(await support.adminNewsItems({ query: { from: at(0), to: at(0) } }))).toEqual([3, 2, 1].map(uid)); // exactly the shared instant
    expect(ids(await support.adminNewsItems({ query: { from: at(0) } }))).toEqual([9, 3, 2, 1].map(uid));
    expect(ids(await support.adminNewsItems({ query: { to: at(-1) } }))).toEqual([5, 6].map(uid)); // 1 ms before the shared instant
    expect(ids(await support.adminNewsItems({ query: { from: at(1), to: at(3_599_999) } }))).toEqual([]);
    expect(ids(await support.adminNewsItems({ query: { from: iso(T0 - DAY), to: iso(T0 - DAY) } }))).toEqual([uid(5)]);
    const page = await support.adminNewsItems({ query: { from: at(0), limit: 2 } });
    expect(ids(await support.adminNewsItems({ query: { from: at(0), limit: 2, cursor: page.nextCursor! } }))).toEqual([2, 1].map(uid));
  });

  it('bad queries are 400: from after to, bad symbol, unknown event type, limit out of 1..200, bad date', async () => {
    await expectApiError(support.adminNewsItems({ query: { from: iso(T0 + 1), to: iso(T0) } }), 'VALIDATION_ERROR', 400);
    await expectApiError(support.adminNewsItems({ query: { symbol: 'btc/usdt' } }), 'VALIDATION_ERROR', 400);
    for (const qs of ['eventType=RUMOR', 'limit=0', 'limit=201', 'from=yesterday', 'symbol=btcusdt']) {
      const res = await fetch(`${h.base}/api/v1/admin/news/items?${qs}`, { headers: { cookie: support.cookie() } });
      expect([qs, res.status]).toEqual([qs, 400]);
    }
  });

  it('serves titles, URLs, labels only: no article text column exists to leak', async () => {
    await seed();
    const cols = await db().execute<{ column_name: string }>(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'news_items'`);
    expect(cols.rows.map((c) => c.column_name).sort()).toEqual(
      ['classifier_version', 'created_at', 'event_types', 'first_seen_at', 'id', 'ingest_run_id', 'published_at', 'source_id', 'symbols', 'title', 'title_fingerprint', 'tone', 'url', 'url_canonical'].sort(),
    );
  });
});

// ───────────────────────────── macro events

describe('adminNewsMacroEvents', () => {
  const NOW = Date.parse('2026-10-14T09:00:00.000Z');
  const ev = (code: 'CPI' | 'NFP' | 'FOMC_DECISION' | 'PCE', offsetMs: number, importance: 'HIGH' | 'MEDIUM' | 'LOW', over: Partial<typeof macroEvents.$inferInsert> = {}) => ({
    code,
    name: `${code} ${offsetMs}`,
    scheduledAt: new Date(NOW + offsetMs),
    importance,
    referencePeriod: 'p',
    sourceUrl: 'https://x.test/',
    ...over,
  });
  const names = (r: { items: { name: string }[] }) => r.items.map((e) => e.name);

  beforeEach(async () => {
    useFixedNow = true;
    nowMs = NOW;
    await db()
      .insert(macroEvents)
      .values([
        ev('PCE', -391 * DAY, 'LOW'),
        ev('NFP', -389 * DAY, 'MEDIUM'),
        ev('PCE', -10 * DAY, 'MEDIUM'),
        ev('CPI', -DAY, 'HIGH', { actual: '2.7', actualKnownAt: new Date(NOW - DAY + 5_000) }),
        ev('FOMC_DECISION', DAY, 'HIGH'),
        ev('NFP', 399 * DAY, 'MEDIUM'),
        ev('PCE', 400 * DAY, 'LOW'),
        ev('CPI', 401 * DAY, 'LOW'),
      ]);
  });

  it('no parameters: the 400 days from the moment of the call, ordered by time, both ends included', async () => {
    const r = await support.adminNewsMacroEvents({});
    expect(names(r)).toEqual([`FOMC_DECISION ${DAY}`, `NFP ${399 * DAY}`, `PCE ${400 * DAY}`]); // yesterday is out, +400 d exactly is in, +401 d is out
    expect(r.items[0]).toEqual({ code: 'FOMC_DECISION', name: `FOMC_DECISION ${DAY}`, scheduledAt: '2026-10-15T09:00:00.000Z', importance: 'HIGH', source: 'Official Calendars', actual: null, actualKnownAt: null });
  });

  it('only from: 400 days from it; only to: the 400 days ending at it', async () => {
    expect(names(await support.adminNewsMacroEvents({ query: { from: iso(NOW - 20 * DAY) } }))).toEqual([`PCE ${-10 * DAY}`, `CPI ${-DAY}`, `FOMC_DECISION ${DAY}`]); // to = now + 380 d: NFP at +399 d is out
    expect(names(await support.adminNewsMacroEvents({ query: { to: iso(NOW + 10 * DAY) } }))).toEqual([`NFP ${-389 * DAY}`, `PCE ${-10 * DAY}`, `CPI ${-DAY}`, `FOMC_DECISION ${DAY}`]); // from = now - 390 d: the PCE at -391 d is out
  });

  it('from and to given: exactly that window; 400 days is allowed, 401 is VALIDATION_ERROR, from after to is VALIDATION_ERROR', async () => {
    const from = NOW - 391 * DAY;
    expect(names(await support.adminNewsMacroEvents({ query: { from: iso(from), to: iso(from + 400 * DAY) } }))).toHaveLength(5); // the events at -391, -389, -10, -1 and +1 day
    await expectApiError(support.adminNewsMacroEvents({ query: { from: iso(from), to: iso(from + 400 * DAY + 1000) } }), 'VALIDATION_ERROR', 400);
    await expectApiError(support.adminNewsMacroEvents({ query: { from: iso(NOW + DAY), to: iso(NOW) } }), 'VALIDATION_ERROR', 400);
  });

  it('filters by code and importance; a window with nothing is an empty list (200)', async () => {
    const wide = { from: iso(NOW - 391 * DAY), to: iso(NOW + 9 * DAY) };
    expect(names(await support.adminNewsMacroEvents({ query: { ...wide, code: 'PCE' } }))).toEqual([`PCE ${-391 * DAY}`, `PCE ${-10 * DAY}`]);
    expect(names(await support.adminNewsMacroEvents({ query: { ...wide, importance: 'HIGH' } }))).toEqual([`CPI ${-DAY}`, `FOMC_DECISION ${DAY}`]);
    expect(names(await support.adminNewsMacroEvents({ query: { ...wide, code: 'CPI', importance: 'MEDIUM' } }))).toEqual([]);
    expect((await support.adminNewsMacroEvents({ query: { from: iso(NOW + 100 * DAY), to: iso(NOW + 101 * DAY) } })).items).toEqual([]);
    await expectApiError(support.adminNewsMacroEvents({ query: { code: 'GDP' as 'CPI' } }), 'VALIDATION_ERROR', 400);
  });

  it('actual / actualKnownAt: null until known, the value as a plain decimal string once there', async () => {
    const r = await support.adminNewsMacroEvents({ query: { from: iso(NOW - 2 * DAY), to: iso(NOW + 2 * DAY) } });
    expect(r.items.map((e) => [e.code, e.actual, e.actualKnownAt])).toEqual([
      ['CPI', '2.7', '2026-10-13T09:00:05.000Z'],
      ['FOMC_DECISION', null, null],
    ]);
  });

  it('events at the same time are ordered by code (stable answers)', async () => {
    await db().insert(macroEvents).values([ev('NFP', 5 * DAY, 'HIGH', { name: 'b' }), ev('CPI', 5 * DAY, 'HIGH', { name: 'a' })]);
    expect(names(await support.adminNewsMacroEvents({ query: { from: iso(NOW + 5 * DAY), to: iso(NOW + 5 * DAY) } }))).toEqual(['a', 'b']);
  });
});

// ───────────────────────────── source health

describe('adminNewsSources', () => {
  const NOW = Date.parse('2026-10-14T09:00:00.000Z');
  const ago = (ms: number) => new Date(NOW - ms);
  const MIN = 60_000;
  const health = async () => new Map((await support.adminNewsSources({})).items.map((s) => [s.id, s]));
  type Run = { source: string; status: 'OK' | 'ERROR' | 'NOT_PUBLISHED_YET'; at: number; running?: boolean };
  const runs = (list: Run[]) =>
    db()
      .insert(newsIngestRuns)
      .values(list.map((r) => ({ sourceId: r.source, status: r.status, startedAt: ago(r.at), finishedAt: r.running ? null : ago(r.at - 1000), error: r.status === 'ERROR' ? 'boom' : null })));
  const item = (n: number, source: string, firstSeenAgo: number, publishedAgo: number | null) => ({
    id: uid(n),
    sourceId: source,
    url: `https://n.test/${n}`,
    urlCanonical: `https://n.test/${n}`,
    title: `t${n}`,
    titleFingerprint: 'f',
    eventTypes: ['OTHER'],
    classifierVersion: 'rules-v0.1',
    firstSeenAt: ago(firstSeenAgo),
    publishedAt: publishedAgo === null ? null : ago(publishedAgo),
  });

  beforeEach(async () => {
    useFixedNow = true;
    nowMs = NOW;
    await syncNewsSources(db(), { ingest: true, calendar: true });
  });

  it('lists the 8 catalogue sources in catalogue order; a source that never ran is UNAVAILABLE with null/0 values, not LIVE and not 0 lag', async () => {
    const r = await support.adminNewsSources({});
    expect(r.items.map((s) => s.id)).toEqual(['rss-coindesk', 'rss-cointelegraph', 'rss-decrypt', 'rss-theblock', 'rss-fed', 'rss-sec', 'gdelt-gkg', 'official-calendar']);
    expect(r.items[0]).toEqual({ id: 'rss-coindesk', name: 'CoinDesk', kind: 'RSS', enabled: true, status: 'UNAVAILABLE', lastSuccessAt: null, lastErrorAt: null, consecutiveFailures: 0, medianLagMs: null, itemsLast24h: 0 });
    expect(r.items.every((s) => s.status === 'UNAVAILABLE')).toBe(true);
  });

  it('LIVE within 3 polling cycles (inclusive), STALE beyond it, with the failures counted since the last success', async () => {
    await runs([
      { source: 'rss-coindesk', status: 'OK', at: 2 * MIN },
      { source: 'rss-cointelegraph', status: 'OK', at: 540_000 + 1000 }, // finished exactly 3 cycles (3 x 180 s) ago
      { source: 'rss-decrypt', status: 'OK', at: 540_000 + 1000 + 1 }, // finished 3 cycles + 1 ms ago
      { source: 'rss-theblock', status: 'OK', at: 120 * MIN },
      { source: 'rss-theblock', status: 'ERROR', at: 30 * MIN },
      { source: 'rss-theblock', status: 'ERROR', at: 10 * MIN },
      { source: 'rss-theblock', status: 'ERROR', at: 1 * MIN },
    ]);
    const s = await health();
    expect(s.get('rss-coindesk')).toMatchObject({ status: 'LIVE', lastSuccessAt: iso(NOW - 2 * MIN + 1000), consecutiveFailures: 0, lastErrorAt: null });
    expect(s.get('rss-cointelegraph')!.status).toBe('LIVE');
    expect(s.get('rss-decrypt')!.status).toBe('STALE');
    expect(s.get('rss-theblock')).toMatchObject({ status: 'STALE', consecutiveFailures: 3, lastErrorAt: iso(NOW - 1 * MIN + 1000), lastSuccessAt: iso(NOW - 120 * MIN + 1000) });
  });

  it('a success resets the failures; NOT_PUBLISHED_YET (GDELT 404) is neither a success nor a failure; an unfinished run is not a success', async () => {
    await runs([
      { source: 'rss-fed', status: 'ERROR', at: 50 * MIN },
      { source: 'rss-fed', status: 'ERROR', at: 40 * MIN },
      { source: 'rss-fed', status: 'OK', at: 2 * MIN }, // resets the two failures before it
      { source: 'gdelt-gkg', status: 'OK', at: 20 * MIN },
      { source: 'gdelt-gkg', status: 'NOT_PUBLISHED_YET', at: 5 * MIN },
      { source: 'gdelt-gkg', status: 'NOT_PUBLISHED_YET', at: 1 * MIN },
      { source: 'rss-sec', status: 'OK', at: 1 * MIN, running: true },
    ]);
    const s = await health();
    expect(s.get('rss-fed')).toMatchObject({ status: 'LIVE', consecutiveFailures: 0, lastErrorAt: iso(NOW - 40 * MIN + 1000) }); // the old error is still reported as "last error"
    expect(s.get('gdelt-gkg')).toMatchObject({ status: 'LIVE', consecutiveFailures: 0, lastErrorAt: null, lastSuccessAt: iso(NOW - 20 * MIN + 1000) }); // 20 min < 3 x 15 min
    expect(s.get('rss-sec')).toMatchObject({ status: 'UNAVAILABLE', lastSuccessAt: null });
  });

  it('GDELT stays LIVE for 45 minutes after its last success, then STALE (cycle 900 s)', async () => {
    await runs([{ source: 'gdelt-gkg', status: 'OK', at: 46 * MIN }]);
    expect((await health()).get('gdelt-gkg')!.status).toBe('STALE');
    await db().delete(newsIngestRuns);
    await runs([{ source: 'gdelt-gkg', status: 'OK', at: 44 * MIN }]);
    expect((await health()).get('gdelt-gkg')!.status).toBe('LIVE');
  });

  it('a source with only failures is UNAVAILABLE (never succeeded) but shows its failures', async () => {
    await runs([
      { source: 'rss-theblock', status: 'ERROR', at: 10 * MIN },
      { source: 'rss-theblock', status: 'ERROR', at: 5 * MIN },
    ]);
    expect((await health()).get('rss-theblock')).toMatchObject({ status: 'UNAVAILABLE', lastSuccessAt: null, consecutiveFailures: 2, lastErrorAt: iso(NOW - 5 * MIN + 1000) });
  });

  it('the calendar is LIVE while its last load succeeded, however old; STALE after a failed reload that kept older data; UNAVAILABLE if it never loaded', async () => {
    expect((await health()).get('official-calendar')!.status).toBe('UNAVAILABLE');
    await runs([{ source: 'official-calendar', status: 'OK', at: 10 * DAY }]);
    expect((await health()).get('official-calendar')).toMatchObject({ status: 'LIVE', medianLagMs: null, itemsLast24h: 0 });
    await runs([{ source: 'official-calendar', status: 'ERROR', at: 1 * DAY }]);
    expect((await health()).get('official-calendar')).toMatchObject({ status: 'STALE', consecutiveFailures: 1 });
    await db().delete(newsIngestRuns);
    await runs([{ source: 'official-calendar', status: 'ERROR', at: 1 * DAY }]);
    expect((await health()).get('official-calendar')).toMatchObject({ status: 'UNAVAILABLE', consecutiveFailures: 1 });
  });

  it('itemsLast24h counts (now - 24 h, now]; medianLagMs is the median of firstSeenAt - publishedAt, may be negative, null without a publishedAt', async () => {
    await db()
      .insert(newsItems)
      .values([
        // rss-decrypt: lags 10 s, -4 s, 60 s -> median 10 s; plus one at exactly 24 h (excluded) and one in the future (excluded)
        item(1, 'rss-decrypt', 1 * MIN, 1 * MIN + 10_000),
        item(2, 'rss-decrypt', 2 * MIN, 2 * MIN - 4_000), // published 4 s AFTER we saw it: lag -4 s
        item(3, 'rss-decrypt', 3 * MIN, 3 * MIN + 60_000),
        item(4, 'rss-decrypt', DAY, DAY + 5_000),
        item(5, 'rss-decrypt', -5 * MIN, -5 * MIN + 1_000),
        // gdelt: items but no publishedAt at all -> unknown lag
        item(6, 'gdelt-gkg', 10 * MIN, null),
        item(7, 'gdelt-gkg', 20 * MIN, null),
        // rss-sec: two lags 100 s and 301 s -> 200.5 s, rounded to whole ms is 200500
        item(8, 'rss-sec', 1 * MIN, 1 * MIN + 100_000),
        item(9, 'rss-sec', 2 * MIN, 2 * MIN + 301_000),
      ]);
    const s = await health();
    expect(s.get('rss-decrypt')).toMatchObject({ itemsLast24h: 3, medianLagMs: 10_000 });
    expect(s.get('gdelt-gkg')).toMatchObject({ itemsLast24h: 2, medianLagMs: null });
    expect(s.get('rss-sec')!.medianLagMs).toBe(200_500);
    expect(s.get('rss-coindesk')).toMatchObject({ itemsLast24h: 0, medianLagMs: null });
  });

  it('a negative median lag (the feed stamps times ahead of our clock) is reported as it is, never clamped to 0', async () => {
    await db()
      .insert(newsItems)
      .values([item(21, 'rss-fed', 1 * MIN, 1 * MIN - 4_000), item(22, 'rss-fed', 2 * MIN, 2 * MIN - 4_000), item(23, 'rss-fed', 3 * MIN, 3 * MIN + 1_000)]);
    expect((await health()).get('rss-fed')!.medianLagMs).toBe(-4_000);
  });

  it('enabled follows the configuration: with ingest off the fetched sources are disabled, the calendar stays enabled', async () => {
    await syncNewsSources(db(), { ingest: false, calendar: true });
    const s = await health();
    expect([...s.values()].filter((x) => x.enabled).map((x) => x.id)).toEqual(['official-calendar']);
  });
});

// ───────────────────────────── server = mock

describe('the server answers like the contract mock (packages/contracts/src/mocks/news.ts)', () => {
  const BASE = 'http://mock.local';
  let mockServer: ReturnType<typeof setupServer>;
  const mock = createApiClient({ baseUrl: BASE, validateResponses: true });
  /** fixture id "n-006" <-> uuid; the numeric part keeps the id order, so the (firstSeenAt, id) order is the same. */
  const itemUuid = (label: string) => uid(Number(label.replace(/\D/g, '')));
  const runUuid = (label: string) => `10000000-0000-4000-8000-${Number(label.replace(/\D/g, '')).toString(16).padStart(12, '0')}`;
  const labelOf = new Map<string, string>();
  for (const n of fixtureNewsItems) {
    labelOf.set(itemUuid(n.id), n.id);
    if (n.ingestedRunId) labelOf.set(runUuid(n.ingestedRunId), n.ingestedRunId);
  }
  const relabel = (i: NewsItemAdmin): NewsItemAdmin => ({ ...i, id: labelOf.get(i.id)!, ingestedRunId: i.ingestedRunId === null ? null : labelOf.get(i.ingestedRunId)! });
  const cursorText = (c: string) => Buffer.from(c, 'base64url').toString();
  const relabelCursor = (c: string | null) => (c === null ? null : cursorText(c).replace(/\|(.+)$/, (_m, id: string) => `|${labelOf.get(id)}`));

  beforeAll(async () => {
    mocks = (await import(MOCKS_MODULE)) as MockApi;
    mockServer = setupServer(...mocks.createMockHandlers({ baseUrl: BASE, latencyMs: 0 }));
    mockServer.listen({ onUnhandledRequest: 'bypass' });
  });
  afterAll(() => mockServer.close());
  beforeEach(async () => {
    mocks.resetMockStore();
    mocks.setMockRole('support');
    await db().insert(newsSources).values(fixtureNewsSources.map((s) => ({ id: s.id, name: s.name, kind: s.kind, url: 'https://x.test/', pollIntervalSec: 900, enabled: s.enabled })));
    const labels = [...new Set(fixtureNewsItems.flatMap((n) => (n.ingestedRunId ? [n.ingestedRunId] : [])))];
    for (const l of labels) {
      const src = fixtureNewsItems.find((n) => n.ingestedRunId === l)!.sourceId;
      await db().insert(newsIngestRuns).values({ id: runUuid(l), sourceId: src, startedAt: new Date('2026-10-14T00:00:00Z'), finishedAt: new Date('2026-10-14T00:00:01Z'), status: 'OK' });
    }
    await db()
      .insert(newsItems)
      .values(
        fixtureNewsItems.map((n) => ({
          id: itemUuid(n.id),
          sourceId: n.sourceId,
          url: n.url,
          urlCanonical: n.url,
          title: n.title,
          titleFingerprint: `fp-${n.id}`,
          publishedAt: n.publishedAt === null ? null : new Date(n.publishedAt),
          firstSeenAt: new Date(n.firstSeenAt),
          symbols: n.symbols,
          eventTypes: n.eventTypes,
          tone: n.tone,
          classifierVersion: n.classifierVersion,
          ingestRunId: n.ingestedRunId === null ? null : runUuid(n.ingestedRunId),
        })),
      );
    await db()
      .insert(macroEvents)
      .values(fixtureMacroEvents.map((e) => ({ code: e.code, name: e.name, scheduledAt: new Date(e.scheduledAt), importance: e.importance, referencePeriod: 'x', sourceUrl: 'https://x.test/', actual: e.actual, actualKnownAt: e.actualKnownAt === null ? null : new Date(e.actualKnownAt) })));
  });

  const itemQueries: Record<string, string | number>[] = [
    {},
    { limit: 3 },
    { symbol: 'BTCUSDT' },
    { symbol: 'ETHUSDT' },
    { symbol: 'DOGEUSDT' },
    { eventType: 'ETF' },
    { eventType: 'OTHER' },
    { sourceId: 'src-rss-b' },
    { sourceId: 'src-gdelt', limit: 2 },
    { from: '2026-10-13T11:05:00.000Z', to: '2026-10-14T05:45:00.000Z' },
    { from: '2026-10-14T08:00:00.000Z', to: '2026-10-14T08:00:00.000Z' },
    { from: '2026-10-13T11:05:00.000Z', to: '2026-10-13T11:05:00.000Z' }, // the three items sharing one instant
  ];

  it('adminNewsItems: same items, same order, same cursor for every filter', async () => {
    for (const query of itemQueries) {
      const [theirs, ours] = [await mock.adminNewsItems({ query }), await support.adminNewsItems({ query })];
      expect(ours.items.map(relabel), JSON.stringify(query)).toEqual(theirs.items);
      expect(relabelCursor(ours.nextCursor), JSON.stringify(query)).toEqual(theirs.nextCursor === null ? null : cursorText(theirs.nextCursor));
    }
  });

  it('adminNewsItems: walking the whole list page by page gives the same pages (limit 1, 2, 3), including across the three equal firstSeenAt', async () => {
    for (const limit of [1, 2, 3]) {
      let theirs: string | undefined;
      let ours: string | undefined;
      for (let guard = 0; guard < 12; guard++) {
        const a = await mock.adminNewsItems({ query: { limit, cursor: theirs } });
        const b = await support.adminNewsItems({ query: { limit, cursor: ours } });
        expect(b.items.map(relabel), `limit ${limit} page ${guard}`).toEqual(a.items);
        expect(relabelCursor(b.nextCursor)).toEqual(a.nextCursor === null ? null : cursorText(a.nextCursor));
        if (a.nextCursor === null || b.nextCursor === null) break;
        [theirs, ours] = [a.nextCursor, b.nextCursor];
      }
    }
  });

  it('adminNewsItems: both refuse a malformed cursor and a reversed range', async () => {
    const b64 = (s: string) => Buffer.from(s).toString('base64url');
    for (const cursor of ['!!!', 'x', b64('no-separator'), b64('not-a-date|n-001'), b64('2026-10-14T08:00:00.000Z|')]) {
      await expectApiError(mock.adminNewsItems({ query: { cursor } }), 'VALIDATION_ERROR', 400);
      await expectApiError(support.adminNewsItems({ query: { cursor } }), 'VALIDATION_ERROR', 400);
    }
    const reversed = { from: '2026-10-14T00:00:00.000Z', to: '2026-10-13T00:00:00.000Z' };
    await expectApiError(mock.adminNewsItems({ query: reversed }), 'VALIDATION_ERROR', 400);
    await expectApiError(support.adminNewsItems({ query: reversed }), 'VALIDATION_ERROR', 400);
  });

  it('adminNewsMacroEvents: same events and order for explicit windows, one-sided windows, filters and the default window', async () => {
    const queries: Record<string, string>[] = [
      {},
      { from: '2026-09-01T00:00:00.000Z', to: '2026-12-31T00:00:00.000Z' },
      { from: '2026-10-14T12:30:00.000Z', to: '2026-10-14T12:30:00.000Z' },
      { from: '2026-09-30T12:30:00.000Z', to: '2026-10-28T18:00:00.000Z', code: 'CPI' },
      { from: '2026-09-01T00:00:00.000Z', to: '2026-12-31T00:00:00.000Z', importance: 'HIGH' },
      { from: '2026-10-01T00:00:00.000Z' },
      { to: '2026-10-20T00:00:00.000Z' },
      { to: '2027-12-31T00:00:00.000Z' },
      { from: '2026-09-01T00:00:00.000Z', to: '2026-12-31T00:00:00.000Z', code: 'NFP' },
    ];
    for (const query of queries) {
      expect((await support.adminNewsMacroEvents({ query })).items, JSON.stringify(query)).toEqual((await mock.adminNewsMacroEvents({ query })).items);
    }
    const long = { from: '2025-01-01T00:00:00.000Z', to: '2026-02-06T00:00:00.000Z' }; // 401 days
    await expectApiError(mock.adminNewsMacroEvents({ query: long }), 'VALIDATION_ERROR', 400);
    await expectApiError(support.adminNewsMacroEvents({ query: long }), 'VALIDATION_ERROR', 400);
  });

  it('adminNewsSources: the same shape as the fixture list, with unknowns null/0 (checked against the contract by the client)', async () => {
    await syncNewsSources(db(), { ingest: true, calendar: true });
    const theirs = await mock.adminNewsSources({});
    const ours = await support.adminNewsSources({});
    expect(Object.keys(ours.items[0]!).sort()).toEqual(Object.keys(theirs.items[0]!).sort());
    // the fixture ids and the catalogue ids differ; what must be shared is the meaning: never-run sources are UNAVAILABLE with null times
    for (const s of ours.items.filter((x) => x.id.startsWith('rss-') || x.id === 'gdelt-gkg')) expect([s.status, s.lastSuccessAt, s.medianLagMs, s.itemsLast24h]).toEqual(['UNAVAILABLE', null, null, 0]);
    expect(theirs.items.find((s) => s.id === 'src-fred')).toMatchObject({ enabled: false, status: 'UNAVAILABLE', lastSuccessAt: null, medianLagMs: null });
  });
});
