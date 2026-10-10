import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { ApiError, createApiClient } from '../index.ts';
import { createMockHandlers, resetMockStore, setMockRole } from './index.ts';

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

describe('phase 2.6 mocks', () => {
  it('profile: uid, avatar, name', async () => {
    const me = await api.me();
    expect(me).toMatchObject({ uid: '10000001', avatar: 'fox' });
    const after = await api.updateProfile({ body: { avatar: 'whale', name: 'Trader Việt' } });
    expect(after).toMatchObject({ avatar: 'whale', name: 'Trader Việt' });
    await expect(api.updateProfile({ body: {} })).rejects.toSatisfy(code('VALIDATION_ERROR'));
  });

  it('security: anti-phishing code (masked), login history', async () => {
    expect((await api.securityOverview()).antiPhishingCode).toBeNull();
    await expect(api.setAntiPhishingCode({ body: { code: 'AB12XY', currentPassword: 'wrong' } })).rejects.toSatisfy(code('VALIDATION_ERROR'));
    await expect(api.setAntiPhishingCode({ body: { code: 'a!', currentPassword: 'x' } })).rejects.toSatisfy(code('VALIDATION_ERROR'));
    expect((await api.setAntiPhishingCode({ body: { code: 'AB12XY', currentPassword: 'secret' } })).antiPhishingCode).toBe('AB****');
    const h = await api.loginHistory();
    expect(h.items.some((e) => e.newDevice)).toBe(true);
  });

  it('PnL analysis: every day of the range, totals add up', async () => {
    const p = await api.pnlAnalysis({ query: { range: '7d' } });
    expect(p.daily).toHaveLength(7);
    const sum = p.daily.reduce((a, d) => a + Number(d.total), 0);
    expect(Number(p.totalRealized)).toBeCloseTo(sum, 6);
    expect(Number(p.daily.at(-1)!.cumulative)).toBeCloseTo(sum, 6);
    expect(p.trades.winRate).not.toBeNull();
  });

  it('DCA plans: create (weekly needs a day), pause, cancel, runs', async () => {
    await expect(api.createDcaPlan({ body: { symbol: 'BTCUSDT', quoteAmount: '25', interval: 'WEEKLY' } })).rejects.toSatisfy(code('VALIDATION_ERROR'));
    const p = await api.createDcaPlan({ body: { symbol: 'BTCUSDT', quoteAmount: '25', interval: 'WEEKLY', dayOfWeek: 1, hour: 8 } });
    expect(p).toMatchObject({ status: 'ACTIVE', dayOfWeek: 1, hour: 8 });
    expect((await api.updateDcaPlan({ params: { planId: p.id }, body: { status: 'PAUSED' } })).nextRunAt).toBeNull();
    expect((await api.cancelDcaPlan({ params: { planId: p.id } })).status).toBe('CANCELED');
    expect((await api.dcaRuns({ params: { planId: '301' } })).items.length).toBeGreaterThan(0);
  });

  it('grid bot: preview, start (orders tagged GRID), stop', async () => {
    await expect(api.gridBotPreview({ body: { symbol: 'BTCUSDT', lowerPrice: '90000', upperPrice: '95000', gridCount: 10, investment: '1000' } })).rejects.toSatisfy(code('INVALID_GRID'));
    const pv = await api.gridBotPreview({ body: { symbol: 'BTCUSDT', lowerPrice: '76000', upperPrice: '84000', gridCount: 8, investment: '1000' } });
    expect(pv.levels).toHaveLength(9);
    expect(pv.buyOrders + pv.sellOrders).toBe(8);
    const bot = await api.createGridBot({ body: { symbol: 'BTCUSDT', lowerPrice: '76000', upperPrice: '84000', gridCount: 8, investment: '1000' } });
    expect(bot).toMatchObject({ status: 'RUNNING', openOrders: 8 });
    // the whole investment is accounted for: right after the start the value is the investment (no fees in the mock)
    expect(Math.abs(Number(bot.totalPnl))).toBeLessThan(0.01);
    const open = await api.openOrders();
    const botOrders = open.items.filter((o) => o.source === 'GRID' && o.sourceId === bot.id);
    expect(botOrders).toHaveLength(8);
    // like the server: the user cannot cancel bot orders, and "cancel all" leaves them alone
    await expect(api.cancelOrder({ params: { orderId: botOrders[0]!.id } })).rejects.toSatisfy(code('ORDER_NOT_CANCELABLE'));
    expect((await api.cancelAllOrders()).canceled.some((o) => o.source !== 'USER')).toBe(false);
    expect((await api.openOrders()).items.filter((o) => o.sourceId === bot.id)).toHaveLength(8);
    const stopped = await api.stopGridBot({ params: { botId: bot.id }, body: { sellBase: true } });
    expect(stopped).toMatchObject({ status: 'STOPPED', stopReason: 'USER', openOrders: 0, baseHeld: '0.00000000', quoteHeld: '0.00000000' });
    // the final result stays visible after the stop (selling pays the 0.1 % fee)
    expect(Number(stopped.totalPnl)).toBeLessThan(0);
    expect(Number(stopped.totalPnl)).toBeGreaterThan(-5);
    expect((await api.gridBotOrders({ params: { botId: bot.id } })).items.every((o) => o.closeReason === 'BOT_STOPPED')).toBe(true);
  });
});

describe('admin mocks for phase 2.6 (the mock signs in as the demo user)', () => {
  const DEMO = '00000000-0000-4000-8000-000000000001';
  it('UID search, user detail with futures + bots, positions, sign-ins, stop / cancel with audit', async () => {
    const bot = await api.createGridBot({ body: { symbol: 'BTCUSDT', lowerPrice: '76000', upperPrice: '84000', gridCount: 8, investment: '1000' } });
    setMockRole('support');
    expect((await api.adminListUsers({ query: { q: '10000001' } })).items.map((u) => u.id)).toEqual([DEMO]);
    const d = await api.adminGetUser({ params: { userId: DEMO } });
    expect(d.user.uid).toBe('10000001');
    expect(d.futures.openPositions).toBeGreaterThanOrEqual(0);
    expect((await api.adminUserBots({ params: { userId: DEMO } })).grid.map((g) => g.id)).toEqual([bot.id]);
    expect((await api.adminUserLoginHistory({ params: { userId: DEMO } })).items.length).toBeGreaterThan(0);
    await api.adminUserFuturesPositions({ params: { userId: DEMO }, query: { open: 'true' } });
    await expect(api.adminStopGridBot({ params: { userId: DEMO, botId: bot.id }, body: { reason: 'support thử dừng', sellBase: false } })).rejects.toSatisfy(code('FORBIDDEN'));

    setMockRole('admin');
    const stopped = await api.adminStopGridBot({ params: { userId: DEMO, botId: bot.id }, body: { reason: 'Bot lỗi theo báo cáo', sellBase: false } });
    expect([stopped.status, stopped.stopReason]).toEqual(['STOPPED', 'ADMIN']);
    expect(stopped.totalValue).not.toBeNull();
    await expect(api.adminStopGridBot({ params: { userId: DEMO, botId: bot.id }, body: { reason: 'dừng lần hai', sellBase: false } })).rejects.toSatisfy(code('CONFLICT'));
    const plan = await api.adminCancelDcaPlan({ params: { userId: DEMO, planId: '301' }, body: { reason: 'Người dùng yêu cầu hủy' } });
    expect(plan.status).toBe('CANCELED');
    await expect(api.adminCancelDcaPlan({ params: { userId: DEMO, planId: '301' }, body: { reason: 'hủy lần hai' } })).rejects.toSatisfy(code('CONFLICT'));
    const actions = (await api.adminAuditLogs({ query: {} })).items.map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['GRID_BOT_STOP', 'DCA_PLAN_CANCEL']));
  });
});
