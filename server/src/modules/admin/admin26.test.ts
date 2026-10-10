import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { ApiError } from '@cex/contracts';
import { auditLogs, gridBots, notifications } from '../../db/schema.ts';
import { reconcile } from '../exchange/reconciliation.ts';
import { marketTrade, setBook, setFuturesBook, setMark } from '../../../test/helpers.ts';
import { ApiHarness } from '../../../test/apiHarness.ts';

/** Admin API for phase 2.6: find users by UID; their futures, bots and sign-ins; stop a bot (audited). */
const h = new ApiHarness();
const err = (code: string) => (e: unknown) => e instanceof ApiError && e.code === code;

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
  setFuturesBook(h.env, 'BTCUSDT', [['80000.0', '1.000']], [['80010.0', '1.000']]);
  setMark(h.env, 'BTCUSDT', '80000');
});

describe('admin: support views and bot control (phase 2.6)', () => {
  it('find by UID → detail with futures + bots → positions, bots, sign-ins → stop / cancel with an audit row', async () => {
    const admin = await h.staff('admin');
    const support = await h.staff('support');
    const u = await h.user();
    const me = await u.b.me();
    await u.b.faucetClaim();
    await u.b.futuresTransfer({ body: { direction: 'SPOT_TO_FUTURES', amount: '500' } });
    await u.b.futuresPlaceOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.002' } });
    const bot = await u.b.createGridBot({ body: { symbol: 'BTCUSDT', lowerPrice: '90', upperPrice: '110', gridCount: 4, mode: 'ARITHMETIC', investment: '1000' } });
    const plan = await u.b.createDcaPlan({ body: { symbol: 'BTCUSDT', quoteAmount: '20', interval: 'DAILY', hour: 9 } });

    // the UID users quote to support finds exactly them
    const found = await support.b.adminListUsers({ query: { q: me.uid } });
    expect(found.items.map((x) => [x.id, x.uid])).toEqual([[u.id, me.uid]]);

    const detail = await support.b.adminGetUser({ params: { userId: u.id } });
    expect(detail.user.uid).toBe(me.uid);
    expect(detail.futures).toMatchObject({ openPositions: 1 });
    expect(Number(detail.futures.positionMargin)).toBeGreaterThan(0);
    expect(detail.bots).toEqual({ runningGrid: 1, activeDca: 1 });

    const pos = await support.b.adminUserFuturesPositions({ params: { userId: u.id }, query: { open: 'true' } });
    expect(pos.items.map((p) => [p.symbol, p.side, p.quantity])).toEqual([['BTCUSDT', 'LONG', '0.002']]);
    expect((await support.b.adminUserFuturesPositions({ params: { userId: u.id }, query: { open: 'false' } })).items).toEqual([]);

    const bots = await support.b.adminUserBots({ params: { userId: u.id } });
    expect([bots.grid.map((g) => g.id), bots.dca.map((d) => d.id)]).toEqual([[bot.id], [plan.id]]);

    const logins = await support.b.adminUserLoginHistory({ params: { userId: u.id } });
    expect(logins.items.length).toBeGreaterThanOrEqual(1);
    expect(logins.items[0]).toMatchObject({ result: 'OK', success: true });

    // support may look but not act; a reason is required
    await expect(support.b.adminStopGridBot({ params: { userId: u.id, botId: bot.id }, body: { reason: 'thử quyền support', sellBase: false } })).rejects.toSatisfy(err('FORBIDDEN'));
    await expect(admin.b.adminStopGridBot({ params: { userId: u.id, botId: bot.id }, body: { reason: 'x', sellBase: false } })).rejects.toSatisfy(err('VALIDATION_ERROR'));

    // admin stops the grid bot: STOPPED / ADMIN, its orders canceled, the user told, one audit row
    const stopped = await admin.b.adminStopGridBot({ params: { userId: u.id, botId: bot.id }, body: { reason: 'Bot lỗi theo báo cáo của người dùng', sellBase: true } });
    expect([stopped.status, stopped.stopReason, stopped.openOrders]).toEqual(['STOPPED', 'ADMIN', 0]);
    expect(stopped.totalValue).not.toBeNull();
    const [row] = await h.env.database.db.select().from(gridBots).where(eq(gridBots.id, Number(bot.id)));
    expect(row!.stopReason).toBe('ADMIN');
    const notes = await h.env.database.db.select().from(notifications).where(and(eq(notifications.userId, u.id), eq(notifications.type, 'GRID_BOT_STOPPED')));
    expect(notes).toHaveLength(1);
    const audits = await h.env.database.db.select().from(auditLogs).where(and(eq(auditLogs.targetId, u.id), eq(auditLogs.action, 'GRID_BOT_STOP')));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorId: admin.id, reason: 'Bot lỗi theo báo cáo của người dùng', after: { status: 'STOPPED', sellBase: true } });
    await expect(admin.b.adminStopGridBot({ params: { userId: u.id, botId: bot.id }, body: { reason: 'dừng lần hai', sellBase: false } })).rejects.toSatisfy(err('CONFLICT'));

    // admin cancels the recurring buy (once)
    const canceled = await admin.b.adminCancelDcaPlan({ params: { userId: u.id, planId: plan.id }, body: { reason: 'Người dùng yêu cầu hủy qua hỗ trợ' } });
    expect(canceled.status).toBe('CANCELED');
    await expect(admin.b.adminCancelDcaPlan({ params: { userId: u.id, planId: plan.id }, body: { reason: 'hủy lần hai' } })).rejects.toSatisfy(err('CONFLICT'));
    expect(await h.env.database.db.select().from(auditLogs).where(and(eq(auditLogs.targetId, u.id), eq(auditLogs.action, 'DCA_PLAN_CANCEL')))).toHaveLength(1);

    // another user's bot id is not found through this user
    const other = await h.user();
    await expect(admin.b.adminStopGridBot({ params: { userId: other.id, botId: bot.id }, body: { reason: 'sai người dùng', sellBase: false } })).rejects.toSatisfy(err('NOT_FOUND'));

    expect((await admin.b.adminGetUser({ params: { userId: u.id } })).bots).toEqual({ runningGrid: 0, activeDca: 0 });
    expect((await reconcile(h.env.database.db, false)).mismatches).toEqual([]);
  });
});
