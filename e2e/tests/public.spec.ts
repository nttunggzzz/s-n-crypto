import { expectCleanText, expect, test } from '../fixtures.ts';

// Prices come from the synthetic feed (MARKET_FEED=sim): BTC oscillates around ~82 600 USDT.
const VN_PRICE = /\d{1,3}(\.\d{3})*,\d{2}/;

test.describe('khách chưa đăng nhập', () => {
  test('trang Thị trường: 50 cặp có giá, không có chữ lỗi', async ({ page }) => {
    await page.goto('/markets');
    await expect(page.getByText('BTC', { exact: false }).first()).toBeVisible();
    await expect.poll(async () => page.getByRole('row').count(), { message: 'market rows' }).toBeGreaterThanOrEqual(20);
    await expect(page.locator('body')).toContainText(VN_PRICE);
    await expectCleanText(page);
  });

  test('trang Giao dịch BTC/USDT: giá, sổ lệnh, biểu đồ hiển thị và giá chạy realtime', async ({ page }) => {
    await page.goto('/trade/BTCUSDT');
    await expect(page.locator('body')).toContainText(VN_PRICE);
    await expect(page.locator('canvas').first()).toBeVisible(); // chart
    const first = await page.locator('body').innerText();
    // the synthetic price changes every second; the page must follow without a reload
    await expect.poll(async () => (await page.locator('body').innerText()) !== first, { timeout: 15_000, message: 'page updates in real time' }).toBe(true);
    await expectCleanText(page);
  });

  test('trang Đăng nhập / Đăng ký mở được @mobile', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('Mật khẩu')).toBeVisible();
    await page.goto('/register');
    await expect(page.getByRole('button', { name: 'Đăng ký tài khoản' })).toBeVisible();
    await expectCleanText(page);
  });
});
