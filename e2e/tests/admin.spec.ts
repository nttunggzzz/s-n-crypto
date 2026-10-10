import { apiGet, apiPost, expect, otherBrowser, signUp, signUpStaff, test } from '../fixtures.ts';
import type { Page } from '@playwright/test';

// Acceptance checks for docs/antigravity/PROMPT-08: the admin web app manages the exchange web app's users.
// Two browsers at once — the admin (apps/admin at /admin/) acts, the user (apps/exchange at /) sees the
// effect WITHOUT reloading. Both apps are served by the same server, so they share sign-in and /ws.
// Every test fails until apps/admin exists and its item is done.

const REASON = 'Kiểm thử e2e — thao tác quản trị';

// never leave the shared e2e exchange halted for the next tests (runs even when a test times out;
// `page` is the staff session in every test here — a support account just gets 403, which is fine)
test.afterEach(async ({ page }) => {
  await page.request.post('/api/v1/admin/exchange/resume', { data: { reason: REASON, confirm: 'RESUME' } }).catch(() => undefined);
});

/** Fills the admin app's shared confirmation dialog (reason + typed phrase for dangerous actions) and submits. */
async function confirmDialog(admin: Page, opts: { phrase?: string; reason?: string } = {}) {
  await admin.getByTestId('confirm-reason').fill(opts.reason ?? REASON);
  if (opts.phrase) await admin.getByTestId('confirm-phrase').fill(opts.phrase);
  await admin.getByTestId('confirm-submit').click();
}

/** Opens a user's page in the admin app by searching their email, as staff would. */
async function openUser(admin: Page, email: string) {
  await admin.goto('/admin/users');
  await admin.getByTestId('admin-user-search').fill(email);
  const row = admin.getByTestId('admin-user-row').filter({ hasText: email });
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(admin).toHaveURL(/\/admin\/users\/\d+$/);
}

test('nhân sự thấy nút "Quản trị" trên web sàn và vào được web admin; người dùng thường không thấy, mở /admin/ bị từ chối', async ({ page, browser, baseURL }) => {
  await signUpStaff(page, 'support');
  await page.goto('/markets');
  const link = page.getByTestId('nav-admin');
  await expect(link).toHaveAttribute('href', '/admin/');
  await link.click();
  await expect(page).toHaveURL(/\/admin\/$/);
  await expect(page.getByTestId('admin-overview')).toBeVisible();
  // and back: the admin app links to the exchange
  await expect(page.getByTestId('admin-open-exchange')).toHaveAttribute('href', '/');

  const user = await otherBrowser(browser, baseURL);
  await signUp(user);
  await user.goto('/markets');
  await expect(user.getByRole('row').nth(3)).toBeVisible();
  await expect(user.getByTestId('nav-admin')).toHaveCount(0);
  await user.goto('/admin/');
  await expect(user.getByTestId('admin-no-access')).toBeVisible();
  await user.context().close();
});

test('Admin dừng sàn khẩn cấp → trang Giao dịch của người dùng khóa đặt lệnh ngay (không tải lại); mở lại → hết khóa', async ({ page, browser, baseURL }) => {
  await signUpStaff(page, 'admin');
  const user = await otherBrowser(browser, baseURL);
  await signUp(user);
  await user.goto('/trade/BTCUSDT');
  await expect(user.getByTestId('trade-block-reason')).toHaveCount(0);

  try {
    await page.goto('/admin/');
    await page.getByTestId('admin-halt-open').click();
    await confirmDialog(page, { phrase: 'HALT' });
    await expect(page.getByTestId('admin-trading-state')).toHaveAttribute('data-halted', 'true');
    await expect(user.getByTestId('trade-block-reason'), 'the user page locks itself from exchange:status').toBeVisible({ timeout: 5_000 });

    await page.getByTestId('admin-resume-open').click();
    await confirmDialog(page, { phrase: 'RESUME' });
    await expect(page.getByTestId('admin-trading-state')).toHaveAttribute('data-halted', 'false');
    await expect(user.getByTestId('trade-block-reason')).toHaveCount(0, { timeout: 5_000 });
  } finally {
    await user.context().close();
  }
});

test('Admin cộng 500 USDT cho người dùng → ví của người dùng hiện ngay; thao tác có trong Nhật ký quản trị', async ({ page, browser, baseURL }) => {
  await signUpStaff(page, 'admin');
  const user = await otherBrowser(browser, baseURL);
  const u = await signUp(user);
  await user.goto('/assets');
  await expect(user.getByTestId('spot-available-USDT')).toBeVisible();

  await openUser(page, u.email);
  await page.getByTestId('admin-adjust-open').click();
  const asset = page.getByTestId('adjust-asset');
  if ((await asset.evaluate((el) => el.tagName)) === 'SELECT') await asset.selectOption('USDT');
  else await asset.fill('USDT');
  await page.getByTestId('adjust-amount').fill('500');
  await expect(page.getByTestId('adjust-preview'), 'before → after, shown before confirming').toContainText('500');
  await confirmDialog(page);

  // the user's wallet updates from the `user` channel (balance event), no reload
  await expect(user.getByTestId('spot-available-USDT')).toContainText(/500(,0+)?/, { timeout: 5_000 });
  const balances = await apiGet<{ items: Array<{ asset: string; available: string }> }>(user, '/api/v1/wallet/balances');
  expect(Number(balances.items.find((b) => b.asset === 'USDT')?.available)).toBe(500);

  await page.goto('/admin/audit-logs');
  await expect(page.getByTestId('audit-row').filter({ hasText: REASON }).first()).toBeVisible();
  await user.context().close();
});

test('Admin khóa tài khoản → tab của người dùng bị đăng xuất; mở khóa → đăng nhập lại được', async ({ page, browser, baseURL }) => {
  test.setTimeout(90_000);
  await signUpStaff(page, 'admin');
  const user = await otherBrowser(browser, baseURL);
  const u = await signUp(user);
  await user.goto('/assets');
  await expect(user.getByTestId('spot-available-USDT')).toBeVisible();

  await openUser(page, u.email);
  await page.getByTestId('admin-lock-open').click();
  await confirmDialog(page);
  await expect(page.getByTestId('admin-user-status')).toHaveAttribute('data-status', 'locked');

  // the server ends the user's sessions and closes their realtime socket (code 4401, ≤ 30 s) → the app goes to /login
  await expect(user).toHaveURL(/\/login/, { timeout: 45_000 });
  const refused = await user.request.post('/api/v1/auth/login', { data: { email: u.email, password: u.password } });
  expect(refused.status()).toBe(403);

  await page.getByTestId('admin-unlock-open').click();
  await confirmDialog(page);
  await expect(page.getByTestId('admin-user-status')).toHaveAttribute('data-status', 'active');
  await apiPost(user, '/api/v1/auth/login', { email: u.email, password: u.password });
  await user.context().close();
});

test('nhân viên hỗ trợ (support) chỉ xem: không có nút cộng tiền, khóa, dừng sàn', async ({ page, browser, baseURL }) => {
  await signUpStaff(page, 'support');
  const user = await otherBrowser(browser, baseURL);
  const u = await signUp(user);
  await user.context().close();

  await page.goto('/admin/');
  await expect(page.getByTestId('admin-overview')).toBeVisible();
  await expect(page.getByTestId('admin-halt-open')).toHaveCount(0);
  await openUser(page, u.email);
  await expect(page.getByTestId('admin-user-status')).toHaveAttribute('data-status', 'active');
  await expect(page.getByTestId('admin-adjust-open')).toHaveCount(0);
  await expect(page.getByTestId('admin-lock-open')).toHaveCount(0);
});
