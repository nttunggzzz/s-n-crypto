import type { AccountTradingStats, Balances, ExchangeInfo, TaxSettings, Trade } from '@cex/contracts';
import { dec } from '@cex/core';
import type { Locator, Page } from '@playwright/test';
import { apiGet, apiPost, expect, expectCleanText, otherBrowser, signUp, signUpStaff, test, toStep } from '../fixtures.ts';

// Acceptance tests for review 8, S-14 (docs/antigravity/PROMPT-17): the profile tab of /settings shows the user's trading
// volume (today / 7 days / 30 days) and the tax already WITHHELD this month, from GET /api/v1/account/stats
// (contracts README §17). Numbers are compared as Decimal strings. Tax is a global setting of the e2e server:
// every test that changes it puts it back to OFF.

const REASON = 'Kiểm thử e2e — hồ sơ người dùng (rà soát 8)';
const RATE = '0.001';

test.afterEach(async ({ page }) => {
  await page.request.patch('/api/v1/admin/tax/settings', { data: { taxMode: 'OFF', taxRate: RATE, taxVndRate: null, reason: REASON } }).catch(() => undefined);
});

async function setTax(admin: Page, taxMode: 'OFF' | 'WITHHOLD') {
  const r = await admin.request.patch('/api/v1/admin/tax/settings', { data: { taxMode, taxRate: RATE, reason: REASON } });
  expect(r.ok(), `PATCH admin/tax/settings → ${r.status()} ${await r.text()}`).toBe(true);
  return (await r.json()) as TaxSettings;
}

/** Waits for the element and returns its `data-value` (a clear failure when the element or the attribute is missing). */
async function dataValue(l: Locator, what: string): Promise<string> {
  await expect(l, `${what}: phần tử phải hiển thị`).toBeVisible();
  await expect(l, `${what}: thiếu thuộc tính data-value (số liệu chưa tải xong hoặc không có)`).toHaveAttribute('data-value', /\d/);
  return (await l.getAttribute('data-value', { timeout: 5_000 }))!;
}
const expectDec = (actual: string, expected: string, what: string) => expect(dec(actual).toFixed(8), what).toBe(dec(expected).toFixed(8));

const trades = (page: Page) => apiGet<{ items: Trade[] }>(page, '/api/v1/trades?symbol=BTCUSDT');
const stepOf = async (page: Page) => (await apiGet<ExchangeInfo>(page, '/api/v1/market/exchange-info')).symbols.find((s) => s.symbol === 'BTCUSDT')!.stepSize;

/** A fresh trader (own browser) with USDT from the faucet and BTC bought through the API. */
async function trader(browser: Parameters<typeof otherBrowser>[0], baseURL: string | undefined): Promise<Page> {
  const user = await otherBrowser(browser, baseURL);
  await signUp(user);
  await apiPost(user, '/api/v1/wallet/faucet');
  await apiPost(user, '/api/v1/orders', { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quoteOrderQty: '2000' });
  await expect.poll(async () => dec((await apiGet<Balances>(user, '/api/v1/wallet/balances')).items.find((b) => b.asset === 'BTC')?.total ?? '0').gt(0)).toBe(true);
  return user;
}

test('Hồ sơ: MUA 100 USDT → profile-volume-today / 7d / 30d = account/stats = tổng quoteQty các lần khớp', async ({ page }) => {
  await signUp(page);
  await apiPost(page, '/api/v1/wallet/faucet');
  await apiPost(page, '/api/v1/orders', { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quoteOrderQty: '100' });

  // what the server stored: the volume is exactly the sum of this user's fills
  const fills = (await trades(page)).items;
  expect(fills.length, 'lệnh MUA phải khớp').toBeGreaterThan(0);
  const traded = fills.reduce((sum, t) => sum.add(t.quoteQty), dec('0'));
  const stats = await apiGet<AccountTradingStats>(page, '/api/v1/account/stats');
  expect(dec(stats.volume.today.total).toFixed(8), 'volume.today.total = Σ quoteQty').toBe(traded.toFixed(8));
  expect(dec(stats.volume.today.spot).toFixed(8)).toBe(traded.toFixed(8));
  expect(dec(stats.volume.today.futures).isZero(), 'chưa giao dịch Futures').toBe(true);
  expect(stats.volume.today.fills).toBe(fills.length);

  // what the user sees
  await page.goto('/settings');
  await expect(page.getByText('Hoạt động giao dịch').first(), 'khối "Hoạt động giao dịch" ở tab hồ sơ').toBeVisible();
  expectDec(await dataValue(page.getByTestId('profile-volume-today'), 'Khối lượng hôm nay'), stats.volume.today.total, 'profile-volume-today = volume.today.total');
  expectDec(await dataValue(page.getByTestId('profile-volume-7d'), 'Khối lượng 7 ngày'), stats.volume.last7d.total, 'profile-volume-7d = volume.last7d.total');
  expectDec(await dataValue(page.getByTestId('profile-volume-30d'), 'Khối lượng 30 ngày'), stats.volume.last30d.total, 'profile-volume-30d = volume.last30d.total');
  await expect(page.locator('body'), 'dòng phụ "Spot … · Futures … · N lần khớp"').toContainText(/lần khớp/);
  await expectCleanText(page);
});

test('Hồ sơ: thuế đã khấu trừ tháng này = Trade.tax của lần bán; chữ "đã khấu trừ", không bao giờ "cần đóng" hay "phải nộp"', async ({ page, browser, baseURL }) => {
  await signUpStaff(page, 'admin');
  await setTax(page, 'WITHHOLD');
  const user = await trader(browser, baseURL);
  await apiPost(user, '/api/v1/orders', { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: toStep(0.003, await stepOf(user)) });

  const sell = (await trades(user)).items.find((t) => t.side === 'SELL')!;
  expect(dec(sell.tax).gt(0), 'thuế đang bật: lần bán phải bị khấu trừ').toBe(true);
  const stats = await apiGet<AccountTradingStats>(user, '/api/v1/account/stats');
  expect(dec(stats.tax.thisMonth.withheldAmount).toFixed(8), 'server: tax.thisMonth.withheldAmount = Trade.tax').toBe(dec(sell.tax).toFixed(8));
  expect(stats.tax.thisMonth.withheldCount).toBe(1);

  await user.goto('/settings');
  expectDec(await dataValue(user.getByTestId('profile-tax-month'), 'Thuế đã khấu trừ tháng này'), stats.tax.thisMonth.withheldAmount, 'profile-tax-month = tax.thisMonth.withheldAmount');

  const [year, month] = stats.tax.thisMonth.month.split('-');
  const text = await user.locator('body').innerText();
  expect(text, 'nhãn nói rõ tháng MM/YYYY').toContain(`${month}/${year}`);
  expect(text, 'thuế là "đã khấu trừ"').toMatch(/đã khấu trừ/i);
  expect(text, 'câu giải thích: trừ thẳng vào tiền bán').toMatch(/trừ thẳng vào tiền bán/i);
  const lower = text.toLowerCase();
  for (const bad of ['cần đóng', 'phải nộp']) expect(lower, `trang hồ sơ không được viết "${bad}" (thuế đã bị trừ ngay khi bán)`).not.toContain(bad);

  // "Xem chi tiết thuế" leads to the tax page
  await user.getByRole('link', { name: /Xem chi tiết thuế/i }).or(user.getByRole('button', { name: /Xem chi tiết thuế/i })).first().click();
  await expect(user).toHaveURL(/\/account\/tax$/);
  await user.context().close();
});

test('Hồ sơ: sàn tắt thuế → "Sàn đang tắt thuế"; tổ chức trong nước → "tự kê khai — sàn không khấu trừ", thuế tháng này bằng 0', async ({ page, browser, baseURL }) => {
  await signUpStaff(page, 'admin');
  const user = await otherBrowser(browser, baseURL);
  await signUp(user);

  // tax OFF
  await setTax(page, 'OFF');
  await user.goto('/settings');
  expect(dec(await dataValue(user.getByTestId('profile-tax-month'), 'Thuế tháng này (tắt)')).isZero(), 'chưa bán gì: thuế tháng này = 0').toBe(true);
  await expect(user.locator('body')).toContainText(/Sàn đang tắt thuế/i);

  // tax ON but the user declared as a domestic organisation: nothing is withheld
  await setTax(page, 'WITHHOLD');
  const put = await user.request.put('/api/v1/account/tax/profile', { data: { category: 'DOMESTIC_ORG' } });
  expect(put.ok(), `PUT tax/profile → ${put.status()} ${await put.text()}`).toBe(true);
  expect((await apiGet<AccountTradingStats>(user, '/api/v1/account/stats')).tax.category).toBe('DOMESTIC_ORG');
  await user.goto('/settings');
  expect(dec(await dataValue(user.getByTestId('profile-tax-month'), 'Thuế tháng này (DOMESTIC_ORG)')).isZero()).toBe(true);
  await expect(user.locator('body')).toContainText(/tự kê khai/i);
  await expect(user.locator('body')).toContainText(/không khấu trừ/i);
  expect((await user.locator('body').innerText()).toLowerCase()).not.toContain('chưa phát sinh');
  await user.context().close();
});
