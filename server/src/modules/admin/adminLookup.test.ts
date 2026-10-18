import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { ApiError, AUDIT_EXPORT_COLUMNS, hasPermission, USERS_EXPORT_COLUMNS, csvTextCell } from '@cex/contracts';
import { sessions } from '../../db/schema.ts';
import { marketTrade, setBook, setFuturesBook, setMark } from '../../../test/helpers.ts';
import { ApiHarness, type Browser } from '../../../test/apiHarness.ts';

/** Batch AD1: order / fill lookup across users, a customer's sessions, CSV exports of audit log and users. */
const h = new ApiHarness();
const err = (code: string, status?: number) => (e: unknown) => e instanceof ApiError && e.code === code && (status === undefined || e.status === status);

beforeAll(async () => {
  await h.start();
});
afterAll(async () => {
  await h.stop();
});
beforeEach(() => {
  h.env.clock.ms = Date.now();
  setBook(h.env, 'BTCUSDT', [['99.00', '100.00000']], [['100.00', '100.00000']]);
  setBook(h.env, 'ETHUSDT', [['9.00', '100.00000']], [['10.00', '100.00000']]);
  marketTrade(h.env, 'BTCUSDT', '99.50');
  setFuturesBook(h.env, 'BTCUSDT', [['80000.0', '1.000']], [['80010.0', '1.000']]);
  setMark(h.env, 'BTCUSDT', '80000');
});

interface Person {
  b: Browser;
  id: string;
  uid: string;
  email: string;
  password: string;
}

/** A funded user with: one filled Spot BUY, two open Spot LIMIT BUYs (BTC and ETH), one filled Futures market order. */
async function trader(): Promise<Person & { filledSpotOrder: string; openOrders: string[]; futuresOrder: string }> {
  const u = await h.user();
  const me = await u.b.me();
  await u.b.faucetClaim();
  await u.b.futuresTransfer({ body: { direction: 'SPOT_TO_FUTURES', amount: '500' } });
  const filled = await u.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.5' } });
  const o1 = await u.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '1', price: '50' } });
  const o2 = await u.b.placeOrder({ body: { symbol: 'ETHUSDT', side: 'BUY', type: 'LIMIT', quantity: '1', price: '5' } });
  const f = await u.b.futuresPlaceOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.002' } });
  return { ...u, uid: me.uid, filledSpotOrder: filled.order.id, openOrders: [o1.order.id, o2.order.id], futuresOrder: f.id };
}

async function pageAll<T extends { id: string }>(fetchPage: (cursor?: string) => Promise<{ items: T[]; nextCursor: string | null }>): Promise<{ ids: string[]; pages: number }> {
  const ids: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const p = await fetchPage(cursor);
    ids.push(...p.items.map((i) => i.id));
    cursor = p.nextCursor ?? undefined;
    pages++;
  } while (cursor && pages < 50);
  return { ids, pages };
}

describe('adminSearchOrders', () => {
  it('filters by market, status, symbol, side, ids, user (uuid and UID) and time; A and B never mix', async () => {
    const support = await h.staff('support');
    const a = await trader();
    const b = await trader();

    // market is required
    await expect(support.b.adminSearchOrders({ query: {} as never })).rejects.toSatisfy(err('VALIDATION_ERROR', 400));

    const spotA = await support.b.adminSearchOrders({ query: { market: 'SPOT', user: a.id } });
    expect(spotA.items.map((o) => o.id).sort()).toEqual([a.filledSpotOrder, ...a.openOrders].sort());
    expect(new Set(spotA.items.map((o) => o.userId))).toEqual(new Set([a.id]));
    expect(spotA.items[0]).toMatchObject({ market: 'SPOT', uid: a.uid, email: a.email, source: 'USER', leverage: null });
    // newest first
    expect(spotA.items.map((o) => Number(o.id))).toEqual([...spotA.items.map((o) => Number(o.id))].sort((x, y) => y - x));

    // by UID: same rows; by B: a different set
    const byUid = await support.b.adminSearchOrders({ query: { market: 'SPOT', user: a.uid } });
    expect(byUid.items.map((o) => o.id)).toEqual(spotA.items.map((o) => o.id));
    const spotB = await support.b.adminSearchOrders({ query: { market: 'SPOT', user: b.uid } });
    expect(new Set(spotB.items.map((o) => o.userId))).toEqual(new Set([b.id]));
    expect(spotB.items.map((o) => o.id).filter((id) => spotA.items.some((x) => x.id === id))).toEqual([]);

    // without a user filter both are visible
    const all = await support.b.adminSearchOrders({ query: { market: 'SPOT' } });
    expect([all.items.some((o) => o.userId === a.id), all.items.some((o) => o.userId === b.id)]).toEqual([true, true]);

    // status
    const open = await support.b.adminSearchOrders({ query: { market: 'SPOT', user: a.id, status: 'open' } });
    expect(open.items.map((o) => o.id).sort()).toEqual([...a.openOrders].sort());
    const closed = await support.b.adminSearchOrders({ query: { market: 'SPOT', user: a.id, status: 'closed' } });
    expect(closed.items.map((o) => [o.id, o.status])).toEqual([[a.filledSpotOrder, 'FILLED']]);

    // symbol, side, orderId, clientOrderId
    expect((await support.b.adminSearchOrders({ query: { market: 'SPOT', user: a.id, symbol: 'ETHUSDT' } })).items.map((o) => o.id)).toEqual([a.openOrders[1]]);
    expect((await support.b.adminSearchOrders({ query: { market: 'SPOT', user: a.id, side: 'SELL' } })).items).toEqual([]);
    const one = await support.b.adminSearchOrders({ query: { market: 'SPOT', orderId: a.openOrders[0]! } });
    expect(one.items.map((o) => o.id)).toEqual([a.openOrders[0]]);
    const cid = one.items[0]!.clientOrderId;
    expect((await support.b.adminSearchOrders({ query: { market: 'SPOT', clientOrderId: cid, user: a.id } })).items.map((o) => o.id)).toEqual([a.openOrders[0]]);

    // time range: a window in the past is empty, a window around now has the rows
    const now = Date.now();
    expect((await support.b.adminSearchOrders({ query: { market: 'SPOT', user: a.id, to: new Date(now - 3_600_000).toISOString() } })).items).toEqual([]);
    expect((await support.b.adminSearchOrders({ query: { market: 'SPOT', user: a.id, from: new Date(now - 3_600_000).toISOString(), to: new Date(now + 3_600_000).toISOString() } })).items).toHaveLength(3);
    expect((await support.b.adminSearchOrders({ query: { market: 'SPOT', user: a.id, from: new Date(now + 3_600_000).toISOString() } })).items).toEqual([]);

    // futures
    const fut = await support.b.adminSearchOrders({ query: { market: 'FUTURES', user: a.uid } });
    expect(fut.items.map((o) => o.id)).toEqual([a.futuresOrder]);
    expect(fut.items[0]).toMatchObject({ market: 'FUTURES', source: null, sourceId: null, leverage: expect.any(Number), userId: a.id, uid: a.uid, status: 'FILLED' });
    expect((await support.b.adminSearchOrders({ query: { market: 'FUTURES', user: b.id, status: 'open' } })).items).toEqual([]);
  });

  it('refusals: bad user reference 400, unknown user 404, bad cursor 400, anonymous 401, plain user 403; bot orders carry their source', async () => {
    const support = await h.staff('support');
    const a = await trader();
    await expect(support.b.adminSearchOrders({ query: { market: 'SPOT', user: 'not-a-user' } })).rejects.toSatisfy(err('VALIDATION_ERROR', 400));
    await expect(support.b.adminSearchOrders({ query: { market: 'SPOT', user: '99999999' } })).rejects.toSatisfy(err('NOT_FOUND', 404));
    await expect(support.b.adminSearchOrders({ query: { market: 'SPOT', user: '00000000-0000-4000-8000-000000000999' } })).rejects.toSatisfy(err('NOT_FOUND', 404));
    await expect(support.b.adminSearchOrders({ query: { market: 'SPOT', cursor: 'abc' } })).rejects.toSatisfy(err('VALIDATION_ERROR', 400));
    await expect(h.browser().adminSearchOrders({ query: { market: 'SPOT' } })).rejects.toSatisfy(err('UNAUTHENTICATED', 401));
    await expect(a.b.adminSearchOrders({ query: { market: 'SPOT' } })).rejects.toSatisfy(err('FORBIDDEN', 403));

    // a DCA / grid order shows its source
    await a.b.createGridBot({ body: { symbol: 'BTCUSDT', lowerPrice: '90', upperPrice: '110', gridCount: 4, mode: 'ARITHMETIC', investment: '1000' } });
    const grid = await support.b.adminSearchOrders({ query: { market: 'SPOT', user: a.id, status: 'open' } });
    expect(grid.items.some((o) => o.source === 'GRID' && o.sourceId !== null)).toBe(true);
  });

  it('cursor pages cover every row once: no duplicates, no gaps', async () => {
    const support = await h.staff('support');
    const a = await trader();
    for (let i = 0; i < 4; i++) await a.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.2', price: String(40 + i) } });
    const full = await support.b.adminSearchOrders({ query: { market: 'SPOT', user: a.id, limit: 200 } });
    expect(full.items).toHaveLength(7);
    expect(full.nextCursor).toBeNull();
    const { ids, pages } = await pageAll((cursor) => support.b.adminSearchOrders({ query: { market: 'SPOT', user: a.id, limit: 2, cursor } }));
    expect(pages).toBe(4);
    expect(ids).toEqual(full.items.map((o) => o.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('adminSearchTrades', () => {
  it('filters, isolation, Spot tax/Futures fields and cursor completeness', async () => {
    const support = await h.staff('support');
    const a = await trader();
    const b = await trader();
    await expect(support.b.adminSearchTrades({ query: {} as never })).rejects.toSatisfy(err('VALIDATION_ERROR', 400));

    const spotA = await support.b.adminSearchTrades({ query: { market: 'SPOT', user: a.id } });
    expect(spotA.items).toHaveLength(1);
    expect(spotA.items[0]).toMatchObject({ market: 'SPOT', orderId: a.filledSpotOrder, userId: a.id, uid: a.uid, email: a.email, symbol: 'BTCUSDT', side: 'BUY', quantity: '0.50000000', price: '100.00000000', liquidity: 'TAKER', tax: '0.00000000', realizedPnl: null });
    expect(spotA.items[0]!.quoteQty).toBe('50.00000000');

    expect((await support.b.adminSearchTrades({ query: { market: 'SPOT', user: a.uid } })).items.map((t) => t.id)).toEqual(spotA.items.map((t) => t.id));
    const spotB = await support.b.adminSearchTrades({ query: { market: 'SPOT', user: b.id } });
    expect(spotB.items.map((t) => t.userId)).toEqual([b.id]);
    expect(spotB.items[0]!.id).not.toBe(spotA.items[0]!.id);
    const everyone = new Set((await support.b.adminSearchTrades({ query: { market: 'SPOT', limit: 200 } })).items.map((t) => t.userId));
    expect([everyone.has(a.id), everyone.has(b.id)]).toEqual([true, true]);

    // symbol / side / orderId / time
    expect((await support.b.adminSearchTrades({ query: { market: 'SPOT', user: a.id, symbol: 'ETHUSDT' } })).items).toEqual([]);
    expect((await support.b.adminSearchTrades({ query: { market: 'SPOT', user: a.id, side: 'SELL' } })).items).toEqual([]);
    expect((await support.b.adminSearchTrades({ query: { market: 'SPOT', orderId: a.filledSpotOrder } })).items.map((t) => t.userId)).toEqual([a.id]);
    expect((await support.b.adminSearchTrades({ query: { market: 'SPOT', user: a.id, to: new Date(Date.now() - 3_600_000).toISOString() } })).items).toEqual([]);
    expect((await support.b.adminSearchTrades({ query: { market: 'SPOT', user: a.id, from: new Date(Date.now() - 3_600_000).toISOString() } })).items).toHaveLength(1);

    // futures: tax is null, realizedPnl is a number string, fee in USDT
    const fut = await support.b.adminSearchTrades({ query: { market: 'FUTURES', user: a.uid } });
    expect(fut.items).toHaveLength(1);
    expect(fut.items[0]).toMatchObject({ market: 'FUTURES', orderId: a.futuresOrder, userId: a.id, tax: null, feeAsset: 'USDT', side: 'BUY', quantity: '0.002' });
    expect((await support.b.adminSearchTrades({ query: { market: 'FUTURES', user: a.id, symbol: 'ETHUSDT' } })).items).toEqual([]);

    // cursor completeness over several fills
    for (let i = 0; i < 4; i++) await a.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.1' } });
    const full = await support.b.adminSearchTrades({ query: { market: 'SPOT', user: a.id, limit: 200 } });
    expect(full.items).toHaveLength(5);
    const { ids } = await pageAll((cursor) => support.b.adminSearchTrades({ query: { market: 'SPOT', user: a.id, limit: 2, cursor } }));
    expect(ids).toEqual(full.items.map((t) => t.id));
    expect(new Set(ids).size).toBe(5);

    await expect(support.b.adminSearchTrades({ query: { market: 'SPOT', user: '99999999' } })).rejects.toSatisfy(err('NOT_FOUND', 404));
    await expect(a.b.adminSearchTrades({ query: { market: 'SPOT' } })).rejects.toSatisfy(err('FORBIDDEN', 403));
  });
});

describe('adminUserSessions', () => {
  it('lists only live sessions of that user, with no token material', async () => {
    const support = await h.staff('support');
    const a = await h.user();
    const b = await h.user();
    // A signs in on a second device, then one session is revoked in the database
    const second = h.browser();
    await second.login({ body: { email: a.email, password: a.password } });
    const secondCookie = second.cookie();
    const live = await support.b.adminUserSessions({ params: { userId: a.id } });
    expect(live.items.length).toBeGreaterThanOrEqual(2);
    for (const s of live.items) expect(Object.keys(s).sort()).toEqual(['createdAt', 'expiresAt', 'id', 'ip', 'lastSeenAt', 'mfaVerified', 'userAgent']);

    const rows = await h.env.database.db.select().from(sessions).where(eq(sessions.userId, a.id));
    const raw = JSON.stringify(live);
    for (const r of rows) {
      expect(raw).not.toContain(r.tokenHash);
      expect(raw).not.toContain(r.tokenHash.slice(0, 16));
    }
    expect(raw).not.toContain(secondCookie.replace('cex_session=', ''));
    expect(raw.toLowerCase()).not.toContain('token');

    await h.env.database.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, live.items[0]!.id));
    const after = await support.b.adminUserSessions({ params: { userId: a.id } });
    expect(after.items.map((s) => s.id)).not.toContain(live.items[0]!.id);
    expect(after.items).toHaveLength(live.items.length - 1);

    // an expired session is not listed either
    await h.env.database.db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.id, after.items[0]!.id));
    expect((await support.b.adminUserSessions({ params: { userId: a.id } })).items).toHaveLength(after.items.length - 1);

    // B's sessions never show up under A
    const bSessions = await support.b.adminUserSessions({ params: { userId: b.id } });
    const aIds = new Set((await support.b.adminUserSessions({ params: { userId: a.id } })).items.map((s) => s.id));
    expect(bSessions.items.some((s) => aIds.has(s.id))).toBe(false);

    await expect(support.b.adminUserSessions({ params: { userId: '00000000-0000-4000-8000-000000000999' } })).rejects.toSatisfy(err('NOT_FOUND', 404));
    await expect(b.b.adminUserSessions({ params: { userId: a.id } })).rejects.toSatisfy(err('FORBIDDEN', 403));
    await expect(h.browser().adminUserSessions({ params: { userId: b.id } })).rejects.toSatisfy(err('UNAUTHENTICATED', 401));
  });
});

describe('CSV exports', () => {
  it('permission matrix: users.export is ADMIN and owner only', () => {
    expect(['support', 'admin', 'owner', 'user'].map((r) => hasPermission(r as 'user', 'users.export'))).toEqual([false, true, true, false]);
  });

  it('adminUsersExport: support 403, admin gets the fixed header and filtered rows, formula cells are neutralised', async () => {
    const support = await h.staff('support');
    const admin = await h.staff('admin');
    const evil = await h.user();
    // a name that spreadsheets would execute as a formula
    await evil.b.updateProfile({ body: { name: '=HYPERLINK("http://evil.example","x")' } });
    await expect(support.b.adminUsersExport({ query: {} })).rejects.toSatisfy(err('FORBIDDEN', 403));
    await expect(evil.b.adminUsersExport({ query: {} })).rejects.toSatisfy(err('FORBIDDEN', 403));
    await expect(h.browser().adminUsersExport({ query: {} })).rejects.toSatisfy(err('UNAUTHENTICATED', 401));

    const csv = await admin.b.adminUsersExport({ query: {} });
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe(USERS_EXPORT_COLUMNS.join(','));
    // injection: the cell begins with an apostrophe, never with '=' (the quoted cell starts with `"'=`)
    const row = lines.find((l) => l.includes(evil.email))!;
    expect(row).toContain(`"'=HYPERLINK(""http://evil.example"",""x"")"`);
    expect(csv).not.toMatch(/(^|,)"?=HYPERLINK/m);

    // filters behave like adminListUsers
    const me = await evil.b.me();
    const one = (await admin.b.adminUsersExport({ query: { q: me.uid } })).slice(1).trim().split('\r\n');
    expect(one).toHaveLength(2);
    expect(one[1]!.startsWith(`${me.uid},${evil.id},`)).toBe(true);
    const staffOnly = (await admin.b.adminUsersExport({ query: { role: 'support' } })).slice(1).trim().split('\r\n');
    expect(staffOnly.slice(1).every((l) => l.split(',')[4] === 'support')).toBe(true);
    expect(staffOnly.length).toBeGreaterThanOrEqual(2);
  });

  it('adminAuditExport: needs audit.read (support 403), fixed header, same filters, injection cells neutralised', async () => {
    const support = await h.staff('support');
    const admin = await h.staff('admin');
    const target = await h.user();
    await admin.b.adminLockUser({ params: { userId: target.id }, body: { reason: '=cmd|calc reason' } });
    await admin.b.adminUnlockUser({ params: { userId: target.id }, body: { reason: 'unlock again after review' } });

    await expect(support.b.adminAuditExport({ query: {} })).rejects.toSatisfy(err('FORBIDDEN', 403));
    await expect(h.browser().adminAuditExport({ query: {} })).rejects.toSatisfy(err('UNAUTHENTICATED', 401));

    const csv = await admin.b.adminAuditExport({ query: { targetId: target.id } });
    const lines = csv.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe(AUDIT_EXPORT_COLUMNS.join(','));
    expect(lines).toHaveLength(3); // header + lock + unlock, newest first
    expect(lines[1]).toContain('USER_UNLOCK');
    expect(lines[2]).toContain('USER_LOCK');
    expect(lines[2]).toContain(`'=cmd|calc reason`);
    expect(csv).not.toMatch(/,=cmd/);

    // filters narrow the export exactly like the list
    const byAction = (await admin.b.adminAuditExport({ query: { action: 'USER_LOCK', targetId: target.id } })).slice(1).trim().split('\r\n');
    expect(byAction).toHaveLength(2);
    const list = await admin.b.adminAuditLogs({ query: { targetId: target.id } });
    expect(list.items).toHaveLength(2);
    expect((await admin.b.adminAuditExport({ query: { targetId: target.id, to: new Date(Date.now() - 3_600_000).toISOString() } })).slice(1).trim().split('\r\n')).toHaveLength(1);
  });

  it('csvTextCell only touches text that a spreadsheet would read as a formula', () => {
    expect(['=1+1', '+1', '-1', '@SUM', '\tx', 'plain', '', null].map(csvTextCell)).toEqual(["'=1+1", "'+1", "'-1", "'@SUM", "'\tx", 'plain', '', null]);
  });
});
