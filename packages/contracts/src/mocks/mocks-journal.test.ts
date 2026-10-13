import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { ApiError, createApiClient, JOURNAL_LIMITS, journalAttachmentUrl } from '../index.ts';
import { FIXTURE_PNG_BASE64, FIXTURE_WEBP_BASE64, fixtureJournalStats, J, JA } from '../fixtures/journal.ts';
import { createMockHandlers, mockStore, resetMockStore, setMockRole, setMockScenario } from './index.ts';

const BASE = 'http://mock.local';
const server = setupServer(...createMockHandlers({ baseUrl: BASE, latencyMs: 0 }));
const api = createApiClient({ baseUrl: BASE, validateResponses: true });
const code = (c: string) => (e: unknown) => e instanceof ApiError && e.code === c;
const reason = (r: string) => (e: unknown) => e instanceof ApiError && e.code === 'CONFLICT' && e.details?.reason === r;
const status = (s: number) => (e: unknown) => e instanceof ApiError && e.status === s;
const tooLarge = (r: string) => (e: unknown) => e instanceof ApiError && e.status === 413 && e.code === 'PAYLOAD_TOO_LARGE' && e.details?.reason === r;
const unsupported = (e: unknown) => e instanceof ApiError && e.status === 415 && e.code === 'UNSUPPORTED_MEDIA_TYPE';

const marketBuy = async (symbol: string, quantity: string) => (await api.placeOrder({ body: { symbol, side: 'BUY', type: 'MARKET', quantity } })).order.id;
const marketSell = async (symbol: string, quantity: string) => (await api.placeOrder({ body: { symbol, side: 'SELL', type: 'MARKET', quantity } })).order.id;
const autoOff = () => api.journalUpdateSettings({ body: { autoJournal: false } });
const toBase64 = (b: Uint8Array) => Buffer.from(b).toString('base64');

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  resetMockStore();
  setMockRole('user', false);
});
afterAll(() => server.close());

describe('journal mock: entries', () => {
  it('lists only my entries (newest opened first) with filters and pages; someone else’s entry is 404', async () => {
    const all = await api.journalList();
    expect(all.items).toHaveLength(11);
    expect(all.items.some((e) => e.id === J(99))).toBe(false);
    expect(all.items[0]!.id).toBe(J(4));
    expect((await api.journalList({ query: { status: 'OPEN' } })).items.map((e) => e.id).sort()).toEqual([J(4), J(8)]);
    expect((await api.journalList({ query: { excluded: 'true' } })).items.map((e) => e.id).sort()).toEqual([J(10), J(11)]);
    expect((await api.journalList({ query: { market: 'FUTURES' } })).items).toHaveLength(4);
    expect((await api.journalList({ query: { setup: 'Pullback' } })).items).toHaveLength(4);
    expect((await api.journalList({ query: { tag: 'trend' } })).items).toHaveLength(3);
    expect((await api.journalList({ query: { origin: 'MANUAL' } })).items.map((e) => e.id)).toEqual([J(5)]);
    const p1 = await api.journalList({ query: { limit: 5 } });
    expect(p1.items).toHaveLength(5);
    const p2 = await api.journalList({ query: { limit: 5, cursor: p1.nextCursor! } });
    expect(p2.items[0]!.id).not.toBe(p1.items[4]!.id);
    await expect(api.journalGet({ params: { entryId: J(99) } })).rejects.toSatisfy(code('NOT_FOUND'));
    await expect(api.journalGet({ params: { entryId: 'not-a-uuid' } })).rejects.toSatisfy(code('VALIDATION_ERROR'));
    const flipClose = await api.journalGet({ params: { entryId: J(7) } });
    const flipOpen = await api.journalGet({ params: { entryId: J(8) } });
    expect(flipClose.fills.find((f) => f.leg === 'CLOSE')!.tradeId).toBe(flipOpen.fills[0]!.tradeId);
    expect(flipOpen.fills[0]!.leg).toBe('OPEN');
  });

  it('statistics: basis ACTUAL_FILLS, VOID and needsReview counted apart — same numbers as computeJournalStats', async () => {
    const s = await api.journalStats({ query: { range: 'all' } });
    const { to: _t, ...rest } = s;
    const { to: _ft, ...expected } = fixtureJournalStats;
    expect(rest).toEqual(expected);
    expect(s.excluded).toEqual({ void: 1, needsReview: 1 });
    const futures = await api.journalStats({ query: { range: 'all', market: 'FUTURES' } });
    expect(futures.summary.count).toBe(3);
    expect(futures.excluded).toEqual({ void: 0, needsReview: 0 });
    expect((await api.journalSetups()).setups[0]).toEqual({ name: 'Pullback', count: 4 });
  });

  it('empty account: no entries, statistics all null (never 0)', async () => {
    setMockScenario('empty');
    expect((await api.journalList()).items).toEqual([]);
    const s = await api.journalStats({ query: { range: 'all' } });
    expect(s.summary).toMatchObject({ count: 0, winRate: null, expectancyR: null, totalNetPnl: null, maxDrawdownR: null, rCurve: [], pnlCurve: [] });
    expect(await api.journalSetups()).toEqual({ setups: [], tags: [] });
  });

  it('signed out → 401', async () => {
    setMockScenario('signedOut');
    await expect(api.journalList()).rejects.toSatisfy(code('UNAUTHENTICATED'));
  });

  it('annotate: notes, setup, tags, mistakes, score, plan; strict body; AUTO entries cannot be deleted', async () => {
    const e = await api.journalUpdate({
      params: { entryId: J(4) },
      body: { setup: 'Breakout', tags: ['btc'], notes: 'Vào theo xu hướng\nchờ phá 82k', mistakes: ['LATE_ENTRY'], executionScore: 4, plan: { target: '84000' } },
    });
    expect(e).toMatchObject({ setup: 'Breakout', tags: ['btc'], mistakes: ['LATE_ENTRY'], executionScore: 4, plan: { entry: null, stop: null, target: '84000' } });
    expect((await api.journalUpdate({ params: { entryId: J(4) }, body: { setup: null } })).setup).toBeNull();
    await expect(api.journalUpdate({ params: { entryId: J(4) }, body: { notes: 'x'.repeat(JOURNAL_LIMITS.notes + 1) } })).rejects.toSatisfy(code('VALIDATION_ERROR'));
    await expect(api.journalUpdate({ params: { entryId: J(4) }, body: { notes: 'x', netPnl: '999' } as never })).rejects.toSatisfy(code('VALIDATION_ERROR'));
    await expect(api.journalUpdate({ params: { entryId: J(99) }, body: { notes: 'x' } })).rejects.toSatisfy(code('NOT_FOUND'));
    await expect(api.journalDelete({ params: { entryId: J(1) } })).rejects.toSatisfy(reason('AUTO_ENTRY_NOT_DELETABLE'));
    await expect(api.journalDelete({ params: { entryId: J(99) } })).rejects.toSatisfy(code('NOT_FOUND'));
    expect(await api.journalDelete({ params: { entryId: J(5) } })).toEqual({ ok: true });
    await expect(api.journalGet({ params: { entryId: J(5) } })).rejects.toSatisfy(code('NOT_FOUND'));
  });

  it('initial stop: locked after the first reducing fill, refused on the wrong side, recomputes risk', async () => {
    await expect(api.journalUpdate({ params: { entryId: J(1) }, body: { initialStop: '2300' } })).rejects.toSatisfy(reason('STOP_LOCKED'));
    // moving the plan stop is always allowed and does not change R
    const moved = await api.journalUpdate({ params: { entryId: J(1) }, body: { plan: { stop: '2300' } } });
    expect(moved.result.rMultiple).toBe('1.91604200');
    // J4: LONG BTC, average entry 79552.98…
    await expect(api.journalUpdate({ params: { entryId: J(4) }, body: { initialStop: '80000' } })).rejects.toSatisfy(reason('STOP_WRONG_SIDE'));
    const j4 = await api.journalUpdate({ params: { entryId: J(4) }, body: { initialStop: '77000' } });
    expect(j4.initialStop).toBe('77000');
    expect(j4.result.riskUsdt).toBe('41.07750000'); // 1280.0075 − 77000 × 0.01609
    expect((await api.journalUpdate({ params: { entryId: J(4) }, body: { initialStop: null } })).result.riskUsdt).toBeNull();
    // J8: SHORT SOL at 114
    await expect(api.journalUpdate({ params: { entryId: J(8) }, body: { initialStop: '110' } })).rejects.toSatisfy(reason('STOP_WRONG_SIDE'));
    await expect(api.journalUpdate({ params: { entryId: J(8) }, body: { initialStop: '114' } })).rejects.toSatisfy(reason('STOP_WRONG_SIDE')); // equal = no risk
    expect((await api.journalUpdate({ params: { entryId: J(8) }, body: { initialStop: '120' } })).result.riskUsdt).toBe('30.00000000');
  });
});

describe('journal mock: auto-journal window and MANUAL entries', () => {
  it('auto-journal on by default: a spot buy opens an AUTO entry, selling it all closes it with a computed result', async () => {
    expect(await api.journalSettings()).toEqual({ autoJournal: true, autoSince: mockStore.journal.featureStartedAt });
    await marketBuy('ETHUSDT', '0.1');
    const open = (await api.journalList({ query: { symbol: 'ETHUSDT', status: 'OPEN' } })).items;
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ origin: 'AUTO', market: 'SPOT', openQty: '0.09990000', result: { entryQty: '0.10000000', avgEntryPrice: '2500', netPnl: null } });
    await marketSell('ETHUSDT', '0.0999');
    const closed = await api.journalGet({ params: { entryId: open[0]!.id } });
    expect(closed).toMatchObject({ status: 'CLOSED', closeReason: 'FILLS', initialStopLocked: true, openQty: '0.00000000', exitQty: '0.09990000' });
    // bought 0.1 @ 2500 = 250 (fee 0.0001 ETH → 0.0999 net), sold 0.0999 @ 2500 = 249.75 (fee 0.24975) → 249.50025 − 250 = −0.49975
    expect(closed.result).toMatchObject({ netPnl: '-0.49975000', outcome: 'LOSS', rMultiple: null, fees: '0.49975000' });
    expect(closed.fills.map((f) => f.leg)).toEqual(['SPOT', 'SPOT']);
  });

  it('off: fills stay free (no entry), a MANUAL entry can take them; on again opens a new window, no back-fill', async () => {
    const before = (await api.journalList()).items.length;
    expect(await autoOff()).toEqual({ autoJournal: false, autoSince: null });
    await expect(api.journalUpdateSettings({ body: { autoJournal: true, autoSince: '2026-01-01T00:00:00.000Z' } as never })).rejects.toSatisfy(code('VALIDATION_ERROR'));
    const buy = await marketBuy('SOLUSDT', '2');
    expect((await api.journalList()).items).toHaveLength(before);
    const on = await api.journalUpdateSettings({ body: { autoJournal: true } });
    expect(on.autoJournal).toBe(true);
    expect(Date.parse(on.autoSince!)).toBeGreaterThan(Date.parse(mockStore.journal.featureStartedAt));
    expect((await api.journalList()).items).toHaveLength(before); // the fill made while off is not back-filled
    const manual = await api.journalCreate({ body: { orderIds: [buy] } });
    expect(manual).toMatchObject({ origin: 'MANUAL', status: 'OPEN', symbol: 'SOLUSDT', fillCount: 1 });
    await expect(api.journalCreate({ body: { orderIds: [buy] } })).rejects.toSatisfy(reason('FILL_ALREADY_JOURNALED'));
    // deleting the MANUAL entry frees its fills again
    await api.journalDelete({ params: { entryId: manual.id } });
    expect((await api.journalCreate({ body: { orderIds: [buy] } })).origin).toBe('MANUAL');
  });

  it('MANUAL from orders: 404 / BOT_ORDER / ORDER_NOT_FILLED / SYMBOL_MISMATCH / FILL_ALREADY_JOURNALED / NO_OPENING_FILL / MULTIPLE_ROUND_TRIPS', async () => {
    await autoOff();
    await expect(api.journalCreate({ body: { orderIds: ['999999'] } })).rejects.toSatisfy(code('NOT_FOUND'));
    const bot = await api.createGridBot({ body: { symbol: 'BTCUSDT', lowerPrice: '76000', upperPrice: '84000', gridCount: 8, investment: '1000' } });
    const botOrder = (await api.gridBotOrders({ params: { botId: bot.id } })).items[0]!;
    await expect(api.journalCreate({ body: { orderIds: [botOrder.id] } })).rejects.toSatisfy(reason('BOT_ORDER'));
    await expect(api.journalCreate({ body: { orderIds: ['103'] } })).rejects.toSatisfy(reason('ORDER_NOT_FILLED'));
    await expect(api.journalCreate({ body: { orderIds: ['100'] } })).rejects.toSatisfy(reason('FILL_ALREADY_JOURNALED')); // trade 500 is in J4
    const eth = await marketBuy('ETHUSDT', '0.01');
    const sol = await marketBuy('SOLUSDT', '1');
    await expect(api.journalCreate({ body: { orderIds: [eth, sol] } })).rejects.toSatisfy(reason('SYMBOL_MISMATCH'));
    const sellOnly = await marketSell('BTCUSDT', '0.001'); // coins held before: nothing opens an entry
    await expect(api.journalCreate({ body: { orderIds: [sellOnly] } })).rejects.toSatisfy(reason('NO_OPENING_FILL'));
    const sellAll = await marketSell('ETHUSDT', '0.00999');
    const buyAgain = await marketBuy('ETHUSDT', '0.01');
    await expect(api.journalCreate({ body: { orderIds: [eth, sellAll, buyAgain] } })).rejects.toSatisfy(reason('MULTIPLE_ROUND_TRIPS'));
    // one round trip is fine and closes the entry
    const done = await api.journalCreate({ body: { orderIds: [sellAll, eth] } });
    expect(done).toMatchObject({ origin: 'MANUAL', status: 'CLOSED', fillCount: 2 });
    expect(done.result.netPnl).not.toBeNull();
  });

  it('addOrderIds: only an OPEN MANUAL spot entry; the entry is rebuilt and closes', async () => {
    await autoOff();
    const buy = await marketBuy('BNBUSDT', '1');
    const e = await api.journalCreate({ body: { orderIds: [buy] } });
    await expect(api.journalUpdate({ params: { entryId: J(4) }, body: { addOrderIds: [buy] } })).rejects.toSatisfy(reason('ENTRY_NOT_EXTENDABLE'));
    await expect(api.journalUpdate({ params: { entryId: J(5) }, body: { addOrderIds: [buy] } })).rejects.toSatisfy(reason('ENTRY_NOT_EXTENDABLE'));
    await expect(api.journalUpdate({ params: { entryId: J(8) }, body: { addOrderIds: [buy] } })).rejects.toSatisfy(reason('MARKET_MISMATCH'));
    await expect(api.journalUpdate({ params: { entryId: e.id }, body: { addOrderIds: [buy] } })).rejects.toSatisfy(reason('FILL_ALREADY_JOURNALED'));
    const other = await marketBuy('ETHUSDT', '0.01');
    await expect(api.journalUpdate({ params: { entryId: e.id }, body: { addOrderIds: [other], notes: 'x' } })).rejects.toSatisfy(reason('SYMBOL_MISMATCH'));
    expect((await api.journalGet({ params: { entryId: e.id } })).notes).toBe(''); // nothing changed
    const sell = await marketSell('BNBUSDT', '0.999');
    const closed = await api.journalUpdate({ params: { entryId: e.id }, body: { addOrderIds: [sell], notes: 'chốt' } });
    expect(closed).toMatchObject({ status: 'CLOSED', fillCount: 2, notes: 'chốt', initialStopLocked: true });
    await expect(api.journalCreate({ body: { orderIds: [sell] } })).rejects.toSatisfy(reason('FILL_ALREADY_JOURNALED'));
  });

  it('futures: one entry per position; a flip puts its CLOSE leg in the old entry and its OPEN leg in a new one', async () => {
    await api.futuresPlaceOrder({ body: { symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: '0.100' } });
    const long = (await api.journalList({ query: { market: 'FUTURES', symbol: 'ETHUSDT', status: 'OPEN' } })).items;
    expect(long).toHaveLength(1);
    expect(long[0]).toMatchObject({ origin: 'AUTO', direction: 'LONG', result: { entryQty: '0.10000000', legsConsistent: true } });
    await api.futuresPlaceOrder({ body: { symbol: 'ETHUSDT', side: 'SELL', type: 'MARKET', quantity: '0.150' } });
    const old = await api.journalGet({ params: { entryId: long[0]!.id } });
    expect(old).toMatchObject({ status: 'CLOSED', closeReason: 'FILLS', exitQty: '0.10000000' });
    expect(old.result.netPnl).not.toBeNull();
    const short = (await api.journalList({ query: { market: 'FUTURES', symbol: 'ETHUSDT', status: 'OPEN' } })).items;
    expect(short).toHaveLength(1);
    expect(short[0]!.direction).toBe('SHORT');
    const shortDetail = await api.journalGet({ params: { entryId: short[0]!.id } });
    const closeLeg = old.fills.find((f) => f.leg === 'CLOSE')!;
    const openLeg = shortDetail.fills[0]!;
    expect(openLeg).toMatchObject({ leg: 'OPEN', tradeId: closeLeg.tradeId, allocatedQty: '0.05000000' });
    expect(Number(closeLeg.allocatedFee) + Number(openLeg.allocatedFee)).toBeCloseTo(Number(closeLeg.fee), 8);
    await api.futuresClosePosition({ params: { symbol: 'ETHUSDT' }, body: {} });
    expect((await api.journalGet({ params: { entryId: short[0]!.id } })).status).toBe('CLOSED');
  });

  it('MANUAL from a futures position: 404, legacy fills → LEGACY_FUTURES_FILL, already journaled → 409', async () => {
    await expect(api.journalCreate({ body: { futuresPositionId: '999999' } })).rejects.toSatisfy(code('NOT_FOUND'));
    await expect(api.journalCreate({ body: { futuresPositionId: '501' } })).rejects.toSatisfy(reason('LEGACY_FUTURES_FILL'));
    await autoOff();
    await api.futuresPlaceOrder({ body: { symbol: 'BNBUSDT', side: 'BUY', type: 'MARKET', quantity: '1.00' } });
    const pos = (await api.futuresPositions()).items.find((p) => p.symbol === 'BNBUSDT')!;
    const e = await api.journalCreate({ body: { futuresPositionId: pos.id } });
    expect(e).toMatchObject({ origin: 'MANUAL', market: 'FUTURES', futuresPositionId: pos.id, fillCount: 1, result: { entryQty: '1.00000000' } });
    await expect(api.journalCreate({ body: { futuresPositionId: pos.id } })).rejects.toSatisfy(reason('FILL_ALREADY_JOURNALED'));
  });
});

describe('journal mock: images', () => {
  it('upload PNG/WebP/JPEG (201), read the bytes by URL, delete; anyone else’s → 404', async () => {
    const a = await api.journalUploadAttachment({ params: { entryId: J(4) }, body: { contentType: 'image/png', dataBase64: FIXTURE_PNG_BASE64 } });
    expect(a).toMatchObject({ entryId: J(4), contentType: 'image/png', bytes: 70, sha256: '497790947d4666760ce38f3c00e852c71fdb66cae849bae8e9ede352719e1581' });
    const res = await fetch(BASE + journalAttachmentUrl(a.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(toBase64(new Uint8Array(await res.arrayBuffer()))).toBe(FIXTURE_PNG_BASE64);
    expect((await api.journalGet({ params: { entryId: J(4) } })).attachmentCount).toBe(1);
    expect((await api.journalUploadAttachment({ params: { entryId: J(4) }, body: { contentType: 'image/webp', dataBase64: FIXTURE_WEBP_BASE64 } })).bytes).toBe(34);
    const jpeg = toBase64(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]));
    expect((await api.journalUploadAttachment({ params: { entryId: J(4) }, body: { contentType: 'image/jpeg', dataBase64: jpeg } })).contentType).toBe('image/jpeg');
    expect(await api.journalDeleteAttachment({ params: { attachmentId: a.id } })).toEqual({ ok: true });
    expect((await fetch(BASE + journalAttachmentUrl(a.id))).status).toBe(404);
    expect((await fetch(BASE + journalAttachmentUrl(JA(99)))).status).toBe(404);
    expect((await fetch(BASE + journalAttachmentUrl(JA(1)))).status).toBe(200);
    await expect(api.journalDeleteAttachment({ params: { attachmentId: JA(99) } })).rejects.toSatisfy(code('NOT_FOUND'));
    await expect(api.journalUploadAttachment({ params: { entryId: J(99) }, body: { contentType: 'image/png', dataBase64: FIXTURE_PNG_BASE64 } })).rejects.toSatisfy(code('NOT_FOUND'));
  });

  it('415 for a renamed file or SVG/GIF, 413 above 1 MB or over the 50 MB quota, 409 for the 5th image', async () => {
    await expect(api.journalUploadAttachment({ params: { entryId: J(4) }, body: { contentType: 'image/jpeg', dataBase64: FIXTURE_PNG_BASE64 } })).rejects.toSatisfy(unsupported);
    await expect(api.journalUploadAttachment({ params: { entryId: J(4) }, body: { contentType: 'image/svg+xml', dataBase64: toBase64(new TextEncoder().encode('<svg/>')) } })).rejects.toSatisfy(unsupported);
    await expect(api.journalUploadAttachment({ params: { entryId: J(4) }, body: { contentType: 'image/gif', dataBase64: toBase64(new TextEncoder().encode('GIF89a')) } })).rejects.toSatisfy(unsupported);
    const big = new Uint8Array(JOURNAL_LIMITS.attachmentBytes + 1);
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await expect(api.journalUploadAttachment({ params: { entryId: J(4) }, body: { contentType: 'image/png', dataBase64: toBase64(big) } })).rejects.toSatisfy(tooLarge('ATTACHMENT_TOO_LARGE'));
    for (let i = 0; i < JOURNAL_LIMITS.attachmentsPerEntry; i++) await api.journalUploadAttachment({ params: { entryId: J(2) }, body: { contentType: 'image/png', dataBase64: FIXTURE_PNG_BASE64 } });
    await expect(api.journalUploadAttachment({ params: { entryId: J(2) }, body: { contentType: 'image/png', dataBase64: FIXTURE_PNG_BASE64 } })).rejects.toSatisfy(reason('TOO_MANY_ATTACHMENTS'));
    mockStore.journal.otherImageBytes = JOURNAL_LIMITS.userQuotaBytes - 100;
    await expect(api.journalUploadAttachment({ params: { entryId: J(3) }, body: { contentType: 'image/png', dataBase64: FIXTURE_PNG_BASE64 } })).rejects.toSatisfy(tooLarge('ATTACHMENT_QUOTA'));
    await expect(api.journalUploadAttachment({ params: { entryId: J(3) }, body: { contentType: 'image/png', dataBase64: 'data:image/png;base64,AAAA' } })).rejects.toSatisfy(status(400));
  });
});
