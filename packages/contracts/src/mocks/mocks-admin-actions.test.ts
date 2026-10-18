import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { AdminCancelOrderResult, AdminCancelOrdersResult, AdminRevokeSessionsResult, ApiError, BalanceAdjustmentRequest, createApiClient, hasPermission } from '../index.ts';
import { fixtureAdminCancelOrderResult, fixtureAdminCancelOrdersResult, fixtureAdminRevokeSessionsResult, fixtureAdminSessionIds } from '../fixtures/index.ts';
import { createMockHandlers, resetMockStore, setMockRole } from './index.ts';

const BASE = 'http://mock.local';
const server = setupServer(...createMockHandlers({ baseUrl: BASE, latencyMs: 0 }));
const api = createApiClient({ baseUrl: BASE, validateResponses: true });
const code = (c: string) => (e: unknown) => e instanceof ApiError && e.code === c;
const DEMO = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const BOT = '00000000-0000-4000-8000-000000000007';
const REASON = 'Khách nhờ hỗ trợ';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  resetMockStore();
  setMockRole('admin');
});
afterAll(() => server.close());

describe('AD3 contract pieces', () => {
  it('fixtures match their schemas; orders.manage is admin + owner only; account defaults to SPOT and FUTURES is USDT only', () => {
    expect(AdminCancelOrderResult.parse(fixtureAdminCancelOrderResult)).toEqual(fixtureAdminCancelOrderResult);
    expect(AdminCancelOrdersResult.parse(fixtureAdminCancelOrdersResult)).toEqual(fixtureAdminCancelOrdersResult);
    expect(AdminRevokeSessionsResult.parse(fixtureAdminRevokeSessionsResult)).toEqual(fixtureAdminRevokeSessionsResult);
    expect(['user', 'support', 'admin', 'owner'].map((r) => hasPermission(r as 'user', 'orders.manage'))).toEqual([false, false, true, true]);
    expect(BalanceAdjustmentRequest.parse({ asset: 'USDT', amount: '1', reason: 'đủ năm chữ' }).account).toBe('SPOT');
    expect(BalanceAdjustmentRequest.safeParse({ asset: 'BTC', amount: '1', account: 'FUTURES', reason: 'đủ năm chữ' }).success).toBe(false);
    expect(BalanceAdjustmentRequest.safeParse({ asset: 'USDT', amount: '1', account: 'FUTURES', reason: 'đủ năm chữ' }).success).toBe(true);
  });
});

describe('AD3 mocks', () => {
  it('cancel one order: OCO as a whole with closeReason ADMIN, closed / foreign / unknown orders refused, support forbidden', async () => {
    setMockRole('support');
    await expect(api.adminCancelUserOrder({ params: { userId: DEMO, orderId: '103' }, body: { market: 'SPOT', reason: REASON } })).rejects.toSatisfy(code('FORBIDDEN'));
    setMockRole('admin');
    await expect(api.adminCancelUserOrder({ params: { userId: DEMO, orderId: '103' }, body: { market: 'SPOT', reason: 'x' } })).rejects.toSatisfy(code('VALIDATION_ERROR'));
    await expect(api.adminCancelUserOrder({ params: { userId: OTHER, orderId: '103' }, body: { market: 'SPOT', reason: REASON } })).rejects.toSatisfy(code('NOT_FOUND'));
    await expect(api.adminCancelUserOrder({ params: { userId: BOT, orderId: '103' }, body: { market: 'SPOT', reason: REASON } })).rejects.toSatisfy(code('BOT_ACCOUNT_PROTECTED'));
    const r = await api.adminCancelUserOrder({ params: { userId: DEMO, orderId: '103' }, body: { market: 'SPOT', reason: REASON } });
    expect(r).toMatchObject({ market: 'SPOT', orderId: '103', canceledOrderIds: ['103', '104'], stoppedBotId: null });
    await expect(api.adminCancelUserOrder({ params: { userId: DEMO, orderId: '103' }, body: { market: 'SPOT', reason: REASON } })).rejects.toSatisfy(code('ORDER_NOT_CANCELABLE'));
    const logs = await api.adminAuditLogs({ query: { action: 'ORDER_CANCEL' } });
    expect(logs.items).toHaveLength(1);
    expect(logs.items[0]).toMatchObject({ id: r.auditLogId, reason: REASON });
  });

  it('cancel one futures order, then cancel all: counts and one audit row per book', async () => {
    await expect(api.adminCancelUserOrder({ params: { userId: DEMO, orderId: '701' }, body: { market: 'SPOT', reason: REASON } })).rejects.toSatisfy(code('NOT_FOUND'));
    const f = await api.adminCancelUserOrder({ params: { userId: DEMO, orderId: '701' }, body: { market: 'FUTURES', reason: REASON } });
    expect(f.canceledOrderIds).toEqual(['701']);
    const all = await api.adminCancelUserOrders({ params: { userId: DEMO }, body: { reason: REASON } });
    expect(all.spotCanceled).toBeGreaterThan(0);
    expect(all.futuresCanceled).toBe(0);
    expect(all.auditLogIds).toHaveLength(1);
    expect(await api.adminCancelUserOrders({ params: { userId: DEMO }, body: { reason: REASON } })).toEqual({ spotCanceled: 0, futuresCanceled: 0, stoppedBotIds: [], auditLogIds: [] });
  });

  it('sessions: revoke one (unknown → 404), then all; nothing active → 0 and no audit row', async () => {
    await expect(api.adminRevokeSession({ params: { userId: DEMO, sessionId: '11111111-1111-4111-8111-111111111111' }, body: { reason: REASON } })).rejects.toSatisfy(code('NOT_FOUND'));
    const one = await api.adminRevokeSession({ params: { userId: DEMO, sessionId: fixtureAdminSessionIds[0] }, body: { reason: REASON } });
    expect(one.revoked).toBe(1);
    await expect(api.adminRevokeSession({ params: { userId: DEMO, sessionId: fixtureAdminSessionIds[0] }, body: { reason: REASON } })).rejects.toSatisfy(code('NOT_FOUND'));
    expect((await api.adminRevokeAllSessions({ params: { userId: DEMO }, body: { reason: REASON } })).revoked).toBe(1);
    expect(await api.adminRevokeAllSessions({ params: { userId: DEMO }, body: { reason: REASON } })).toEqual({ revoked: 0, auditLogId: null });
    setMockRole('support');
    await expect(api.adminRevokeAllSessions({ params: { userId: DEMO }, body: { reason: REASON } })).rejects.toSatisfy(code('FORBIDDEN'));
  });

  it('balance adjustment on the FUTURES wallet: credit, debit beyond available refused, USDT only', async () => {
    const credit = await api.adminAdjustBalance({ params: { userId: DEMO }, body: { asset: 'USDT', amount: '100', account: 'FUTURES', reason: 'Bù ví Futures' } });
    expect(credit.entry.account).toBe('FUTURES');
    await expect(api.adminAdjustBalance({ params: { userId: DEMO }, body: { asset: 'USDT', amount: '-999999', account: 'FUTURES', reason: 'trừ quá số dư' } })).rejects.toSatisfy(code('INSUFFICIENT_BALANCE'));
    await expect(api.adminAdjustBalance({ params: { userId: DEMO }, body: { asset: 'BTC', amount: '1', account: 'FUTURES', reason: 'sai tài sản' } })).rejects.toSatisfy(code('VALIDATION_ERROR'));
    expect((await api.adminAdjustBalance({ params: { userId: DEMO }, body: { asset: 'USDT', amount: '1', reason: 'Mặc định Spot' } })).entry.account).toBe('SPOT');
  });
});
