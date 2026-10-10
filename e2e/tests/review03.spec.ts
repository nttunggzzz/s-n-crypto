import { expect, signUp, test } from '../fixtures.ts';

// Acceptance checks for docs/antigravity/REVIEW-03 (UI ↔ backend features). Each one fails until its item is done.

/** Channels subscribed since `from` (index into realtime.subscribed), once the page has settled. */
async function settledChannels(page: import('@playwright/test').Page, log: { subscribed: string[] }, from: number): Promise<string[]> {
  await page.waitForTimeout(3_000);
  return [...new Set(log.subscribed.slice(from))];
}

test('giá mọi cặp đi qua MỘT kênh `tickers` / `futures:tickers`, không đăng ký từng ticker:<cặp> (REVIEW-03 A1)', async ({ page, realtime }) => {
  await signUp(page);
  for (const [path, batch] of [
    ['/markets', 'tickers'],
    ['/trade/BTCUSDT', 'tickers'],
    ['/futures/BTCUSDT', 'futures:tickers'],
  ] as const) {
    const from = realtime.subscribed.length;
    await page.goto(path);
    const channels = await settledChannels(page, realtime, from);
    expect(channels, `${path} subscribes ${batch}`).toContain(batch);
    const single = channels.filter((c) => c.startsWith('ticker:') || c.startsWith('futures:ticker:'));
    expect(single.length, `${path}: per-pair ticker channels (${single.join(', ')})`).toBeLessThanOrEqual(2);
    expect(channels.length, `${path}: ${channels.length} channels`).toBeLessThanOrEqual(20);
  }
});

test('trang Giao dịch theo dõi `exchange:status` (Admin dừng sàn / tắt cặp → khóa form ngay, không cần tải lại) (REVIEW-03 A6)', async ({ page, realtime }) => {
  await page.goto('/trade/BTCUSDT');
  expect(await settledChannels(page, realtime, 0)).toContain('exchange:status');
});

test('Futures: đồng hồ funding đếm ngược tới nextFundingTime thật, không phải số cố định (REVIEW-03 A2)', async ({ page }) => {
  await page.goto('/futures/BTCUSDT');
  const countdown = page.getByTestId('funding-countdown');
  await expect(countdown).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
  const mark = (await (await page.request.get('/api/v1/futures/market/mark/BTCUSDT')).json()) as { nextFundingTime: string };
  const expected = Math.round((Date.parse(mark.nextFundingTime) - Date.now()) / 1000);
  const [h, m, s] = (await countdown.innerText()).split(':').map(Number) as [number, number, number];
  expect(Math.abs(h * 3600 + m * 60 + s - expected), 'seconds off').toBeLessThanOrEqual(3);
  const before = await countdown.innerText();
  await expect.poll(() => countdown.innerText(), { timeout: 3_000, message: 'the countdown ticks' }).not.toBe(before);
});

test('Futures: mở bằng mã Spot (PEPEUSDT) chuyển sang hợp đồng 1000PEPEUSDT (REVIEW-03 A4)', async ({ page }) => {
  await page.goto('/futures/PEPEUSDT');
  await expect(page).toHaveURL(/\/futures\/1000PEPEUSDT$/);
});

test('trang Thị trường không có tab "Mới niêm yết" với dữ liệu bịa (REVIEW-03 A3)', async ({ page }) => {
  await page.goto('/markets');
  await expect(page.getByRole('row').nth(5)).toBeVisible();
  await expect(page.getByText('Mới niêm yết')).toHaveCount(0);
});

test('cài đặt sáng/tối và màu tăng/giảm áp dụng ngay khi mở app, không cần vào Cài đặt (REVIEW-03 A8)', async ({ page }) => {
  await signUp(page);
  expect((await page.request.patch('/api/v1/me/preferences', { data: { theme: 'light', upColor: 'RED' } })).ok()).toBe(true);
  await page.goto('/markets');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-color-reversed', 'true');
});

test('coin giá nhỏ (PEPE) không hiện "$0.00" (REVIEW-03 A7)', async ({ page }) => {
  await page.goto('/trade/PEPEUSDT');
  await expect(page.locator('body')).toContainText(/0[,.]0000\d/); // the price itself is shown
  await page.waitForTimeout(2_000);
  await expect(page.locator('body')).not.toContainText(/\$\s?0[.,]00(?!\d)/);
});

test('trang Tài sản xuất được sổ cái ra CSV (REVIEW-03 B1)', async ({ page }) => {
  await signUp(page);
  await page.goto('/assets');
  const download = page.waitForEvent('download');
  await page.getByText(/Xuất CSV/).first().click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
});
