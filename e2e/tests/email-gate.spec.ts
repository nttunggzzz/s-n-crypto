import { apiGet, emailLink, expect, expectCleanText, newAccount, test } from '../fixtures.ts';
import type { Balances } from '@cex/contracts';
import type { Page } from '@playwright/test';

// docs/reports/2026-10-12-ra-soat-ui-lan-3.md K-01 (and lan-2 N-02, N-03): the switch for "must verify the email" is the
// server's (REQUIRE_EMAIL_VERIFICATION → GET /api/v1/config.emailVerificationRequired). This stack (:5190) requires it;
// the host-mode stack (:5191, tests/host-mode/) does not and checks that nothing about it shows. Here: a server that
// requires verification must give the user a way to verify, and the lock must lift without a reload.

/** Signs up through the API and stays unverified (the cookies land in the page's context). */
async function signUpUnverified(page: Page) {
  const acc = newAccount();
  const reg = await page.request.post('/api/v1/auth/register', { data: { email: acc.email, password: acc.password, name: acc.name } });
  expect(reg.status(), await reg.text()).toBe(201);
  return acc;
}
const usdt = async (page: Page) => Number((await apiGet<Balances>(page, '/api/v1/wallet/balances')).items.find((b) => b.asset === 'USDT')?.available ?? 0);

test('server bắt xác minh email: người chưa xác minh thấy nút gửi email xác minh ở Tài sản và ở form lệnh', async ({ page }) => {
  expect((await (await page.request.get('/api/v1/config')).json()) as { emailVerificationRequired: boolean }).toMatchObject({ emailVerificationRequired: true });
  await signUpUnverified(page);

  await page.goto('/assets');
  // the faucet is locked, and the page says how to unlock it — not a button that looks usable and then fails with 403
  const resend = page.getByRole('button', { name: /xác minh email/i });
  await expect(resend.first(), 'Tài sản: phải có nút gửi email xác minh').toBeVisible();
  await expect(page.getByRole('button', { name: /^Nạp ngay/ })).toHaveCount(0);

  await page.goto('/trade/BTCUSDT');
  await expect(page.getByRole('button', { name: /xác minh email/i }).first(), 'form lệnh: phải có nút gửi email xác minh').toBeVisible();
  await expect(page.locator('button[type="submit"]').filter({ hasText: /^MUA BTC$/ }), 'không còn nút MUA bấm được rồi báo lỗi').toHaveCount(0);
  await expectCleanText(page);
});

test('bấm gửi email xác minh → có thư mới; mở link ở tab khác → tab gốc tự mở khóa, nạp được tiền ảo (không tải lại)', async ({ page, context }) => {
  const acc = await signUpUnverified(page);
  await page.goto('/assets');
  const first = await emailLink(acc.email, 'verify-email'); // the sign-up email
  const sent = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/resend-verification') && r.request().method() === 'POST');
  await page.getByRole('button', { name: /xác minh email/i }).first().click();
  expect((await sent).ok()).toBe(true);

  // the link is opened in another tab (the user's mail app / another browser tab)
  const mailTab = await context.newPage();
  await mailTab.goto(first);
  await expect(mailTab.getByText('Xác minh email thành công')).toBeVisible();

  // the first tab was not reloaded: the faucet must unlock by itself
  await page.bringToFront();
  const claim = page.getByRole('button', { name: /^Nạp ngay/ });
  await expect(claim, 'tab gốc phải tự mở khóa sau khi xác minh ở tab khác').toBeEnabled();
  await claim.click();
  await expect.poll(() => usdt(page)).toBe(10000);
  await expectCleanText(page);
});
