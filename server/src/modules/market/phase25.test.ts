import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { and, eq } from 'drizzle-orm';
import { ApiError, type Depth, type ExchangeStatus, type ServerMessage } from '@cex/contracts';
import { auditLogs, candles } from '../../db/schema.ts';
import { setBook } from '../../../test/helpers.ts';
import { ApiHarness } from '../../../test/apiHarness.ts';
import { DepthSnapshots, mergeDeepDepth, type BookSnapshot } from './depthSnapshots.ts';
import { planConnections, streamsFor } from './binance.ts';

const expectApiError = (p: Promise<unknown>, code: string) => expect(p).rejects.toSatisfy((e: unknown) => e instanceof ApiError && e.code === code);

// ───────────────────────────── units

describe('deep order book', () => {
  const live: Depth = {
    symbol: 'BTCUSDT',
    bids: [
      ['100.00', '1'],
      ['99.50', '2'],
    ],
    asks: [
      ['100.10', '1'],
      ['100.20', '1'],
    ],
    status: 'LIVE',
    updatedAt: null,
  };
  const snap: BookSnapshot = {
    // overlaps the live range (stale copies of live levels) and extends beyond it
    bids: [
      ['100.00', '9'],
      ['99.50', '9'],
      ['99.40', '3'],
      ['98.00', '4'],
    ],
    asks: [
      ['100.10', '9'],
      ['100.30', '5'],
      ['101.00', '6'],
    ],
  };

  it('keeps live levels on top and appends only snapshot levels beyond them', () => {
    const d = mergeDeepDepth(live, snap, 10);
    expect(d.bids).toEqual([
      ['100.00', '1'],
      ['99.50', '2'],
      ['99.40', '3'],
      ['98.00', '4'],
    ]);
    expect(d.asks).toEqual([
      ['100.10', '1'],
      ['100.20', '1'],
      ['100.30', '5'],
      ['101.00', '6'],
    ]);
    expect(mergeDeepDepth(live, snap, 3).bids).toHaveLength(3);
  });

  it('adds nothing to a side with no live levels (feed down → no data shown)', () => {
    const d = mergeDeepDepth({ ...live, bids: [], asks: [], status: 'UNAVAILABLE' }, snap, 10);
    expect(d.bids).toEqual([]);
    expect(d.asks).toEqual([]);
  });

  it('snapshots are cached, shared between concurrent requests, and stay within the weight budget', async () => {
    let t = 0;
    const calls: number[] = [];
    const s = new DepthSnapshots(async (_sym, limit) => {
      calls.push(limit);
      return snap;
    }, () => t);
    await Promise.all([s.get('BTCUSDT', 50), s.get('BTCUSDT', 80)]);
    expect(calls).toEqual([100]); // one fetch for two concurrent requests
    t = 500;
    await s.get('BTCUSDT', 100);
    expect(calls).toEqual([100]); // within 1 s TTL
    t = 1500;
    await s.get('BTCUSDT', 100);
    expect(calls).toEqual([100, 100]);
    // 10 weight used so far; 500-level books weigh 25 → (1200 - 10) / 25 = 47 more within the minute
    t = 2000;
    const got = await Promise.all(Array.from({ length: 60 }, (_, i) => s.get(`C${i}USDT`, 500)));
    expect(calls.filter((c) => c === 500)).toHaveLength(47);
    expect(got.filter((g) => g === null)).toHaveLength(13); // over budget and nothing cached: no data
    t = 2000 + 3001;
    expect(await s.get('C0USDT', 500)).toBe(snap); // over budget but cached: the stale copy
    expect(calls.filter((c) => c === 500)).toHaveLength(47);
    t = 2000 + 61_000; // the minute has passed
    await s.get('C59USDT', 500);
    expect(calls.filter((c) => c === 500)).toHaveLength(48);
  });

  it('without a source there is no snapshot', async () => {
    expect(await new DepthSnapshots(null).get('BTCUSDT', 500)).toBeNull();
  });
});

describe('Binance stream plan', () => {
  it('splits 50 symbols over connections of at most 300 streams, never splitting a symbol', () => {
    const symbols = Array.from({ length: 50 }, (_, i) => `C${i}USDT`);
    const groups = planConnections(symbols);
    expect(groups.flat()).toEqual(symbols);
    for (const g of groups) expect(g.flatMap(streamsFor).length).toBeLessThanOrEqual(300);
    expect(groups).toHaveLength(2);
    expect(streamsFor('BTCUSDT')).toContain('btcusdt@depth20@100ms');
  });
});

// ───────────────────────────── API

const h = new ApiHarness();
const deepBook: BookSnapshot = {
  bids: Array.from({ length: 100 }, (_, i) => [(99 - i * 0.5).toFixed(2), '1.00000'] as [string, string]),
  asks: Array.from({ length: 100 }, (_, i) => [(100 + i * 0.5).toFixed(2), '1.00000'] as [string, string]),
};

beforeAll(async () => {
  await h.start({ depthFetcher: async () => deepBook });
});
afterAll(async () => {
  await h.stop();
});
beforeEach(() => {
  h.env.clock.ms = Date.now();
  setBook(h.env, 'BTCUSDT', [['99.00', '1.00000'], ['98.50', '2.00000']], [['100.00', '0.50000'], ['100.50', '1.00000']]);
});

describe('market data for the v2 UI', () => {
  it('exchangeInfo lists coin info for every asset of the listed pairs', async () => {
    const info = await h.browser().exchangeInfo();
    expect(info.assets.map((a) => a.asset)).toEqual(['BTC', 'USDT', 'ETH']);
    expect(info.assets[0]).toMatchObject({ asset: 'BTC', name: 'Bitcoin', tags: ['LAYER1', 'PAYMENTS'] });
    expect(info.assets[1]!.tags).toEqual(['STABLECOIN']);
  });

  it('depth: ≤ 20 levels is the live book; deeper adds the snapshot tail below the live levels', async () => {
    const b = h.browser();
    expect((await b.depth({ params: { symbol: 'BTCUSDT' } })).bids).toHaveLength(2);
    const deep = await b.depth({ params: { symbol: 'BTCUSDT' }, query: { limit: 50 } });
    expect(deep.status).toBe('LIVE');
    expect(deep.bids.slice(0, 3)).toEqual([
      ['99.00', '1.00000'],
      ['98.50', '2.00000'],
      ['98.00', '1.00000'],
    ]);
    expect(deep.bids).toHaveLength(50);
    expect(deep.asks[2]).toEqual(['101.00', '1.00000']);
    await expectApiError(b.depth({ params: { symbol: 'BTCUSDT' }, query: { limit: 501 } }), 'VALIDATION_ERROR');
  });

  it('sparklines come from candles; a pair without any is UNAVAILABLE (never invented)', async () => {
    const hour = 3600_000;
    const start = Math.floor(Date.now() / hour) * hour - 30 * hour;
    await h.env.database.db.insert(candles).values(
      Array.from({ length: 30 }, (_, i) => ({
        symbol: 'BTCUSDT',
        interval: '1h' as const,
        openTime: new Date(start + i * hour),
        closeTime: new Date(start + (i + 1) * hour - 1),
        open: '100',
        high: '110',
        low: '90',
        close: String(100 + i),
        volume: '1',
        quoteVolume: '100',
        tradeCount: 1,
      })),
    );
    const s = await h.browser().sparklines();
    expect(s.interval).toBe('1h');
    const btc = s.items.find((x) => x.symbol === 'BTCUSDT')!;
    expect(btc.points).toHaveLength(25);
    expect(btc.points.at(-1)).toBe('129');
    expect(btc.status).toBe('LIVE');
    expect(s.items.find((x) => x.symbol === 'ETHUSDT')).toEqual({ symbol: 'ETHUSDT', points: [], status: 'UNAVAILABLE' });
  });
});

describe('coin info (admin)', () => {
  it('admin edits tags with a reason (audited); support cannot; unknown coin is 404', async () => {
    const admin = await h.staff('admin');
    const support = await h.staff('support');
    await expectApiError(support.b.adminUpdateAsset({ params: { asset: 'BTC' }, body: { tags: ['LAYER1'], reason: 'gọn nhóm ngành' } }), 'FORBIDDEN');
    const btc = await admin.b.adminUpdateAsset({ params: { asset: 'BTC' }, body: { tags: ['LAYER1', 'LAYER1'], reason: 'gọn nhóm ngành' } });
    expect(btc).toEqual({ asset: 'BTC', name: 'Bitcoin', tags: ['LAYER1'], description: expect.any(String) });
    expect((await h.browser().exchangeInfo()).assets[0]!.tags).toEqual(['LAYER1']);
    const [row] = await h.env.database.db.select().from(auditLogs).where(and(eq(auditLogs.action, 'ASSET_UPDATE'), eq(auditLogs.targetId, 'BTC')));
    expect(row).toMatchObject({ targetType: 'ASSET', reason: 'gọn nhóm ngành', before: { tags: ['LAYER1', 'PAYMENTS'] }, after: { tags: ['LAYER1'] } });
    await expectApiError(admin.b.adminUpdateAsset({ params: { asset: 'ZZZ' }, body: { name: 'Zed', reason: 'thử coin lạ' } }), 'NOT_FOUND');
  });
});

describe('announcements', () => {
  it('drafts, publishing, pinning, hiding and expiry; staff permissions; audit trail', async () => {
    const admin = await h.staff('admin');
    const support = await h.staff('support');
    const pub = h.browser();
    await expectApiError(support.b.adminCreateAnnouncement({ body: { title: 'Tin', body: 'Nội dung' } }), 'FORBIDDEN');

    const draft = await admin.b.adminCreateAnnouncement({ body: { title: 'Bảo trì tối nay', body: 'Dừng 5 phút.\nLệnh giữ nguyên.', level: 'MAINTENANCE', publish: false } });
    expect(draft).toMatchObject({ publishedAt: null, hidden: false, createdBy: { email: admin.email } });
    const news = await admin.b.adminCreateAnnouncement({ body: { title: 'Thêm cặp mới', body: 'Có 50 cặp.' } });
    await admin.b.adminCreateAnnouncement({ body: { title: 'Đã hết hạn', body: 'x', expiresAt: new Date(Date.now() - 60_000).toISOString() } });
    expect((await pub.announcements()).items.map((a) => a.title)).toEqual(['Thêm cặp mới']);

    await admin.b.adminUpdateAnnouncement({ params: { announcementId: draft.id }, body: { published: true, pinned: true } });
    const list = (await pub.announcements()).items;
    expect(list.map((a) => a.id)).toEqual([draft.id, news.id]);
    expect(list[0]!.body).toBe('Dừng 5 phút.\nLệnh giữ nguyên.');

    await admin.b.adminUpdateAnnouncement({ params: { announcementId: news.id }, body: { hidden: true } });
    expect((await pub.announcements()).items.map((a) => a.id)).toEqual([draft.id]);
    expect((await support.b.adminListAnnouncements()).items.some((a) => a.id === news.id)).toBe(false);
    expect((await support.b.adminListAnnouncements({ query: { includeHidden: 'true' } })).items.some((a) => a.id === news.id)).toBe(true);
    await expectApiError(admin.b.adminUpdateAnnouncement({ params: { announcementId: '999999' }, body: { pinned: true } }), 'NOT_FOUND');

    const rows = await h.env.database.db.select().from(auditLogs).where(eq(auditLogs.targetType, 'ANNOUNCEMENT'));
    expect(rows.filter((r) => r.action === 'ANNOUNCEMENT_CREATE')).toHaveLength(3);
    const hide = rows.find((r) => r.action === 'ANNOUNCEMENT_UPDATE' && r.targetId === news.id)!;
    expect(hide).toMatchObject({ before: { hidden: false }, after: { hidden: true } });
  });
});

describe('realtime exchange:status', () => {
  it('snapshot on subscribe, then one event per real change (halt, pair disabled) — not for unrelated settings', async () => {
    const admin = await h.staff('admin');
    const ws = new WebSocket(h.base.replace('http', 'ws') + '/ws');
    const events: ExchangeStatus[] = [];
    ws.on('message', (d) => {
      const m = JSON.parse(String(d)) as ServerMessage;
      if (m.type === 'event' && m.channel === 'exchange:status') events.push(m.data as ExchangeStatus);
    });
    await new Promise((r) => ws.once('open', r));
    ws.send(JSON.stringify({ type: 'subscribe', channel: 'exchange:status' }));
    const settle = () => new Promise((r) => setTimeout(r, 150));
    await settle();
    expect(events).toEqual([{ tradingHalted: false, disabledSymbols: [], updatedAt: expect.any(String) }]);

    await admin.b.adminUpdateSettings({ body: { feeRate: '0.002', reason: 'thử mức phí mới' } });
    await settle();
    expect(events).toHaveLength(1);

    await admin.b.adminHaltTrading({ body: { reason: 'sự cố dữ liệu giá', confirm: 'HALT' } });
    await settle();
    expect(events.at(-1)).toMatchObject({ tradingHalted: true, disabledSymbols: [] });

    await admin.b.adminUpdateSymbol({ params: { symbol: 'ETHUSDT' }, body: { enabled: false, cancelOpenOrders: false, reason: 'tạm ngưng cặp' } });
    await settle();
    expect(events.at(-1)).toMatchObject({ tradingHalted: true, disabledSymbols: ['ETHUSDT'] });
    expect(events).toHaveLength(3);

    await admin.b.adminResumeTrading({ body: { reason: 'đã khắc phục xong', confirm: 'RESUME' } });
    await admin.b.adminUpdateSymbol({ params: { symbol: 'ETHUSDT' }, body: { enabled: true, cancelOpenOrders: false, reason: 'mở lại cặp' } });
    await admin.b.adminUpdateSettings({ body: { feeRate: '0.001', reason: 'trả lại mức phí' } });
    await settle();
    ws.close();
    expect(events.at(-1)).toMatchObject({ tradingHalted: false, disabledSymbols: [] });
  });
});
