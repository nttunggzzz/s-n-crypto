import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { ApiError, ASSET_CATALOG, createApiClient, type ExchangeStatus } from '../index.ts';
import { createMockHandlers, createMockRealtimeClient, resetMockStore, setMockRole } from './index.ts';

const BASE = 'http://mock.local';
const server = setupServer(...createMockHandlers({ baseUrl: BASE, latencyMs: 0 }));
const api = createApiClient({ baseUrl: BASE, validateResponses: true });
const code = (c: string) => (e: unknown) => e instanceof ApiError && e.code === c;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  resetMockStore();
  setMockRole('user', false);
});
afterAll(() => server.close());

describe('contracts 0.4.0 mocks', () => {
  it('exchangeInfo lists 50 pairs and the coin info of every asset', async () => {
    const info = await api.exchangeInfo();
    expect(info.symbols).toHaveLength(50);
    const assets = new Set(info.assets.map((a) => a.asset));
    for (const s of info.symbols) expect(assets.has(s.baseAsset) && assets.has(s.quoteAsset)).toBe(true);
    expect(info.assets.find((a) => a.asset === 'BTC')).toMatchObject({ name: 'Bitcoin', tags: ['LAYER1', 'PAYMENTS'] });
    // the catalog covers every mock asset
    for (const a of assets) expect(ASSET_CATALOG.some((c) => c.asset === a)).toBe(true);
  });

  it('sparklines: 24h = 25 hourly points, 7d = 43 four-hourly; unavailable pair has none', async () => {
    const d = await api.sparklines();
    expect(d.interval).toBe('1h');
    expect(d.items).toHaveLength(50);
    expect(d.items.find((s) => s.symbol === 'BTCUSDT')!.points).toHaveLength(25);
    expect(d.items.find((s) => s.symbol === 'LINKUSDT')).toMatchObject({ points: [], status: 'UNAVAILABLE' });
    const w = await api.sparklines({ query: { range: '7d' } });
    expect(w.interval).toBe('4h');
    expect(w.items[0]!.points).toHaveLength(43);
  });

  it('deep depth: up to 500 levels', async () => {
    expect((await api.depth({ params: { symbol: 'BTCUSDT' }, query: { limit: 200 } })).bids).toHaveLength(200);
    await expect(api.depth({ params: { symbol: 'BTCUSDT' }, query: { limit: 501 } })).rejects.toBeTruthy();
  });

  it('public announcements: published, not expired, pinned first; drafts hidden', async () => {
    const { items } = await api.announcements();
    expect(items.map((a) => a.id)).toEqual(['3', '2', '1']);
    expect(items[0]!.pinned).toBe(true);
  });

  it('admin: coin info and announcements need permissions and write the audit log', async () => {
    setMockRole('support');
    await api.adminListAnnouncements();
    await expect(api.adminCreateAnnouncement({ body: { title: 'x', body: 'y' } })).rejects.toSatisfy(code('FORBIDDEN'));
    await expect(api.adminUpdateAsset({ params: { asset: 'BTC' }, body: { name: 'BTC', reason: 'đổi tên hiển thị' } })).rejects.toSatisfy(code('FORBIDDEN'));

    setMockRole('admin');
    const a = await api.adminCreateAnnouncement({ body: { title: 'Bảo trì', body: 'Nội dung', level: 'MAINTENANCE', publish: false } });
    expect(a.publishedAt).toBeNull();
    expect((await api.announcements()).items.some((x) => x.id === a.id)).toBe(false);
    const pub = await api.adminUpdateAnnouncement({ params: { announcementId: a.id }, body: { published: true, pinned: true } });
    expect(pub.publishedAt).not.toBeNull();
    expect((await api.announcements()).items[0]!.id).toBe(a.id);
    await api.adminUpdateAnnouncement({ params: { announcementId: a.id }, body: { hidden: true } });
    expect((await api.announcements()).items.some((x) => x.id === a.id)).toBe(false);

    const btc = await api.adminUpdateAsset({ params: { asset: 'BTC' }, body: { tags: ['LAYER1'], reason: 'gọn nhóm ngành' } });
    expect(btc.tags).toEqual(['LAYER1']);
    expect((await api.exchangeInfo()).assets.find((x) => x.asset === 'BTC')!.tags).toEqual(['LAYER1']);
    const actions = (await api.adminAuditLogs()).items.slice(0, 4).map((e) => e.action);
    expect(actions).toEqual(['ASSET_UPDATE', 'ANNOUNCEMENT_UPDATE', 'ANNOUNCEMENT_UPDATE', 'ANNOUNCEMENT_CREATE']);
  });

  it('realtime exchange:status: snapshot on subscribe, then changes', async () => {
    const rt = createMockRealtimeClient({ intervalMs: 10 });
    const seen: ExchangeStatus[] = [];
    rt.subscribe('exchange:status', (s) => seen.push(s));
    await new Promise((r) => setTimeout(r, 30));
    expect(seen[0]).toMatchObject({ tradingHalted: false, disabledSymbols: ['SUIUSDT'] });
    setMockRole('admin');
    await api.adminHaltTrading({ body: { reason: 'sự cố dữ liệu giá', confirm: 'HALT' } });
    await new Promise((r) => setTimeout(r, 40));
    rt.close();
    expect(seen.at(-1)!.tradingHalted).toBe(true);
  });
});
