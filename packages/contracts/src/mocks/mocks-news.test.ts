import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import {
  AdminNewsItemsQuery,
  AdminNewsMacroEventsQuery,
  AnalysisDepartmentId,
  AnalysisNewsContext,
  ApiError,
  CryptoMarketAnalysisReport,
  CryptoMarketSnapshot,
  NewsEventType,
  NewsItemAdmin,
  NewsSourceHealth,
  SnapshotMacroEvent,
  SnapshotNews,
  SnapshotNewsItem,
  createApiClient,
  endpoints,
  hasPermission,
  type EndpointDef,
} from '../index.ts';
import { fixtureAnalysisNewsContext, fixtureMacroEvents, fixtureNewsItems, fixtureNewsSources, fixtureSnapshotNews } from '../fixtures/index.ts';
import { createMockHandlers, mockStore, resetMockStore, setMockRole } from './index.ts';

const BASE = 'http://mock.local';
const server = setupServer(...createMockHandlers({ baseUrl: BASE, latencyMs: 0 }));
const api = createApiClient({ baseUrl: BASE, validateResponses: true });
const code = (c: string) => (e: unknown) => e instanceof ApiError && e.code === c;
const ids = (r: { items: { id: string }[] }) => r.items.map((n) => n.id);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  resetMockStore();
  setMockRole('support');
});
afterAll(() => server.close());

const item = fixtureNewsItems[0]!;
const ctx = fixtureAnalysisNewsContext;
const withTilt = (t: object) => ({ ...ctx, tilt: { ...ctx.tilt!, ...t } });

describe('news item schema (0.17.0)', () => {
  it('firstSeenAt is required; publishedAt may be null but not missing', () => {
    expect(SnapshotNewsItem.safeParse(item).success).toBe(true);
    const { firstSeenAt: _f, ...noFirstSeen } = item;
    expect(SnapshotNewsItem.safeParse(noFirstSeen).success).toBe(false);
    expect(SnapshotNewsItem.safeParse({ ...item, firstSeenAt: null }).success).toBe(false);
    expect(SnapshotNewsItem.safeParse({ ...item, firstSeenAt: 'yesterday' }).success).toBe(false);
    expect(item.publishedAt).toBeNull();
    const { publishedAt: _p, ...noPublished } = item;
    expect(SnapshotNewsItem.safeParse(noPublished).success).toBe(false);
  });

  it('url accepts only http(s) up to 2048 characters', () => {
    expect(SnapshotNewsItem.safeParse({ ...item, url: 'http://example.com/a' }).success).toBe(true);
    for (const bad of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'ftp://example.com/a', 'example.com/a', '']) {
      expect(SnapshotNewsItem.safeParse({ ...item, url: bad }).success, bad).toBe(false);
    }
    expect(SnapshotNewsItem.safeParse({ ...item, url: `https://example.com/${'a'.repeat(2040)}` }).success).toBe(false);
  });

  it('eventTypes needs at least one value', () => {
    expect(SnapshotNewsItem.safeParse({ ...item, eventTypes: [] }).success).toBe(false);
    expect(SnapshotNewsItem.safeParse({ ...item, eventTypes: ['OTHER'] }).success).toBe(true);
    expect(NewsEventType.options).toHaveLength(10);
    expect(AnalysisDepartmentId.options).toContain('news_event_risk');
  });

  it('missing tone / actual stay null: never replaced by "0"', () => {
    const noTone = fixtureNewsItems.find((n) => n.tone === null)!;
    expect(SnapshotNewsItem.parse(noTone).tone).toBeNull();
    const { tone: _t, ...omitted } = noTone;
    expect(SnapshotNewsItem.safeParse(omitted).success).toBe(false);
    expect(SnapshotNewsItem.safeParse({ ...noTone, tone: 'n/a' }).success).toBe(false);
    expect(SnapshotNewsItem.safeParse({ ...noTone, tone: -1.4 }).success).toBe(false);
    const pending = SnapshotMacroEvent.parse(fixtureMacroEvents.find((e) => e.code === 'CPI'));
    expect(pending.actual).toBeNull();
    expect(pending.actualKnownAt).toBeNull();
    expect(SnapshotMacroEvent.safeParse({ ...pending, actual: 2.7 }).success).toBe(false);
  });

  it('GDELT fixtures have no publishedAt and the GDELT source has an unknown (null) lag', () => {
    for (const n of fixtureNewsItems.filter((x) => x.sourceKind === 'GDELT')) expect(n.publishedAt).toBeNull();
    expect(fixtureNewsSources.find((s) => s.kind === 'GDELT')!.medianLagMs).toBeNull();
    expect(fixtureNewsSources.find((s) => s.kind === 'OFFICIAL_CALENDAR')!.status).toBe('LIVE');
  });
});

describe('snapshot news slice (0.17.0)', () => {
  it('sources carry per-source freshness; sourcesLive/Total must match them', () => {
    expect(SnapshotNews.safeParse(fixtureSnapshotNews).success).toBe(true);
    expect(fixtureSnapshotNews.sources.map((s) => s.status)).toEqual(['LIVE', 'STALE', 'LIVE', 'LIVE']);
    expect(SnapshotNews.safeParse({ ...fixtureSnapshotNews, sourcesLive: 4 }).success).toBe(false);
    expect(SnapshotNews.safeParse({ ...fixtureSnapshotNews, sourcesTotal: 5 }).success).toBe(false);
    const { sources: _s, ...noSources } = fixtureSnapshotNews;
    expect(SnapshotNews.safeParse(noSources).success).toBe(false);
    // "sources alive, no news" and "no sources" are both representable
    const live = { name: 'GDELT GKG', kind: 'GDELT', status: 'LIVE', lastSuccessAt: '2026-10-14T08:00:00.000Z' };
    expect(SnapshotNews.safeParse({ status: 'LIVE', observedAt: '2026-10-14T08:25:00.000Z', sourcesLive: 1, sourcesTotal: 1, sources: [live], items: [] }).success).toBe(true);
    expect(SnapshotNews.safeParse({ status: 'UNAVAILABLE', observedAt: null, sourcesLive: 0, sourcesTotal: 0, sources: [], items: [] }).success).toBe(true);
  });

  it('snapshot and report accept the new fields and stay valid without them', () => {
    expect(CryptoMarketSnapshot.shape.news.safeParse(undefined).success).toBe(true);
    expect(CryptoMarketSnapshot.shape.news.safeParse(null).success).toBe(true);
    expect(CryptoMarketSnapshot.shape.news.safeParse(fixtureSnapshotNews).success).toBe(true);
    expect(CryptoMarketSnapshot.shape.macroEvents.safeParse(fixtureMacroEvents).success).toBe(true);
    expect(CryptoMarketAnalysisReport.shape.newsContext.safeParse(undefined).success).toBe(true);
    expect(CryptoMarketAnalysisReport.shape.newsContext.safeParse(null).success).toBe(true);
    expect(CryptoMarketAnalysisReport.shape.newsContext.safeParse(ctx).success).toBe(true);
  });
});

describe('analysis news context (0.17.0)', () => {
  it('the fixture follows the v0 rule: hack item on the pair -> BLOCKED', () => {
    expect(AnalysisNewsContext.safeParse(ctx).success).toBe(true);
    expect(ctx.impact).toContain('BLOCKED');
    expect(ctx.itemsUsed[0]!.eventTypes).toContain('HACK_EXPLOIT');
  });

  it('an item without tone is counted as unscored, not neutral; counts must add up', () => {
    expect(ctx.tilt).toMatchObject({ negative: 1, neutral: 0, unscored: 1 });
    expect(ctx.itemsUsed.filter((i) => i.tone === null)).toHaveLength(ctx.tilt!.unscored);
    expect(AnalysisNewsContext.safeParse(withTilt({ neutral: 1, unscored: 0 })).success).toBe(true); // still sums to 2
    expect(AnalysisNewsContext.safeParse(withTilt({ neutral: 1 })).success).toBe(false); // sums to 3
    expect(AnalysisNewsContext.safeParse(withTilt({ unscored: 0 })).success).toBe(false); // sums to 1
    const { unscored: _u, ...noUnscored } = ctx.tilt!;
    expect(AnalysisNewsContext.safeParse({ ...ctx, tilt: noUnscored }).success).toBe(false);
  });

  it('tilt.validated only accepts false', () => {
    for (const v of [true, undefined, 'false']) expect(AnalysisNewsContext.safeParse(withTilt({ validated: v })).success).toBe(false);
    expect(AnalysisNewsContext.safeParse(withTilt({ meanTone: null })).success).toBe(true);
  });

  it('tilt is null (and only allowed to be) when status is UNAVAILABLE', () => {
    const none = { ...ctx, status: 'UNAVAILABLE', itemsUsed: [], upcomingEvents: [], tilt: null, impact: ['UNAVAILABLE'] };
    expect(AnalysisNewsContext.safeParse(none).success).toBe(true);
    expect(AnalysisNewsContext.safeParse({ ...none, tilt: { positive: 0, negative: 0, neutral: 0, unscored: 0, meanTone: null, validated: false } }).success).toBe(false);
  });

  it('itemsUsed are full items: classifierVersion, url, symbols are required', () => {
    const { classifierVersion: _c, ...noClassifier } = ctx.itemsUsed[0]!;
    expect(AnalysisNewsContext.safeParse({ ...ctx, itemsUsed: [noClassifier, ctx.itemsUsed[1]] }).success).toBe(false);
    const { url: _u, ...noUrl } = ctx.itemsUsed[0]!;
    expect(AnalysisNewsContext.safeParse({ ...ctx, itemsUsed: [noUrl, ctx.itemsUsed[1]] }).success).toBe(false);
  });

  it('impact: named values, at least one, no repeats, CONTEXT_ONLY / UNAVAILABLE stand alone', () => {
    const ok = (impact: unknown) => AnalysisNewsContext.safeParse({ ...ctx, impact }).success;
    expect(ok(['BLOCKED'])).toBe(true);
    expect(ok(['BLOCKED', 'UNCERTAINTY_RAISED'])).toBe(true);
    expect(ok(['CONTEXT_ONLY'])).toBe(true);
    expect(ok([])).toBe(false);
    expect(ok(['BLOCKED', 'BLOCKED'])).toBe(false);
    expect(ok(['CONTEXT_ONLY', 'BLOCKED'])).toBe(false);
    expect(ok(['UNAVAILABLE', 'UNCERTAINTY_RAISED'])).toBe(false);
    expect(ok(['APPROVED'])).toBe(false);
  });
});

describe('news queries (0.17.0)', () => {
  it('items query: filters validated, from after to rejected, NaN dates only give the format error, limit capped', () => {
    expect(AdminNewsItemsQuery.safeParse({ symbol: 'BTCUSDT', eventType: 'ETF', sourceId: 'src-gdelt', limit: '10' }).success).toBe(true);
    expect(AdminNewsItemsQuery.safeParse({ eventType: 'RUMOR' }).success).toBe(false);
    expect(AdminNewsItemsQuery.safeParse({ symbol: 'btc/usdt' }).success).toBe(false);
    expect(AdminNewsItemsQuery.safeParse({ from: '2026-10-14T00:00:00.000Z', to: '2026-10-13T00:00:00.000Z' }).success).toBe(false);
    expect(AdminNewsItemsQuery.safeParse({ limit: '201' }).success).toBe(false);
    const bad = AdminNewsItemsQuery.safeParse({ from: 'garbage', to: '2026-10-13T00:00:00.000Z' });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues.map((i) => i.message)).not.toContain('from must not be after to');
  });

  it('macro-events query: from <= to and a window of at most 400 days', () => {
    const q = (from: string, to: string) => AdminNewsMacroEventsQuery.safeParse({ from, to }).success;
    expect(q('2026-01-01T00:00:00.000Z', '2027-02-04T00:00:00.000Z')).toBe(true); // 399 days
    expect(q('2026-01-01T00:00:00.000Z', '2027-02-06T00:00:00.000Z')).toBe(false); // 401 days
    expect(q('2026-10-14T00:00:00.000Z', '2026-10-13T00:00:00.000Z')).toBe(false);
    expect(AdminNewsMacroEventsQuery.safeParse({ code: 'CPI', importance: 'HIGH' }).success).toBe(true);
    expect(AdminNewsMacroEventsQuery.safeParse({ code: 'GDP' }).success).toBe(false);
  });
});

describe('news endpoints (0.17.0)', () => {
  it('all three are staff endpoints with news.view; staff roles hold it, a user does not; none is user-facing', () => {
    for (const n of ['adminNewsItems', 'adminNewsSources', 'adminNewsMacroEvents'] as const) {
      const def = endpoints[n] as EndpointDef;
      expect(def.auth).toBe('staff');
      expect(def.permission).toBe('news.view');
    }
    for (const r of ['support', 'admin', 'owner'] as const) expect(hasPermission(r, 'news.view')).toBe(true);
    expect(hasPermission('user', 'news.view')).toBe(false);
    expect(Object.entries(endpoints).filter(([n, d]) => /news/i.test(n) && (d as EndpointDef).auth !== 'staff')).toEqual([]);
  });

  it('rejects signed-out, plain users and staff without 2FA like the server', async () => {
    mockStore.signedIn = false;
    await expect(api.adminNewsItems({})).rejects.toSatisfy(code('UNAUTHENTICATED'));
    setMockRole('user', false);
    mockStore.signedIn = true;
    await expect(api.adminNewsItems({})).rejects.toSatisfy(code('FORBIDDEN'));
    await expect(api.adminNewsSources({})).rejects.toSatisfy(code('FORBIDDEN'));
    await expect(api.adminNewsMacroEvents({})).rejects.toSatisfy(code('FORBIDDEN'));
    setMockRole('support', false);
    await expect(api.adminNewsItems({})).rejects.toSatisfy(code('TWO_FACTOR_REQUIRED'));
  });

  it('lists by (firstSeenAt, id) descending and filters', async () => {
    const all = await api.adminNewsItems({});
    expect(ids(all)).toEqual(['n-006', 'n-005', 'n-004', 'n-003', 'n-008', 'n-007', 'n-002', 'n-001']);
    expect(all.nextCursor).toBeNull();
    expect((await api.adminNewsItems({ query: { symbol: 'BTCUSDT' } })).items.map((n) => n.id)).toEqual(['n-006', 'n-001']);
    // a symbol filter does not return market-wide news (symbols: [])
    expect(ids(await api.adminNewsItems({ query: { symbol: 'BTCUSDT' } }))).not.toContain('n-004');
    expect(ids(await api.adminNewsItems({ query: { eventType: 'CENTRAL_BANK' } }))).toEqual(['n-004']);
    expect(ids(await api.adminNewsItems({ query: { sourceId: 'src-rss-a' } }))).toEqual(['n-006', 'n-002']);
    expect(ids(await api.adminNewsItems({ query: { from: '2026-10-14T08:00:00.000Z', to: '2026-10-14T08:00:00.000Z' } }))).toEqual(['n-005']);
    expect((await api.adminNewsItems({ query: { symbol: 'DOGEUSDT' } })).items).toEqual([]);
  });

  it('limit=1 walks past items that share one firstSeenAt without loss or repeat', async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 20; i++) {
      const page = await api.adminNewsItems({ query: { limit: 1, ...(cursor ? { cursor } : {}) } });
      seen.push(...ids(page));
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }
    expect(seen).toEqual(['n-006', 'n-005', 'n-004', 'n-003', 'n-008', 'n-007', 'n-002', 'n-001']);
    expect(new Set(seen).size).toBe(seen.length);
    const p = await api.adminNewsItems({ query: { limit: 5 } });
    expect(ids(p)).toEqual(['n-006', 'n-005', 'n-004', 'n-003', 'n-008']);
    expect(ids(await api.adminNewsItems({ query: { limit: 5, cursor: p.nextCursor! } }))).toEqual(['n-007', 'n-002', 'n-001']);
  });

  it('a malformed cursor is VALIDATION_ERROR, not an empty page', async () => {
    for (const cursor of ['nope', '!!!', 'bm9waXBl']) await expect(api.adminNewsItems({ query: { cursor } })).rejects.toSatisfy(code('VALIDATION_ERROR'));
  });

  it('keeps null as null on the wire and rejects a bad query with VALIDATION_ERROR', async () => {
    const all = await api.adminNewsItems({});
    const hack = all.items.find((n) => n.id === 'n-006')!;
    expect(hack.publishedAt).toBeNull();
    expect(hack.tone).toBeNull();
    expect(all.items.find((n) => n.id === 'n-005')!.tone).toBe('3.2');
    expect(NewsItemAdmin.safeParse(hack).success).toBe(true);
    await expect(api.adminNewsItems({ query: { from: '2026-10-14T00:00:00.000Z', to: '2026-10-13T00:00:00.000Z' } })).rejects.toSatisfy(code('VALIDATION_ERROR'));
    await expect(api.adminNewsItems({ query: { limit: 0 } })).rejects.toSatisfy(code('VALIDATION_ERROR'));
  });

  it('source health: STALE / disabled, unknown lag is null, a negative lag is kept', async () => {
    const { items } = await api.adminNewsSources({});
    expect(items.map((s) => s.status)).toEqual(['LIVE', 'STALE', 'LIVE', 'LIVE', 'UNAVAILABLE']);
    expect(items[0]!.medianLagMs).toBeNull();
    expect(items[2]!.medianLagMs).toBe(-4000);
    expect(NewsSourceHealth.safeParse({ ...items[1], medianLagMs: 0.5 }).success).toBe(false);
    expect(NewsSourceHealth.safeParse({ ...items[1], medianLagMs: -1 }).success).toBe(true);
  });

  it('macro events: ascending by scheduledAt, filtered, window rules', async () => {
    const w = { from: '2026-09-01T00:00:00.000Z', to: '2026-11-30T00:00:00.000Z' };
    expect((await api.adminNewsMacroEvents({ query: w })).items.map((e) => e.code)).toEqual(['PCE', 'CPI', 'FOMC_DECISION']);
    expect((await api.adminNewsMacroEvents({ query: { ...w, importance: 'HIGH' } })).items.map((e) => e.code)).toEqual(['CPI', 'FOMC_DECISION']);
    expect((await api.adminNewsMacroEvents({ query: { ...w, code: 'PCE' } })).items[0]!.actual).toBe('2.7');
    expect((await api.adminNewsMacroEvents({ query: { from: '2026-10-01T00:00:00.000Z' } })).items.map((e) => e.code)).toEqual(['CPI', 'FOMC_DECISION']);
    await expect(api.adminNewsMacroEvents({ query: { from: '2026-01-01T00:00:00.000Z', to: '2027-12-31T00:00:00.000Z' } })).rejects.toSatisfy(code('VALIDATION_ERROR'));
  });
});
