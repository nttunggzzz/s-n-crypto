import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { ApiError, createApiClient } from '../index.ts';
import { createMockHandlers, resetMockStore, setMockRole } from './index.ts';

const BASE = 'http://mock.local';
const server = setupServer(...createMockHandlers({ baseUrl: BASE, latencyMs: 0 }));
const api = createApiClient({ baseUrl: BASE, validateResponses: true });
const code = (c: string) => (e: unknown) => e instanceof ApiError && e.code === c;
const DEMO = '00000000-0000-4000-8000-000000000001';
const BOT = '00000000-0000-4000-8000-000000000007';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  resetMockStore();
  setMockRole('user', false);
});
afterAll(() => server.close());

describe('phase 3 mocks follow the contract', () => {
  it('2FA setup, enable, login challenge', async () => {
    expect((await api.me()).twoFactorEnabled).toBe(false);
    const setup = await api.setupTwoFactor({ body: { currentPassword: 'x' } });
    expect(setup.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    await expect(api.enableTwoFactor({ body: { code: '000000' } })).rejects.toSatisfy(code('INVALID_TWO_FACTOR_CODE'));
    expect((await api.enableTwoFactor({ body: { code: '123456' } })).recoveryCodes).toHaveLength(10);
    const login = await api.login({ body: { email: 'demo@example.com', password: 'secret123' } });
    expect('twoFactorRequired' in login && login.twoFactorRequired).toBe(true);
    if ('challengeToken' in login) await api.loginTwoFactor({ body: { challengeToken: login.challengeToken, code: '654321' } });
    await api.regenerateRecoveryCodes({ body: { code: '111111' } });
    await api.disableTwoFactor({ body: { currentPassword: 'x', code: '222222' } });
  });

  it('admin endpoints enforce role, 2FA and permission like the server', async () => {
    await expect(api.adminOverview()).rejects.toSatisfy(code('FORBIDDEN'));
    setMockRole('admin', false);
    await expect(api.adminOverview()).rejects.toSatisfy(code('TWO_FACTOR_REQUIRED'));
    setMockRole('support');
    expect((await api.me()).permissions).toEqual(['users.read', 'exchange.read', 'reconciliation.read']);
    await api.adminOverview();
    await expect(api.adminAdjustBalance({ params: { userId: DEMO }, body: { asset: 'USDT', amount: '1', reason: 'test reason' } })).rejects.toSatisfy(code('FORBIDDEN'));
  });

  it('every admin read endpoint returns schema-valid data', async () => {
    setMockRole('owner');
    await api.adminOverview();
    expect((await api.adminListUsers({ query: { role: 'support' } })).items).toHaveLength(1);
    const d = await api.adminGetUser({ params: { userId: DEMO } });
    expect(d.balances.length).toBeGreaterThan(0);
    await api.adminUserOrders({ params: { userId: DEMO }, query: { open: 'false' } });
    await api.adminUserLedger({ params: { userId: DEMO } });
    await api.adminGetSettings();
    expect((await api.adminListSymbols()).items).toHaveLength(50);
    await api.adminAuditLogs({ query: { action: 'BALANCE_ADJUST' } });
    expect((await api.adminReconciliationRuns()).items[1]!.ok).toBe(false);
  });

  it('admin actions write the audit log; the bot account is protected', async () => {
    setMockRole('admin');
    const r = await api.adminAdjustBalance({ params: { userId: DEMO }, body: { asset: 'USDT', amount: '-250.5', reason: 'Thu hồi do lỗi' } });
    expect(r.entry).toMatchObject({ type: 'ADMIN_ADJUST', refType: 'ADMIN', refId: r.auditLogId });
    await expect(api.adminAdjustBalance({ params: { userId: BOT }, body: { asset: 'USDT', amount: '1', reason: 'test reason' } })).rejects.toSatisfy(code('BOT_ACCOUNT_PROTECTED'));
    await api.adminLockUser({ params: { userId: DEMO }, body: { reason: 'nghi ngờ gian lận' } });
    await api.adminUnlockUser({ params: { userId: DEMO }, body: { reason: 'đã xác minh xong' } });
    await api.adminSetSignalsAccess({ params: { userId: DEMO }, body: { enabled: true, reason: 'dùng thử tín hiệu' } });
    await api.adminResetAccount({ params: { userId: DEMO }, body: { reason: 'người dùng yêu cầu', confirm: 'RESET' } });
    await api.adminUpdateSettings({ body: { feeRate: '0.002', reason: 'thử mức phí mới' } });
    expect((await api.adminHaltTrading({ body: { reason: 'sự cố dữ liệu giá', confirm: 'HALT' } })).tradingHalted).toBe(true);
    expect((await api.exchangeInfo()).tradingHalted).toBe(true);
    expect((await api.adminResumeTrading({ body: { reason: 'đã khắc phục xong', confirm: 'RESUME' } })).tradingHalted).toBe(false);
    await api.adminUpdateSymbol({ params: { symbol: 'XRPUSDT' }, body: { enabled: false, cancelOpenOrders: true, reason: 'tạm ngưng cặp' } });
    await api.adminRunReconciliation();
    await expect(api.adminSetRole({ params: { userId: DEMO }, body: { role: 'support', reason: 'nhân viên mới' } })).rejects.toSatisfy(code('FORBIDDEN'));
    const actions = (await api.adminAuditLogs()).items.map((e) => e.action);
    expect(actions.slice(0, 10)).toEqual([
      'RECONCILIATION_RUN',
      'SYMBOL_UPDATE',
      'TRADING_RESUME',
      'TRADING_HALT',
      'SETTINGS_UPDATE',
      'ACCOUNT_RESET',
      'USER_SIGNALS_ACCESS',
      'USER_UNLOCK',
      'USER_LOCK',
      'BALANCE_ADJUST',
    ]);
  });

  it('only the owner changes roles', async () => {
    setMockRole('owner');
    // the mock session is the demo user: changing your own role is refused, like on the server
    await expect(api.adminSetRole({ params: { userId: DEMO }, body: { role: 'admin', reason: 'tự nâng quyền' } })).rejects.toSatisfy(code('FORBIDDEN'));
    const u = await api.adminSetRole({ params: { userId: '00000000-0000-4000-8000-000000000002' }, body: { role: 'support', reason: 'nhân viên mới' } });
    expect(u.role).toBe('support');
  });
});
