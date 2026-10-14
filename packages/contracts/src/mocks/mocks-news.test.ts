import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import {
  AdminNewsItemsQuery,
  AnalysisDepartmentId,
  AnalysisNewsContext,
  ApiError,
  CryptoMarketAnalysisReport,
  CryptoMarketSnapshot,
  NewsEventType,
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
import { createMockHandlers, resetMockStore, setMockRole } from './index.ts';

const BASE = 'http://mock.local';
const server = setupServer(...createMockHandlers({ baseUrl: BASE, latencyMs: 0 }));
const api = createApiClient({ baseUrl: BASE, validateResponses: true });
const code = (c: string) => (e: unknown) => e instanceof ApiError && e.code === c;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  resetMockStore();
  setMockRole('support');
});
afterAll(() => server.close());

const { firstSeenAt: _f, ...itemWithoutFirstSeen } = fixtureNewsItems[0]!;

describe('news schemas (0.17.0)', () => {
  it('firstSeenAt is required; publishedAt may be null but not missing', () => {
    expect(SnapshotNewsItem.safeParse(fixtureNewsItems[0]).success).toBe(true);
    expect(SnapshotNewsItem.safeParse(itemWithoutFirstSeen).success).toBe(false);
    expect(SnapshotNewsItem.safeParse({ ...fixtureNewsItems[0], firstSeenAt: null }).success).toBe(false);
    expect(SnapshotNewsItem.safeParse({ ...fixtureNewsItems[0], firstSeenAt: 'yesterday' }).success).toBe(false);
    expect(fixtureNewsItems[0]!.publishedAt).toBeNull();
    const { publishedAt: _p, ...noPublished } = fixtureNewsItems[0]!;
    expect(SnapshotNewsItem.safeParse(noPublished).success).toBe(false);
  });

  it('missing tone / actual stay null: they are never replaced by "0"', () => {
    const noTone = fixtureNewsItems.find((n) => n.tone === null)!;
    const parsed = SnapshotNewsItem.parse(noTone);
    expect(parsed.tone).toBeNull();
    // an omitted tone is invalid (must be an explicit null), and a non-decimal is rejected
    const { tone: _t, ...omitted } = noTone;
    expect(SnapshotNewsItem.safeParse(omitted).success).toBe(false);
    expect(SnapshotNewsItem.safeParse({ ...noTone, tone: 'n/a' }).success).toBe(false);
    expect(SnapshotNewsItem.safeParse({ ...noTone, tone: -1.4 }).success).toBe(false);

    const pending = SnapshotMacroEvent.parse(fixtureMacroEvents[0]);
    expect(pending.actual).toBeNull();
    expect(pending.actualKnownAt).toBeNull();
    expect(SnapshotMacroEvent.parse(fixtureMacroEvents[1]).actual).toBe('2.7');
    expect(SnapshotMacroEvent.safeParse({ ...fixtureMacroEvents[0], actual: 2.7 }).success).toBe(false);
  });

  it('tilt.validated only accepts false', () => {
    expect(AnalysisNewsContext.safeParse(fixtureAnalysisNewsContext).success).toBe(true);
    const withValidated = (validated: unknown) => ({ ...fixtureAnalysisNewsContext, tilt: { ...fixtureAnalysisNewsContext.tilt, validated } });
    expect(AnalysisNewsContext.safeParse(withValidated(true)).success).toBe(false);
    expect(AnalysisNewsContext.safeParse(withValidated(undefined)).success).toBe(false);
    expect(AnalysisNewsContext.safeParse(withValidated('false')).success).toBe(false);
    expect(AnalysisNewsContext.safeParse({ ...fixtureAnalysisNewsContext, tilt: { ...fixtureAnalysisNewsContext.tilt, meanTone: null } }).success).toBe(true);
    expect(AnalysisNewsContext.safeParse({ ...fixtureAnalysisNewsContext, impact: ['APPROVED'] }).success).toBe(false);
  });

  it('closed enums; news_event_risk is a department; sources/ status shape', () => {
    expect(NewsEventType.options).toEqual(['MACRO_DATA', 'CENTRAL_BANK', 'REGULATORY_ACTION', 'ETF', 'HACK_EXPLOIT', 'LISTING', 'DELISTING', 'EXCHANGE_INCIDENT', 'ADOPTION', 'OTHER']);
    expect(AnalysisDepartmentId.options).toContain('news_event_risk');
    expect(SnapshotNews.safeParse(fixtureSnapshotNews).success).toBe(true);
    expect(SnapshotNews.safeParse({ ...fixtureSnapshotNews, sourcesLive: -1 }).success).toBe(false);
    // "sources alive, no news" is representable and differs from "no sources"
    expect(SnapshotNews.safeParse({ status: 'LIVE', observedAt: '2026-10-14T08:25:00.000Z', sourcesLive: 2, sourcesTotal: 2, items: [] }).success).toBe(true);
    expect(SnapshotNews.safeParse({ status: 'UNAVAILABLE', observedAt: null, sourcesLive: 0, sourcesTotal: 2, items: [] }).success).toBe(true);
    for (const s of fixtureNewsSources) expect(NewsSourceHealth.safeParse(s).success).toBe(true);
    expect(NewsSourceHealth.safeParse({ ...fixtureNewsSources[1], medianLagSeconds: 0.5 }).success).toBe(false);
  });

  it('snapshot and report accept the new fields and stay valid without them', () => {
    // pull the existing valid shapes through the optional wrappers (no need to rebuild a full snapshot)
    expect(CryptoMarketSnapshot.shape.news.safeParse(undefined).success).toBe(true);
    expect(CryptoMarketSnapshot.shape.news.safeParse(null).success).toBe(true);
    expect(CryptoMarketSnapshot.shape.news.safeParse(fixtureSnapshotNews).success).toBe(true);
    expect(CryptoMarketSnapshot.shape.macroEvents.safeParse(fixtureMacroEvents).success).toBe(true);
    expect(CryptoMarketAnalysisReport.shape.newsContext.safeParse(undefined).success).toBe(true);
    expect(CryptoMarketAnalysisReport.shape.newsContext.safeParse(null).success).toBe(true);
    expect(CryptoMarketAnalysisReport.shape.newsContext.safeParse(fixtureAnalysisNewsContext).success).toBe(true);
  });

  it('list query: symbol / eventType validated, from after to rejected, limit capped', () => {
    expect(AdminNewsItemsQuery.safeParse({ symbol: 'BTCUSDT', eventType: 'ETF', limit: '10' }).success).toBe(true);
    expect(AdminNewsItemsQuery.safeParse({ eventType: 'RUMOR' }).success).toBe(false);
    expect(AdminNewsItemsQuery.safeParse({ symbol: 'btc/usdt' }).success).toBe(false);
    expect(AdminNewsItemsQuery.safeParse({ from: '2026-10-14T00:00:00.000Z', to: '2026-10-13T00:00:00.000Z' }).success).toBe(false);
    expect(AdminNewsItemsQuery.safeParse({ limit: '201' }).success).toBe(false);
  });
});

describe('news endpoints (0.17.0)', () => {
  it('both are staff endpoints with news.view; every staff role holds it, a user does not', () => {
    for (const n of ['adminNewsItems', 'adminNewsSources'] as const) {
      const def = endpoints[n] as EndpointDef;
      expect(def.auth).toBe('staff');
      expect(def.permission).toBe('news.view');
    }
    for (const r of ['support', 'admin', 'owner'] as const) expect(hasPermission(r, 'news.view')).toBe(true);
    expect(hasPermission('user', 'news.view')).toBe(false);
    // no user-facing news endpoint (C-D1)
    expect(Object.entries(endpoints).filter(([n, d]) => /news/i.test(n) && (d as EndpointDef).auth !== 'staff')).toEqual([]);
  });

  it('rejects signed-out, plain users and staff without 2FA like the server', async () => {
    setMockRole('user', false);
    await expect(api.adminNewsItems({})).rejects.toSatisfy(code('FORBIDDEN'));
    await expect(api.adminNewsSources({})).rejects.toSatisfy(code('FORBIDDEN'));
    setMockRole('support', false);
    await expect(api.adminNewsItems({})).rejects.toSatisfy(code('TWO_FACTOR_REQUIRED'));
  });

  it('lists newest first, filters and pages by cursor', async () => {
    const all = await api.adminNewsItems({});
    expect(all.items.map((n) => n.id)).toEqual(['n-006', 'n-005', 'n-004', 'n-003', 'n-002', 'n-001']);
    expect(all.nextCursor).toBeNull();

    const btc = await api.adminNewsItems({ query: { symbol: 'BTCUSDT' } });
    expect(btc.items.map((n) => n.id)).toEqual(['n-006', 'n-001']);
    expect((await api.adminNewsItems({ query: { eventType: 'CENTRAL_BANK' } })).items.map((n) => n.id)).toEqual(['n-004']);
    expect((await api.adminNewsItems({ query: { source: 'Crypto RSS A' } })).items.map((n) => n.id)).toEqual(['n-006', 'n-002']);
    // from/to bound firstSeenAt (n-005 was published 07:45 but first seen 08:00)
    const win = await api.adminNewsItems({ query: { from: '2026-10-14T08:00:00.000Z', to: '2026-10-14T08:00:00.000Z' } });
    expect(win.items.map((n) => n.id)).toEqual(['n-005']);
    expect((await api.adminNewsItems({ query: { symbol: 'DOGEUSDT' } })).items).toEqual([]);

    const p1 = await api.adminNewsItems({ query: { limit: 4 } });
    expect(p1.items).toHaveLength(4);
    expect(p1.nextCursor).toBe('n-003');
    const p2 = await api.adminNewsItems({ query: { limit: 4, cursor: p1.nextCursor! } });
    expect(p2.items.map((n) => n.id)).toEqual(['n-002', 'n-001']);
    expect(p2.nextCursor).toBeNull();
    expect((await api.adminNewsItems({ query: { cursor: 'nope' } })).items).toEqual([]);
  });

  it('keeps null as null on the wire and rejects a bad query with VALIDATION_ERROR', async () => {
    const all = await api.adminNewsItems({});
    expect(all.items.find((n) => n.id === 'n-006')!.publishedAt).toBeNull();
    expect(all.items.find((n) => n.id === 'n-006')!.tone).toBeNull();
    expect(all.items.find((n) => n.id === 'n-005')!.tone).toBe('3.2');
    await expect(api.adminNewsItems({ query: { from: '2026-10-14T00:00:00.000Z', to: '2026-10-13T00:00:00.000Z' } })).rejects.toSatisfy(code('VALIDATION_ERROR'));
    await expect(api.adminNewsItems({ query: { limit: 0 } })).rejects.toSatisfy(code('VALIDATION_ERROR'));
  });

  it('source health shows STALE / UNAVAILABLE and null (not 0) for unknown lag', async () => {
    const { items } = await api.adminNewsSources({});
    expect(items.map((s) => s.status)).toEqual(['LIVE', 'STALE', 'UNAVAILABLE', 'UNAVAILABLE']);
    expect(items[1]!.medianLagSeconds).toBeNull();
    expect(items[2]!.lastSuccessAt).toBeNull();
  });
});
