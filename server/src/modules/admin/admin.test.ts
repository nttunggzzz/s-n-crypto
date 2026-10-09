import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { ApiError } from '@cex/contracts';
import { auditLogs, ledgerEntries, orders, users } from '../../db/schema.ts';
import { reconcile } from '../exchange/reconciliation.ts';
import { setBook } from '../../../test/helpers.ts';
import { ApiHarness } from '../../../test/apiHarness.ts';

const h = new ApiHarness();

async function expectApiError(p: Promise<unknown>, code: string, status?: number) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof ApiError && e.code === code && (status === undefined || e.status === status));
}
const auditCount = async () => (await h.env.database.db.select({ n: sql<number>`count(*)::int` }).from(auditLogs))[0]!.n;

beforeAll(async () => {
  await h.start();
});
afterAll(async () => {
  await h.stop();
});
beforeEach(() => {
  h.env.clock.ms = Date.now();
  setBook(h.env, 'BTCUSDT', [['99.00', '1.00000']], [['100.00', '0.50000'], ['101.00', '1.00000']]);
});

describe('database encoding', () => {
  it('stores Vietnamese text (database must be UTF8 — WIN1252 on Windows broke this)', async () => {
    const b = h.browser();
    const { user } = await b.register({ body: { email: `vn-${Date.now()}@test.local`, password: 'mật khẩu đủ dài', name: 'Nguyễn Thị Ánh Tuyết' } });
    expect(user.name).toBe('Nguyễn Thị Ánh Tuyết');
    expect((await b.me()).name).toBe('Nguyễn Thị Ánh Tuyết');
  });
});

describe('two-factor authentication', () => {
  it('setup → enable → login needs the second step; codes are single-use; recovery codes work once', async () => {
    const u = await h.user();
    await expectApiError(u.b.setupTwoFactor({ body: { currentPassword: 'wrong password' } }), 'VALIDATION_ERROR');
    const { secret, otpauthUrl } = await u.b.setupTwoFactor({ body: { currentPassword: u.password } });
    expect(otpauthUrl).toContain(`secret=${secret}`);
    await expectApiError(u.b.enableTwoFactor({ body: { code: '000000' } }), 'INVALID_TWO_FACTOR_CODE', 400);
    const { Totp } = await import('../../../test/apiHarness.ts');
    const totp = new Totp(secret, h);
    const { recoveryCodes } = await u.b.enableTwoFactor({ body: { code: totp.next() } });
    expect(recoveryCodes).toHaveLength(10);
    expect((await u.b.me()).twoFactorEnabled).toBe(true);

    // password alone no longer signs in
    const b2 = h.browser();
    const step1 = await b2.login({ body: { email: u.email, password: u.password } });
    expect('twoFactorRequired' in step1).toBe(true);
    expect(b2.cookie()).toBe('');
    if (!('challengeToken' in step1)) throw new Error('expected a challenge');
    await expectApiError(b2.loginTwoFactor({ body: { challengeToken: step1.challengeToken, code: '123456' } }), 'INVALID_TWO_FACTOR_CODE');
    const code = totp.next();
    await b2.loginTwoFactor({ body: { challengeToken: step1.challengeToken, code } });
    expect((await b2.me()).email).toBe(u.email);
    await expectApiError(b2.loginTwoFactor({ body: { challengeToken: step1.challengeToken, code } }), 'UNAUTHENTICATED'); // challenge used

    // the same code cannot be used twice, even with a fresh challenge
    const b3 = h.browser();
    const again = await b3.login({ body: { email: u.email, password: u.password } });
    if (!('challengeToken' in again)) throw new Error('expected a challenge');
    await expectApiError(b3.loginTwoFactor({ body: { challengeToken: again.challengeToken, code } }), 'INVALID_TWO_FACTOR_CODE');
    // a recovery code works, once
    await b3.loginTwoFactor({ body: { challengeToken: again.challengeToken, code: recoveryCodes[0]! } });
    const b4 = h.browser();
    const third = await b4.login({ body: { email: u.email, password: u.password } });
    if (!('challengeToken' in third)) throw new Error('expected a challenge');
    await expectApiError(b4.loginTwoFactor({ body: { challengeToken: third.challengeToken, code: recoveryCodes[0]! } }), 'INVALID_TWO_FACTOR_CODE');

    // a regular user may turn it off again
    await u.b.disableTwoFactor({ body: { currentPassword: u.password, code: totp.next() } });
    expect((await u.b.me()).twoFactorEnabled).toBe(false);
  });

  it('staff cannot turn 2FA off', async () => {
    const a = await h.staff('admin');
    await expectApiError(a.b.disableTwoFactor({ body: { currentPassword: a.password, code: a.totp.next() } }), 'FORBIDDEN', 403);
  });
});

describe('admin access control', () => {
  it('user → 403; staff without 2FA → TWO_FACTOR_REQUIRED; old session without 2FA → TWO_FACTOR_REQUIRED', async () => {
    const plain = await h.user();
    await expectApiError(plain.b.adminOverview(), 'FORBIDDEN', 403);
    const noMfa = await h.user('admin');
    await expectApiError(noMfa.b.adminOverview(), 'TWO_FACTOR_REQUIRED', 403);
    expect((await noMfa.b.me()).permissions).toContain('balances.adjust');

    // a session opened before 2FA was enabled elsewhere is not trusted for admin
    const other = h.browser();
    await other.login({ body: { email: noMfa.email, password: noMfa.password } });
    const { secret } = await noMfa.b.setupTwoFactor({ body: { currentPassword: noMfa.password } });
    const { Totp } = await import('../../../test/apiHarness.ts');
    await noMfa.b.enableTwoFactor({ body: { code: new Totp(secret, h).next() } });
    await noMfa.b.adminOverview(); // this session proved the second factor
    await expectApiError(other.adminOverview(), 'TWO_FACTOR_REQUIRED');
  });

  it('permissions differ by role', async () => {
    const support = await h.staff('support');
    const target = await h.user();
    await support.b.adminGetUser({ params: { userId: target.id } });
    await expectApiError(support.b.adminAdjustBalance({ params: { userId: target.id }, body: { asset: 'USDT', amount: '1', reason: 'không được phép' } }), 'FORBIDDEN');
    await expectApiError(support.b.adminAuditLogs(), 'FORBIDDEN');
    const admin = await h.staff('admin');
    await expectApiError(admin.b.adminSetRole({ params: { userId: target.id }, body: { role: 'support', reason: 'chỉ owner được' } }), 'FORBIDDEN');
  });
});

describe('admin actions', () => {
  it('balance adjustments: ledger ADMIN_ADJUST + audit row, refused debits leave no trace, bot and higher roles protected', async () => {
    const admin = await h.staff('admin');
    const t = await h.user();
    const before = await auditCount();
    const r = await admin.b.adminAdjustBalance({ params: { userId: t.id }, body: { asset: 'USDT', amount: '500', reason: 'Bù lỗi hệ thống' } });
    expect(r.balance.available).toBe('500.00000000');
    expect(r.entry).toMatchObject({ type: 'ADMIN_ADJUST', deltaAvailable: '500.00000000', refType: 'ADMIN', refId: r.auditLogId });
    const log = (await admin.b.adminAuditLogs({ query: { action: 'BALANCE_ADJUST', targetId: t.id } })).items[0]!;
    expect(log).toMatchObject({ id: r.auditLogId, actor: { email: admin.email }, reason: 'Bù lỗi hệ thống', before: { available: '0.00000000' }, after: { available: '500.00000000' } });

    await expectApiError(admin.b.adminAdjustBalance({ params: { userId: t.id }, body: { asset: 'USDT', amount: '-500.01', reason: 'trừ quá số dư' } }), 'INSUFFICIENT_BALANCE');
    await admin.b.adminAdjustBalance({ params: { userId: t.id }, body: { asset: 'USDT', amount: '-200', reason: 'thu hồi một phần' } });
    expect(await auditCount()).toBe(before + 2); // the refused debit wrote nothing
    await expectApiError(admin.b.adminAdjustBalance({ params: { userId: t.id }, body: { asset: 'DOGGO', amount: '1', reason: 'tài sản lạ' } }), 'VALIDATION_ERROR');
    await expectApiError(admin.b.adminAdjustBalance({ params: { userId: admin.id }, body: { asset: 'USDT', amount: '1', reason: 'tự cộng tiền' } }), 'FORBIDDEN');
    const owner = await h.user('owner');
    await expectApiError(admin.b.adminAdjustBalance({ params: { userId: owner.id }, body: { asset: 'USDT', amount: '1', reason: 'cấp trên' } }), 'FORBIDDEN');
    const [bot] = await h.env.database.db.insert(users).values({ email: `bot-${Date.now()}@system.local`, name: 'Signal bot', passwordHash: null, isBot: true }).returning();
    await expectApiError(admin.b.adminAdjustBalance({ params: { userId: bot!.id }, body: { asset: 'USDT', amount: '1', reason: 'không được' } }), 'BOT_ACCOUNT_PROTECTED', 403);
    expect((await reconcile(h.env.database.db, false)).mismatches).toEqual([]);
  });

  it('lock signs the user out; unlock lets them back in', async () => {
    const admin = await h.staff('admin');
    const t = await h.user();
    const s = await admin.b.adminLockUser({ params: { userId: t.id }, body: { reason: 'nghi ngờ gian lận' } });
    expect(s.status).toBe('locked');
    await expectApiError(t.b.me(), 'UNAUTHENTICATED');
    await expectApiError(h.browser().login({ body: { email: t.email, password: t.password } }), 'ACCOUNT_LOCKED');
    await admin.b.adminUnlockUser({ params: { userId: t.id }, body: { reason: 'đã xác minh xong' } });
    await h.browser().login({ body: { email: t.email, password: t.password } });
    await expectApiError(admin.b.adminLockUser({ params: { userId: admin.id }, body: { reason: 'tự khóa mình' } }), 'FORBIDDEN');
  });

  it('only the owner changes roles, never their own', async () => {
    const owner = await h.staff('owner');
    const t = await h.user();
    expect((await owner.b.adminSetRole({ params: { userId: t.id }, body: { role: 'support', reason: 'nhân viên hỗ trợ mới' } })).role).toBe('support');
    await expectApiError(owner.b.adminSetRole({ params: { userId: owner.id }, body: { role: 'user', reason: 'tự hạ quyền' } }), 'FORBIDDEN');
    const sig = await owner.b.adminSetSignalsAccess({ params: { userId: t.id }, body: { enabled: true, reason: 'dùng thử tín hiệu' } });
    expect(sig.signalsAccess).toBe(true);
  });

  it('reset cancels orders, zeroes balances, allows the faucet again — books stay balanced', async () => {
    const admin = await h.staff('admin');
    const t = await h.user();
    await t.b.faucetClaim();
    await t.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.1' } });
    const open = await t.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.1', price: '90' } });
    await expectApiError(admin.b.adminResetAccount({ params: { userId: t.id }, body: { reason: 'người dùng yêu cầu', confirm: 'reset' as 'RESET' } }), 'VALIDATION_ERROR');
    const d = await admin.b.adminResetAccount({ params: { userId: t.id }, body: { reason: 'người dùng yêu cầu', confirm: 'RESET' } });
    expect(d.openOrders).toBe(0);
    expect(d.balances.every((b) => b.total === '0.00000000')).toBe(true);
    expect(d.faucetTotalClaimed).toBe('0.00000000');
    const [o] = await h.env.database.db.select().from(orders).where(eq(orders.id, Number(open.order.id)));
    expect([o!.status, o!.closeReason]).toEqual(['CANCELED', 'ADMIN']);
    expect((await t.b.faucetClaim()).claimed).toBe('10000.00000000');
    const resets = await h.env.database.db.select().from(ledgerEntries).where(eq(ledgerEntries.type, 'ACCOUNT_RESET'));
    expect(resets.length).toBeGreaterThan(0);
    expect((await reconcile(h.env.database.db, false)).mismatches).toEqual([]);
  });

  it('settings change applies to the next trade; halt/resume need the typed confirmation', async () => {
    const admin = await h.staff('admin');
    const t = await h.user();
    await t.b.faucetClaim();
    await expectApiError(admin.b.adminUpdateSettings({ body: { feeRate: '0.02', reason: 'phí quá cao' } }), 'VALIDATION_ERROR');
    const s = await admin.b.adminUpdateSettings({ body: { feeRate: '0.002', faucetAmount: '5000', reason: 'thử nghiệm phí mới' } });
    expect(s).toMatchObject({ feeRate: '0.002', faucet: { amount: '5000.00000000' } });
    const buy = await t.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.1' } });
    expect(buy.fills[0]!.fee).toBe('0.00020000'); // 0.2% of 0.1 BTC
    await admin.b.adminUpdateSettings({ body: { feeRate: '0.001', faucetAmount: '10000', reason: 'trả lại mặc định' } });

    await expectApiError(admin.b.adminHaltTrading({ body: { reason: 'sự cố giá', confirm: 'halt' as 'HALT' } }), 'VALIDATION_ERROR');
    expect((await admin.b.adminHaltTrading({ body: { reason: 'sự cố dữ liệu giá', confirm: 'HALT' } })).tradingHalted).toBe(true);
    expect((await t.b.exchangeInfo()).tradingHalted).toBe(true);
    await expectApiError(t.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.1' } }), 'TRADING_HALTED');
    expect((await admin.b.adminResumeTrading({ body: { reason: 'đã khắc phục xong', confirm: 'RESUME' } })).tradingHalted).toBe(false);
    await t.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.1' } });
  });

  it('disabling a pair can cancel its open orders', async () => {
    const admin = await h.staff('admin');
    const t = await h.user();
    await t.b.faucetClaim();
    const o = await t.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.1', price: '90' } });
    const sym = await admin.b.adminUpdateSymbol({ params: { symbol: 'BTCUSDT' }, body: { enabled: false, cancelOpenOrders: true, reason: 'tạm ngưng để kiểm tra' } });
    expect(sym).toMatchObject({ adminEnabled: false, enabled: false, openOrders: 0 });
    expect((await t.b.getOrder({ params: { orderId: o.order.id } })).closeReason).toBe('ADMIN');
    await expectApiError(t.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.1', price: '90' } }), 'SYMBOL_DISABLED');
    await admin.b.adminUpdateSymbol({ params: { symbol: 'BTCUSDT' }, body: { enabled: true, reason: 'mở lại sau kiểm tra' } });
    expect((await t.b.exchangeInfo()).symbols.find((s) => s.symbol === 'BTCUSDT')!.enabled).toBe(true);
  });

  it('overview, user search, reconciliation and the append-only audit log', async () => {
    const admin = await h.staff('admin');
    const t = await h.user();
    const ov = await admin.b.adminOverview();
    expect(ov.users.total).toBeGreaterThan(0);
    const found = await admin.b.adminListUsers({ query: { q: t.email.slice(0, 8) } });
    expect(found.items.map((x) => x.id)).toContain(t.id);
    const page1 = await admin.b.adminListUsers({ query: { limit: 2 } });
    const page2 = await admin.b.adminListUsers({ query: { limit: 2, cursor: page1.nextCursor! } });
    expect(page2.items.map((x) => x.id)).not.toContain(page1.items[0]!.id);
    await admin.b.adminUserOrders({ params: { userId: t.id }, query: { open: 'false' } });
    await admin.b.adminUserLedger({ params: { userId: t.id } });
    const run = await admin.b.adminRunReconciliation();
    expect(run.ok).toBe(true);
    expect((await admin.b.adminReconciliationRuns()).items[0]!.id).toBe(run.id);
    expect((await admin.b.adminOverview()).lastReconciliation?.id).toBe(run.id);
    expect((await admin.b.adminAuditLogs({ query: { action: 'RECONCILIATION_RUN' } })).items[0]!.actor?.email).toBe(admin.email);
    await expect(h.env.database.db.execute(sql`UPDATE audit_logs SET reason = 'tampered'`)).rejects.toThrow();
    await expect(h.env.database.db.execute(sql`DELETE FROM audit_logs`)).rejects.toThrow();
  });
});
