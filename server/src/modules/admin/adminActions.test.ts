import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import WebSocket from 'ws';
import { ApiError, WS_SESSION_ENDED } from '@cex/contracts';
import { auditLogs, futuresOrders, gridBots, ledgerEntries, orderLists, orders, sessions } from '../../db/schema.ts';
import { reconcile } from '../exchange/reconciliation.ts';
import { balanceOf, futuresBalance, marketTrade, setBook, setFuturesBook, setMark } from '../../../test/helpers.ts';
import { ApiHarness } from '../../../test/apiHarness.ts';

/** AD3: admin cancels a user's orders, revokes sessions, adjusts the FUTURES wallet - every change audited in its own transaction. */
const h = new ApiHarness();
const db = () => h.env.database.db;

async function expectApiError(p: Promise<unknown>, code: string, status?: number) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof ApiError && e.code === code && (status === undefined || e.status === status));
}
const booksBalanced = async () => expect((await reconcile(db(), false)).mismatches).toEqual([]);
const auditRows = (action: string, targetId: string) => db().select().from(auditLogs).where(and(eq(auditLogs.action, action as 'ORDER_CANCEL'), eq(auditLogs.targetId, targetId)));
const auditCount = async () => (await db().select({ n: sql<number>`count(*)::int` }).from(auditLogs))[0]!.n;
const orderRow = async (id: string) => (await db().select().from(orders).where(eq(orders.id, Number(id))))[0]!;
const futuresOrderRow = async (id: string) => (await db().select().from(futuresOrders).where(eq(futuresOrders.id, Number(id))))[0]!;
const REASON = 'Khách nhờ hỗ trợ hủy lệnh';

beforeAll(async () => {
  await h.start();
});
afterAll(async () => {
  await h.stop();
});
beforeEach(() => {
  h.env.clock.ms = Date.now();
  setBook(h.env, 'BTCUSDT', [['99.00', '100.00000']], [['100.00', '100.00000']]);
  marketTrade(h.env, 'BTCUSDT', '99.50');
  setFuturesBook(h.env, 'BTCUSDT', [['80000.0', '10.000']], [['80010.0', '10.000']]);
  setMark(h.env, 'BTCUSDT', '80000');
});

type User = Awaited<ReturnType<typeof h.user>>;

async function funded(): Promise<User> {
  const u = await h.user();
  await u.b.faucetClaim();
  return u;
}
const limitBuy = (u: { b: User['b'] }, price = '90', quantity = '0.1') => u.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity, price } });

describe('adminCancelUserOrder (Spot)', () => {
  it('cancels with closeReason ADMIN, frees the lock, writes the audit row in the same transaction; refusals leave no trace', async () => {
    const admin = await h.staff('admin');
    const support = await h.staff('support');
    const u = await funded();
    const other = await funded();
    const placed = (await limitBuy(u)).order;
    expect(await balanceOf(h.env, u.id, 'USDT')).toEqual({ available: '9991', locked: '9' });

    // support may look but not act; a reason is required; another user's id on this user's path is a 404
    await expectApiError(support.b.adminCancelUserOrder({ params: { userId: u.id, orderId: placed.id }, body: { market: 'SPOT', reason: REASON } }), 'FORBIDDEN', 403);
    await expectApiError(admin.b.adminCancelUserOrder({ params: { userId: u.id, orderId: placed.id }, body: { market: 'SPOT', reason: 'x' } }), 'VALIDATION_ERROR', 400);
    const theirs = (await limitBuy(other)).order;
    await expectApiError(admin.b.adminCancelUserOrder({ params: { userId: u.id, orderId: theirs.id }, body: { market: 'SPOT', reason: REASON } }), 'NOT_FOUND', 404);
    await expectApiError(admin.b.adminCancelUserOrder({ params: { userId: u.id, orderId: '999999999' }, body: { market: 'SPOT', reason: REASON } }), 'NOT_FOUND', 404);
    // the same id looked up in the Futures book is a different (missing) order
    await expectApiError(admin.b.adminCancelUserOrder({ params: { userId: u.id, orderId: placed.id }, body: { market: 'FUTURES', reason: REASON } }), 'NOT_FOUND', 404);
    expect((await orderRow(placed.id)).status).toBe('NEW');
    const before = await auditCount();

    const r = await admin.b.adminCancelUserOrder({ params: { userId: u.id, orderId: placed.id }, body: { market: 'SPOT', reason: REASON } });
    expect(r).toMatchObject({ market: 'SPOT', orderId: placed.id, canceledOrderIds: [placed.id], stoppedBotId: null });
    const row = await orderRow(placed.id);
    expect([row.status, row.closeReason, row.lockedAmount]).toEqual(['CANCELED', 'ADMIN', '0.000000000000000000']);
    expect(await balanceOf(h.env, u.id, 'USDT')).toEqual({ available: '10000', locked: '0' });
    expect(await auditCount()).toBe(before + 1);
    const [log] = await auditRows('ORDER_CANCEL', u.id);
    expect(log).toMatchObject({ id: Number(r.auditLogId), actorId: admin.id, reason: REASON, after: { status: 'CANCELED', closeReason: 'ADMIN', canceledOrderIds: [placed.id], stoppedBotId: null } });
    expect(log!.before).toMatchObject({ market: 'SPOT', orderId: placed.id, symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.10000000', price: '90.00000000', executedQty: '0.00000000' });
    // the funds came back through the ledger (ORDER_UNLOCK), the user sees the order as canceled by the admin
    const unlock = await db().select().from(ledgerEntries).where(and(eq(ledgerEntries.userId, u.id), eq(ledgerEntries.type, 'ORDER_UNLOCK')));
    expect(unlock).toHaveLength(1);
    expect((await u.b.orderHistory({ query: {} })).items.find((o) => o.id === placed.id)).toMatchObject({ status: 'CANCELED', closeReason: 'ADMIN' });

    // canceled already → ORDER_NOT_CANCELABLE and no second audit row
    await expectApiError(admin.b.adminCancelUserOrder({ params: { userId: u.id, orderId: placed.id }, body: { market: 'SPOT', reason: REASON } }), 'ORDER_NOT_CANCELABLE', 409);
    expect(await auditCount()).toBe(before + 1);
    await booksBalanced();
  });

  it('no action on an equal or higher role, on yourself, or on the bot account', async () => {
    const admin = await h.staff('admin');
    const owner = await h.staff('owner');
    // staff accounts can hold orders too (their wallet is a normal wallet)
    await owner.b.faucetClaim();
    const o = (await limitBuy(owner)).order;
    await expectApiError(admin.b.adminCancelUserOrder({ params: { userId: owner.id, orderId: o.id }, body: { market: 'SPOT', reason: REASON } }), 'FORBIDDEN', 403);
    await expectApiError(admin.b.adminCancelUserOrders({ params: { userId: owner.id }, body: { reason: REASON } }), 'FORBIDDEN', 403);
    await expectApiError(admin.b.adminCancelUserOrders({ params: { userId: admin.id }, body: { reason: REASON } }), 'FORBIDDEN', 403);
    expect((await orderRow(o.id)).status).toBe('NEW');
    // the owner may act on an admin
    await admin.b.faucetClaim();
    const mine = (await limitBuy(admin)).order;
    expect((await owner.b.adminCancelUserOrder({ params: { userId: admin.id, orderId: mine.id }, body: { market: 'SPOT', reason: REASON } })).canceledOrderIds).toEqual([mine.id]);
    await booksBalanced();
  });

  it('race: admin cancel vs fill - exactly one wins, the audit row exists iff the cancel won, books balanced', async () => {
    const admin = await h.staff('admin');
    const u = await funded();
    let cancelWins = 0;
    let fillWins = 0;
    for (let i = 0; i < 20; i++) {
      const placed = (await limitBuy(u)).order;
      const before = await auditCount();
      const [c, f] = await Promise.allSettled([
        admin.b.adminCancelUserOrder({ params: { userId: u.id, orderId: placed.id }, body: { market: 'SPOT', reason: REASON } }),
        h.env.ex.orders.fillResting(Number(placed.id), h.env.clock.date()),
      ]);
      const canceled = c.status === 'fulfilled';
      const filled = f.status === 'fulfilled' && f.value !== null;
      expect(canceled !== filled).toBe(true);
      if (!canceled) expect((c as PromiseRejectedResult).reason).toSatisfy((e: unknown) => e instanceof ApiError && e.code === 'ORDER_NOT_CANCELABLE');
      const row = await orderRow(placed.id);
      expect([row.status, row.closeReason]).toEqual(canceled ? ['CANCELED', 'ADMIN'] : ['FILLED', null]);
      expect(row.lockedAmount).toBe('0.000000000000000000');
      expect(await auditCount()).toBe(before + (canceled ? 1 : 0)); // the losing cancel wrote nothing
      if (canceled) cancelWins++;
      else fillWins++;
    }
    expect(cancelWins + fillWins).toBe(20);
    expect((await balanceOf(h.env, u.id, 'USDT')).locked).toBe('0');
    await booksBalanced();
  });

  it('a step that fails after the cancel rolls the whole cancel back: no unlock, no status change, no event', async () => {
    const u = await funded();
    const placed = (await limitBuy(u)).order;
    const seen: string[] = [];
    const listener = (_id: string, o: { id: number; status: string }) => seen.push(`${o.id}:${o.status}`);
    h.env.ex.events.on('order', listener);
    await expect(
      h.env.ex.orders.cancelOrder(u.id, placed.id, 'ADMIN', async () => {
        throw new Error('audit insert failed');
      }),
    ).rejects.toThrow('audit insert failed');
    h.env.ex.events.off('order', listener);
    expect(seen).toEqual([]);
    const row = await orderRow(placed.id);
    expect([row.status, row.closeReason]).toEqual(['NEW', null]);
    expect(await balanceOf(h.env, u.id, 'USDT')).toEqual({ available: '9991', locked: '9' });
    expect(await db().select().from(ledgerEntries).where(and(eq(ledgerEntries.userId, u.id), eq(ledgerEntries.type, 'ORDER_UNLOCK')))).toHaveLength(0);
    await booksBalanced();
    // and the order is still cancelable afterwards
    await h.env.ex.orders.cancelOrder(u.id, placed.id, 'ADMIN', async () => undefined);
    expect((await orderRow(placed.id)).status).toBe('CANCELED');
    await booksBalanced();
  });

  it('OCO: canceling either leg cancels the whole list (closeReason ADMIN), frees the one lock, one audit row', async () => {
    const admin = await h.staff('admin');
    const u = await funded();
    await u.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.5' } });
    const list = await u.b.placeOco({ body: { symbol: 'BTCUSDT', side: 'SELL', quantity: '0.4', price: '110', stopPrice: '95' } });
    const ids = list.orders.map((o) => o.id).sort();
    expect((await balanceOf(h.env, u.id, 'BTC')).locked).toBe('0.4');
    const stopLeg = list.orders.find((o) => o.type === 'STOP_MARKET')!;
    const before = await auditCount();

    const r = await admin.b.adminCancelUserOrder({ params: { userId: u.id, orderId: stopLeg.id }, body: { market: 'SPOT', reason: REASON } });
    expect([...r.canceledOrderIds].sort()).toEqual(ids);
    for (const id of ids) expect([(await orderRow(id)).status, (await orderRow(id)).closeReason]).toEqual(['CANCELED', 'ADMIN']);
    const [l] = await db().select().from(orderLists).where(eq(orderLists.id, Number(list.id)));
    expect(l!.listStatus).toBe('ALL_DONE');
    expect((await balanceOf(h.env, u.id, 'BTC')).locked).toBe('0');
    expect(await auditCount()).toBe(before + 1);
    expect((await auditRows('ORDER_CANCEL', u.id))[0]!.after).toMatchObject({ canceledOrderIds: expect.arrayContaining(ids) });
    // the list is done: canceling the other leg is refused and writes nothing
    const limitLeg = list.orders.find((o) => o.type === 'LIMIT')!;
    await expectApiError(admin.b.adminCancelUserOrder({ params: { userId: u.id, orderId: limitLeg.id }, body: { market: 'SPOT', reason: REASON } }), 'ORDER_NOT_CANCELABLE');
    expect(await auditCount()).toBe(before + 1);
    await booksBalanced();
  });

  it("a grid bot's order: the bot is STOPPED (ADMIN) in the same transaction, its other orders are canceled, nothing is re-placed", async () => {
    const admin = await h.staff('admin');
    const u = await funded();
    const bot = await u.b.createGridBot({ body: { symbol: 'BTCUSDT', lowerPrice: '90', upperPrice: '110', gridCount: 4, mode: 'ARITHMETIC', investment: '1000' } });
    await h.env.bots.grid.idle();
    const botOrders = (await u.b.gridBotOrders({ params: { botId: bot.id } })).items.filter((o) => o.status === 'NEW');
    expect(botOrders.length).toBeGreaterThan(1);
    // the user cannot cancel it (invariant 19) ...
    await expectApiError(u.b.cancelOrder({ params: { orderId: botOrders[0]!.id } }), 'ORDER_NOT_CANCELABLE');
    const before = await auditCount();

    // ... the admin can, and the bot stops with it
    const r = await admin.b.adminCancelUserOrder({ params: { userId: u.id, orderId: botOrders[0]!.id }, body: { market: 'SPOT', reason: REASON } });
    expect(r).toMatchObject({ orderId: botOrders[0]!.id, canceledOrderIds: [botOrders[0]!.id], stoppedBotId: bot.id });
    await h.env.bots.grid.idle();
    const [b] = await db().select().from(gridBots).where(eq(gridBots.id, Number(bot.id)));
    expect([b!.status, b!.stopReason]).toEqual(['STOPPED', 'ADMIN']);
    expect([(await orderRow(botOrders[0]!.id)).closeReason]).toEqual(['ADMIN']);
    for (const o of botOrders.slice(1)) expect((await orderRow(o.id)).closeReason).toBe('BOT_STOPPED');
    // no orphan: no open order of this bot, nothing locked, and a sweep places nothing new
    await h.env.bots.grid.sweep();
    await h.env.bots.grid.idle();
    expect(await db().select().from(orders).where(and(eq(orders.source, 'GRID'), eq(orders.sourceId, Number(bot.id)), inArray(orders.status, ['NEW', 'PARTIALLY_FILLED'])))).toHaveLength(0);
    expect((await balanceOf(h.env, u.id, 'USDT')).locked).toBe('0');
    expect(await auditCount()).toBe(before + 1);
    expect((await auditRows('ORDER_CANCEL', u.id))[0]!.after).toMatchObject({ stoppedBotId: bot.id });
    await booksBalanced();
  });
});

describe('adminCancelUserOrder (Futures)', () => {
  it('a resting limit order: margin and fee come back, closeReason ADMIN, audit in the same transaction', async () => {
    const admin = await h.staff('admin');
    const support = await h.staff('support');
    const u = await funded();
    await u.b.futuresTransfer({ body: { direction: 'SPOT_TO_FUTURES', amount: '1000' } });
    const o = await u.b.futuresPlaceOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', price: '70000.0', quantity: '0.01' } });
    const held = await futuresBalance(h.env, u.id);
    expect(Number(held.locked)).toBeGreaterThan(0);
    expect(held.available).not.toBe('1000.000000000000000000');
    const before = await auditCount();

    await expectApiError(support.b.adminCancelUserOrder({ params: { userId: u.id, orderId: o.id }, body: { market: 'FUTURES', reason: REASON } }), 'FORBIDDEN');
    // Spot lookup of a Futures order id is a 404 (separate id sequences / books)
    await expectApiError(admin.b.adminCancelUserOrder({ params: { userId: u.id, orderId: o.id }, body: { market: 'SPOT', reason: REASON } }), 'NOT_FOUND');
    const r = await admin.b.adminCancelUserOrder({ params: { userId: u.id, orderId: o.id }, body: { market: 'FUTURES', reason: REASON } });
    expect(r).toMatchObject({ market: 'FUTURES', orderId: o.id, canceledOrderIds: [o.id], stoppedBotId: null });
    const row = await futuresOrderRow(o.id);
    expect([row.status, row.closeReason, row.marginLocked, row.feeLocked]).toEqual(['CANCELED', 'ADMIN', '0.000000000000000000', '0.000000000000000000']);
    expect(await futuresBalance(h.env, u.id)).toEqual({ available: '1000.000000000000000000', locked: '0.000000000000000000' });
    expect(await auditCount()).toBe(before + 1);
    expect((await auditRows('ORDER_CANCEL', u.id))[0]).toMatchObject({ id: Number(r.auditLogId), after: { closeReason: 'ADMIN' } });
    await expectApiError(admin.b.adminCancelUserOrder({ params: { userId: u.id, orderId: o.id }, body: { market: 'FUTURES', reason: REASON } }), 'ORDER_NOT_CANCELABLE');
    expect(await auditCount()).toBe(before + 1);
    await booksBalanced();

    // a failing step rolls the futures cancel back as well
    const o2 = await u.b.futuresPlaceOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', price: '70000.0', quantity: '0.01' } });
    const lockedWhileOpen = await futuresBalance(h.env, u.id);
    await expect(
      h.env.futures.service.cancelOrder(u.id, o2.id, 'ADMIN', async () => {
        throw new Error('audit insert failed');
      }),
    ).rejects.toThrow('audit insert failed');
    expect((await futuresOrderRow(o2.id)).status).toBe('NEW');
    expect(await futuresBalance(h.env, u.id)).toEqual(lockedWhileOpen);
    await booksBalanced();
  });
});

describe('adminCancelUserOrders (cancel all)', () => {
  it('both books at once: counts, one audit row per book, OCO as a whole, symbol filter, nothing open → zero and no audit', async () => {
    const admin = await h.staff('admin');
    const u = await funded();
    await u.b.futuresTransfer({ body: { direction: 'SPOT_TO_FUTURES', amount: '1000' } });
    await u.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.5' } });
    const a = (await limitBuy(u, '90')).order;
    const b = (await limitBuy(u, '91')).order;
    const list = await u.b.placeOco({ body: { symbol: 'BTCUSDT', side: 'SELL', quantity: '0.4', price: '110', stopPrice: '95' } });
    const f = await u.b.futuresPlaceOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', price: '70000.0', quantity: '0.01' } });
    const before = await auditCount();

    // a symbol with no open order → zero, no audit
    const none = await admin.b.adminCancelUserOrders({ params: { userId: u.id }, body: { symbol: 'ETHUSDT', reason: REASON } });
    expect(none).toEqual({ spotCanceled: 0, futuresCanceled: 0, stoppedBotIds: [], auditLogIds: [] });
    expect(await auditCount()).toBe(before);

    // Futures only first
    const fut = await admin.b.adminCancelUserOrders({ params: { userId: u.id }, body: { market: 'FUTURES', reason: REASON } });
    expect([fut.spotCanceled, fut.futuresCanceled, fut.auditLogIds.length]).toEqual([0, 1, 1]);
    expect((await futuresOrderRow(f.id)).closeReason).toBe('ADMIN');
    expect((await orderRow(a.id)).status).toBe('NEW');

    const all = await admin.b.adminCancelUserOrders({ params: { userId: u.id }, body: { reason: REASON } });
    expect([all.spotCanceled, all.futuresCanceled, all.stoppedBotIds, all.auditLogIds.length]).toEqual([4, 0, [], 1]); // a, b and both OCO legs
    for (const id of [a.id, b.id, ...list.orders.map((o) => o.id)]) expect([(await orderRow(id)).status, (await orderRow(id)).closeReason]).toEqual(['CANCELED', 'ADMIN']);
    expect(await auditCount()).toBe(before + 2);
    const rows = await auditRows('ORDER_CANCEL', u.id);
    expect(rows.map((r) => r.reason)).toEqual([REASON, REASON]);
    expect(await balanceOf(h.env, u.id, 'USDT')).toMatchObject({ locked: '0' });
    expect((await balanceOf(h.env, u.id, 'BTC')).locked).toBe('0');
    expect(await futuresBalance(h.env, u.id)).toEqual({ available: '1000.000000000000000000', locked: '0.000000000000000000' });
    await booksBalanced();
  });

  it("includes a grid bot's orders: the bot stops, nothing is left open for it", async () => {
    const admin = await h.staff('admin');
    const u = await funded();
    const bot = await u.b.createGridBot({ body: { symbol: 'BTCUSDT', lowerPrice: '90', upperPrice: '110', gridCount: 4, mode: 'ARITHMETIC', investment: '1000' } });
    await h.env.bots.grid.idle();
    const mine = (await limitBuy(u, '80')).order;
    const r = await admin.b.adminCancelUserOrders({ params: { userId: u.id }, body: { market: 'SPOT', symbol: 'BTCUSDT', reason: REASON } });
    expect(r.stoppedBotIds).toEqual([bot.id]);
    expect(r.spotCanceled).toBeGreaterThan(1);
    await h.env.bots.grid.idle();
    const [b] = await db().select().from(gridBots).where(eq(gridBots.id, Number(bot.id)));
    expect([b!.status, b!.stopReason]).toEqual(['STOPPED', 'ADMIN']);
    expect((await orderRow(mine.id)).closeReason).toBe('ADMIN');
    await h.env.bots.grid.sweep();
    await h.env.bots.grid.idle();
    expect(await db().select().from(orders).where(and(eq(orders.userId, u.id), inArray(orders.status, ['NEW', 'PARTIALLY_FILLED'])))).toHaveLength(0);
    expect((await balanceOf(h.env, u.id, 'USDT')).locked).toBe('0');
    await booksBalanced();
  });

  it('race: cancel-all vs fills, user cancels and new orders - no deadlock, every order ends terminal, books balanced', async () => {
    const admin = await h.staff('admin');
    for (let round = 0; round < 6; round++) {
      const u = await funded();
      const placed: string[] = [];
      for (const p of ['90', '91', '92', '93', '94', '95']) placed.push((await limitBuy(u, p)).order.id);
      await u.b.futuresTransfer({ body: { direction: 'SPOT_TO_FUTURES', amount: '1000' } });
      await u.b.futuresPlaceOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', price: '70000.0', quantity: '0.01' } });
      const results = await Promise.allSettled([
        admin.b.adminCancelUserOrders({ params: { userId: u.id }, body: { reason: REASON } }),
        h.env.ex.orders.fillResting(Number(placed[1]), h.env.clock.date()),
        h.env.ex.orders.fillResting(Number(placed[4]), h.env.clock.date()),
        u.b.cancelOrder({ params: { orderId: placed[2]! } }),
        limitBuy(u, '85'),
      ]);
      for (const r of results) {
        if (r.status === 'rejected') expect(r.reason).toSatisfy((e: unknown) => e instanceof ApiError && (e.code === 'ORDER_NOT_CANCELABLE' || e.code === 'NOT_FOUND'));
      }
      // whatever the interleaving: the orders that existed are all terminal (the one placed concurrently may have survived)
      for (const id of placed) expect(['CANCELED', 'FILLED']).toContain((await orderRow(id)).status);
      await h.env.futures.engine.drain();
      await booksBalanced();
    }
  });

  it('a failing step rolls back every cancel of the batch (both books)', async () => {
    const u = await funded();
    await u.b.futuresTransfer({ body: { direction: 'SPOT_TO_FUTURES', amount: '1000' } });
    const a = (await limitBuy(u, '90')).order;
    const b = (await limitBuy(u, '91')).order;
    const f = await u.b.futuresPlaceOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', price: '70000.0', quantity: '0.01' } });
    const spotBefore = await balanceOf(h.env, u.id, 'USDT');
    const futBefore = await futuresBalance(h.env, u.id);
    const boom = async () => {
      throw new Error('audit insert failed');
    };
    await expect(h.env.ex.orders.cancelAllAtomic(u.id, undefined, 'ADMIN', boom)).rejects.toThrow('audit insert failed');
    await expect(h.env.futures.service.cancelAllAtomic(u.id, undefined, 'ADMIN', boom)).rejects.toThrow('audit insert failed');
    expect([(await orderRow(a.id)).status, (await orderRow(b.id)).status, (await futuresOrderRow(f.id)).status]).toEqual(['NEW', 'NEW', 'NEW']);
    expect(await balanceOf(h.env, u.id, 'USDT')).toEqual(spotBefore);
    expect(await futuresBalance(h.env, u.id)).toEqual(futBefore);
    await booksBalanced();
  });
});

describe('sessions: adminRevokeSession / adminRevokeAllSessions', () => {
  const sessionIds = async (userId: string) => (await db().select({ id: sessions.id }).from(sessions).where(and(eq(sessions.userId, userId), sql`${sessions.revokedAt} IS NULL`))).map((s) => s.id);

  it('one session: the next call with it is 401, the other session stays, its /ws closes with 4401 at once, audit row written', async () => {
    const admin = await h.staff('admin');
    const support = await h.staff('support');
    const u = await h.user();
    const other = h.browser();
    await other.login({ body: { email: u.email, password: u.password } });
    const ids = await sessionIds(u.id);
    expect(ids).toHaveLength(2);
    // which id is `u.b`'s? the one created first (register); the second is `other`'s
    const [first] = await db().select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, u.id)).orderBy(sessions.createdAt);
    const target = first!.id;

    const open = async (cookie: string) => {
      const ws = new WebSocket(h.base.replace('http', 'ws') + '/ws', { headers: { cookie } });
      const closed = new Promise<number>((r) => ws.once('close', (code) => r(code)));
      await new Promise((r) => ws.once('open', r));
      ws.send(JSON.stringify({ type: 'subscribe', channel: 'user' }));
      await new Promise((r) => ws.once('message', r));
      return { ws, closed };
    };
    const a = await open(u.b.cookie());
    const b = await open(other.cookie());

    await expectApiError(support.b.adminRevokeSession({ params: { userId: u.id, sessionId: target }, body: { reason: REASON } }), 'FORBIDDEN', 403);
    await expectApiError(admin.b.adminRevokeSession({ params: { userId: u.id, sessionId: target }, body: { reason: 'x' } }), 'VALIDATION_ERROR', 400);
    // a session that belongs to someone else, or does not exist, is a 404 and revokes nothing
    const stranger = await h.user();
    const [theirs] = await db().select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, stranger.id));
    await expectApiError(admin.b.adminRevokeSession({ params: { userId: u.id, sessionId: theirs!.id }, body: { reason: REASON } }), 'NOT_FOUND', 404);
    await expectApiError(admin.b.adminRevokeSession({ params: { userId: u.id, sessionId: '11111111-1111-4111-8111-111111111111' }, body: { reason: REASON } }), 'NOT_FOUND', 404);
    expect(await stranger.b.me()).toBeDefined();
    const before = await auditCount();

    const r = await admin.b.adminRevokeSession({ params: { userId: u.id, sessionId: target }, body: { reason: REASON } });
    expect(r.revoked).toBe(1);
    expect(await auditCount()).toBe(before + 1);
    expect((await auditRows('SESSION_REVOKE', u.id))[0]).toMatchObject({ id: Number(r.auditLogId), actorId: admin.id, reason: REASON, after: { revoked: 1 } });
    expect(JSON.stringify((await auditRows('SESSION_REVOKE', u.id))[0])).not.toMatch(/token/i); // no token material in the audit row

    // no dropEndedSessions() call here: the admin action closes the socket itself
    expect(await a.closed).toBe(WS_SESSION_ENDED);
    expect(b.ws.readyState).toBe(WebSocket.OPEN);
    await expectApiError(u.b.me(), 'UNAUTHENTICATED', 401);
    expect((await other.me()).id).toBe(u.id);
    // already revoked → 404 again, no new audit row
    await expectApiError(admin.b.adminRevokeSession({ params: { userId: u.id, sessionId: target }, body: { reason: REASON } }), 'NOT_FOUND', 404);
    expect(await auditCount()).toBe(before + 1);
    b.ws.close();
  });

  it('all sessions: every one is signed out (one audit row); nothing active → 0 and no row; never your own account; roles and bot protected', async () => {
    const admin = await h.staff('admin');
    const support = await h.staff('support');
    const owner = await h.staff('owner');
    const u = await h.user();
    const other = h.browser();
    await other.login({ body: { email: u.email, password: u.password } });
    await expectApiError(support.b.adminRevokeAllSessions({ params: { userId: u.id }, body: { reason: REASON } }), 'FORBIDDEN', 403);
    await expectApiError(admin.b.adminRevokeAllSessions({ params: { userId: admin.id }, body: { reason: REASON } }), 'FORBIDDEN', 403);
    await expectApiError(admin.b.adminRevokeAllSessions({ params: { userId: owner.id }, body: { reason: REASON } }), 'FORBIDDEN', 403);
    expect(await owner.b.me()).toBeDefined(); // untouched
    expect(await admin.b.me()).toBeDefined();
    const before = await auditCount();

    const r = await admin.b.adminRevokeAllSessions({ params: { userId: u.id }, body: { reason: REASON } });
    expect(r.revoked).toBe(2);
    expect(await auditCount()).toBe(before + 1);
    await expectApiError(u.b.me(), 'UNAUTHENTICATED', 401);
    await expectApiError(other.me(), 'UNAUTHENTICATED', 401);
    const again = await admin.b.adminRevokeAllSessions({ params: { userId: u.id }, body: { reason: REASON } });
    expect(again).toEqual({ revoked: 0, auditLogId: null });
    expect(await auditCount()).toBe(before + 1);
    // the owner may revoke an admin's sessions
    expect((await owner.b.adminRevokeAllSessions({ params: { userId: admin.id }, body: { reason: REASON } })).revoked).toBeGreaterThanOrEqual(1);
    await expectApiError(admin.b.me(), 'UNAUTHENTICATED', 401);
  });
});

describe('adminAdjustBalance with account', () => {
  it('FUTURES credit / debit: futures ledger rows + audit, default stays SPOT, debit beyond available is refused with no trace, books balanced', async () => {
    const admin = await h.staff('admin');
    const support = await h.staff('support');
    const u = await funded();
    await expectApiError(support.b.adminAdjustBalance({ params: { userId: u.id }, body: { asset: 'USDT', amount: '1', account: 'FUTURES', reason: REASON } }), 'FORBIDDEN');

    const credit = await admin.b.adminAdjustBalance({ params: { userId: u.id }, body: { asset: 'USDT', amount: '250.5', account: 'FUTURES', reason: 'Bù ví Futures do lỗi' } });
    expect(credit.balance).toMatchObject({ asset: 'USDT', available: '250.50000000', locked: '0.00000000' });
    expect(credit.entry).toMatchObject({ account: 'FUTURES', type: 'ADMIN_ADJUST', deltaAvailable: '250.50000000', refType: 'ADMIN', refId: credit.auditLogId });
    expect(await futuresBalance(h.env, u.id)).toEqual({ available: '250.500000000000000000', locked: '0.000000000000000000' });
    expect(await balanceOf(h.env, u.id, 'USDT')).toEqual({ available: '10000', locked: '0' }); // Spot untouched
    expect((await auditRows('BALANCE_ADJUST', u.id))[0]).toMatchObject({ id: Number(credit.auditLogId), before: { account: 'FUTURES', available: '0.00000000' }, after: { account: 'FUTURES', available: '250.50000000', amount: '250.50000000' } });

    // part of the futures wallet gets locked by a resting order: only `available` can be debited
    const o = await u.b.futuresPlaceOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', price: '70000.0', quantity: '0.01' } });
    const mid = await futuresBalance(h.env, u.id);
    expect(Number(mid.locked)).toBeGreaterThan(0);
    const tooMuch = (Number(mid.available) + 0.01).toFixed(2);
    const n = await auditCount();
    await expectApiError(admin.b.adminAdjustBalance({ params: { userId: u.id }, body: { asset: 'USDT', amount: `-${tooMuch}`, account: 'FUTURES', reason: 'trừ quá số dư khả dụng' } }), 'INSUFFICIENT_BALANCE');
    expect(await auditCount()).toBe(n); // refused: nothing written
    expect(await futuresBalance(h.env, u.id)).toEqual(mid);

    const debit = await admin.b.adminAdjustBalance({ params: { userId: u.id }, body: { asset: 'USDT', amount: '-50', account: 'FUTURES', reason: 'Thu hồi tiền thưởng nhầm' } });
    expect(debit.entry).toMatchObject({ account: 'FUTURES', deltaAvailable: '-50.00000000' });
    expect((await futuresBalance(h.env, u.id)).locked).toBe(mid.locked);
    await booksBalanced(); // the FUTURES equality (locked = order reservations + position margin) still holds

    // FUTURES holds USDT only; without `account` the adjustment is SPOT as before
    await expectApiError(admin.b.adminAdjustBalance({ params: { userId: u.id }, body: { asset: 'BTC', amount: '1', account: 'FUTURES', reason: 'tài sản sai ví' } }), 'VALIDATION_ERROR', 400);
    const spot = await admin.b.adminAdjustBalance({ params: { userId: u.id }, body: { asset: 'USDT', amount: '10', reason: 'Mặc định là ví Spot' } });
    expect(spot.entry.account).toBe('SPOT');
    expect(await balanceOf(h.env, u.id, 'USDT')).toEqual({ available: '10010', locked: '0' });
    expect(await auditCount()).toBe(n + 2);
    // the resting order is still cancelable and releases exactly what it held
    await admin.b.adminCancelUserOrder({ params: { userId: u.id, orderId: o.id }, body: { market: 'FUTURES', reason: REASON } });
    expect(await futuresBalance(h.env, u.id)).toEqual({ available: '200.500000000000000000', locked: '0.000000000000000000' });
    await booksBalanced();
  });

  it('FUTURES adjustment: bot, own account and higher roles protected', async () => {
    const admin = await h.staff('admin');
    const owner = await h.staff('owner');
    await expectApiError(admin.b.adminAdjustBalance({ params: { userId: admin.id }, body: { asset: 'USDT', amount: '1', account: 'FUTURES', reason: REASON } }), 'FORBIDDEN');
    await expectApiError(admin.b.adminAdjustBalance({ params: { userId: owner.id }, body: { asset: 'USDT', amount: '1', account: 'FUTURES', reason: REASON } }), 'FORBIDDEN');
    expect(await futuresBalance(h.env, owner.id)).toEqual({ available: '0', locked: '0' });
  });
});
