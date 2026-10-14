import { expect, signUp, test } from '../fixtures.ts';
import type { Page } from '@playwright/test';

// docs/antigravity/PROMPT-13: while the server sends no real email (publicConfig.emailDelivery = 'log' — the live
// exchange, npm run dev and both e2e stacks), every feature that needs one is hidden; with 'sent' it comes back by itself.

/** Answers GET /api/v1/config as the server would with a real mail transport. */
async function pretendEmailIsSent(page: Page) {
  await page.route('**/api/v1/config', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), emailDelivery: 'sent' } });
  });
}

test.describe('server không gửi email thật (emailDelivery = log)', () => {
  test('Đăng nhập không có "Quên mật khẩu?"; /forgot-password báo tạm tắt và không gửi yêu cầu', async ({ page }) => {
    expect(((await (await page.request.get('/api/v1/config')).json()) as { emailDelivery: string }).emailDelivery).toBe('log');
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true }).or(page.locator('form button[type="submit"]')).first()).toBeVisible();
    await expect(page.getByTestId('login-forgot-password')).toHaveCount(0);

    const asked: string[] = [];
    page.on('request', (r) => r.url().includes('/api/v1/auth/forgot-password') && asked.push(r.method()));
    await page.goto('/forgot-password');
    await expect(page.getByTestId('forgot-password-disabled')).toBeVisible();
    await expect(page.getByTestId('forgot-password-disabled')).toContainText(/quản trị viên/i);
    expect(asked).toEqual([]);
  });

  test('Cài đặt → Bảo mật không có "Mã chống lừa đảo"', async ({ page }) => {
    await signUp(page);
    await page.goto('/settings');
    await page.getByRole('button', { name: /Bảo mật/ }).first().click();
    await expect(page.getByText(/Xác thực hai yếu tố|2FA/).first()).toBeVisible(); // the page is there
    await expect(page.getByTestId('settings-anti-phishing')).toHaveCount(0);
  });
});

test.describe('server gửi email thật (emailDelivery = sent)', () => {
  test('các tính năng cần email tự hiện lại, không sửa code', async ({ page }) => {
    await pretendEmailIsSent(page);
    await page.goto('/login');
    await expect(page.getByTestId('login-forgot-password')).toBeVisible();
    await page.goto('/forgot-password');
    await expect(page.getByTestId('forgot-password-disabled')).toHaveCount(0);

    await signUp(page);
    await page.goto('/settings');
    await page.getByRole('button', { name: /Bảo mật/ }).first().click();
    await expect(page.getByTestId('settings-anti-phishing')).toBeVisible();
  });
});
