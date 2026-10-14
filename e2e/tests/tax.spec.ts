import { ADMIN_TAX_EXPORT_COLUMNS, TAX_EXPORT_COLUMNS } from '@cex/contracts';
import type { AdminTaxSummary, Balances, ExchangeInfo, TaxProfile, TaxSettings, TaxSummary, TaxWithholding, Trade } from '@cex/contracts';
import { dec, roundUp } from '@cex/core';
import type { Locator, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { apiGet, apiPost, expect, otherBrowser, signUp, signUpStaff, test, toStep } from '../fixtures.ts';

// Acceptance tests for module T (Vietnam tax, test exchange): docs/plans/module-T-huong-dan-code.md §4.
// `page` is the admin (staff, 2FA) session; the trader is a second browser. Tax settings are global on the e2e
// server, so every test puts them back to OFF / no VND rate. Amounts are compared as Decimal strings.
// Needs the UI (account tax page, admin tax page, order-form breakdown) and, for the reports, the T3 endpoints.

const REASON = 'Kiểm thử e2e — thuế';
const RATE = '0.001';

test.afterEach(async ({ page }) => {
  await page.request.patch('/api/v1/admin/tax/settings', { data: { taxMode: 'OFF', taxRate: RATE, taxVndRate: null, reason: REASON } }).catch(() => undefined);
});

async function apiPatch<T>(page: Page, path: string, data: unknown): Promise<T> {
  const r = await page.request.patch(path, { data });
  expect(r.ok(), `PATCH ${path} → ${r.status()} ${await r.text()}`).toBe(true);
  return (await r.json()) as T;
}

/** Test setup through the API (the staff session of `page`). */
const setTax = (admin: Page, patch: { taxMode?: 'OFF' | 'WITHHOLD'; taxRate?: string; taxVndRate?: string | null }) =>
  apiPatch<TaxSettings>(admin, '/api/v1/admin/tax/settings', { ...patch, reason: REASON });

/** A fresh trader (own browser) holding BTC bought through the API. */
async function trader(browser: Parameters<typeof otherBrowser>[0], baseURL: string | undefined): Promise<Page> {
  const user = await otherBrowser(browser, baseURL);
  await signUp(user);
  await apiPost(user, '/api/v1/wallet/faucet');
  await apiPost(user, '/api/v1/orders', { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quoteOrderQty: '2000' });
  return user;
}

const usdt = async (page: Page) => (await apiGet<Balances>(page, '/api/v1/wallet/balances')).items.find((b) => b.asset === 'USDT')!.available;
const lotRules = async (page: Page) => {
  const s = (await apiGet<ExchangeInfo>(page, '/api/v1/market/exchange-info')).symbols.find((x) => x.symbol === 'BTCUSDT')!;
  return { tick: s.tickSize, step: s.stepSize };
};
const sellMarket = (page: Page, quantity: string) => apiPost(page, '/api/v1/orders', { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity });
const lastTrade = async (page: Page) => (await apiGet<{ items: Trade[] }>(page, '/api/v1/trades?pageSize=1')).items[0]!;
const dataValue = async (l: Locator) => (await l.getAttribute('data-value')) ?? '';

const orderForm = (page: Page) => page.locator('form').filter({ has: page.getByRole('button', { name: /^(MUA|BÁN) BTC$/ }) });
const decimalInputs = (form: Locator) => form.locator('input[inputmode="decimal"]');

/** Opens the SELL side of the Limit form and types price + quantity (a limit far above the market: it only rests). */
async function fillSellLimit(page: Page, price: string, quantity: string) {
  await page.goto('/trade/BTCUSDT');
  await page.getByRole('button', { name: /^BÁN BTC$/ }).first().click();
  const form = orderForm(page);
  await expect.poll(async () => Number(await decimalInputs(form).nth(0).inputValue())).toBeGreaterThan(0);
  await decimalInputs(form).nth(0).fill(price);
  await decimalInputs(form).nth(1).fill(quantity);
}

async function csvHeader(page: Page, button: Locator): Promise<string> {
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  return readFileSync((await download.path())!, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)[0]!;
}

test('Admin bật thuế ở trang Thuế → form BÁN hiện khối thuế, tax-amount = roundUp8(gộp × 0,001) (Limit)', async ({ page, browser, baseURL }) => {
  await signUpStaff(page, 'admin');
  const user = await trader(browser, baseURL);
  await user.goto('/trade/BTCUSDT');
  await user.getByRole('button', { name: /^BÁN BTC$/ }).first().click();
  await expect(user.getByTestId('tax-breakdown'), 'thuế đang TẮT: không có khối thuế').toHaveCount(0);

  await page.goto('/admin/tax');
  await expect(page.getByTestId('admin-tax-page')).toBeVisible();
  await page.getByTestId('admin-tax-mode').selectOption('WITHHOLD');
  await page.getByTestId('admin-tax-reason').fill(REASON);
  await page.getByTestId('admin-tax-save').click();
  await expect.poll(async () => (await apiGet<TaxSettings>(page, '/api/v1/admin/tax/settings')).taxMode, 'server phải lưu WITHHOLD').toBe('WITHHOLD');

  const { tick, step } = await lotRules(user);
  const price = toStep(123457.123456, tick);
  const quantity = toStep(0.00123456, step);
  await fillSellLimit(user, price, quantity);
  await expect(user.getByTestId('tax-breakdown')).toBeVisible();
  const gross = dec(price).mul(quantity);
  const tax = roundUp(gross.mul(RATE));
  expect(dec(await dataValue(user.getByTestId('tax-gross'))).toString(), 'giá trị gộp').toBe(gross.toString());
  expect(dec(await dataValue(user.getByTestId('tax-amount'))).toString(), 'thuế ước tính').toBe(tax.toString());
  const fee = dec(await dataValue(user.getByTestId('tax-fee')));
  expect(dec(await dataValue(user.getByTestId('tax-net'))).toString(), 'thực nhận = gộp − phí − thuế').toBe(gross.sub(fee).sub(tax).toString());
  await expect(user.getByTestId('tax-test-label')).toBeVisible();
  await user.context().close();
});

test('Bán MARKET qua form: số dư USDT tăng đúng gộp − phí − thuế; thuế của khớp lệnh = roundUp8(gộp × 0,001)', async ({ page, browser, baseURL }) => {
  await signUpStaff(page, 'admin');
  await setTax(page, { taxMode: 'WITHHOLD', taxRate: RATE });
  const user = await trader(browser, baseURL);
  const { step } = await lotRules(user);
  const quantity = toStep(0.00555555, step);
  const before = await usdt(user);

  await user.goto('/trade/BTCUSDT');
  await user.getByRole('button', { name: /^BÁN BTC$/ }).first().click();
  const form = orderForm(user);
  const panel = user.locator('div').filter({ has: form }).filter({ hasText: 'Khả dụng' }).last();
  await panel.getByRole('button', { name: 'Thị trường', exact: true }).click();
  await decimalInputs(form).first().fill(quantity);
  await expect(user.getByTestId('tax-breakdown')).toBeVisible();
  await form.getByRole('button', { name: /^BÁN BTC$/ }).click();
  await user.getByTestId('order-confirm').click();

  await expect.poll(async () => (await lastTrade(user)).side).toBe('SELL');
  const t = await lastTrade(user);
  expect(t.tax, 'Trade.tax').toBe(roundUp(dec(t.quoteQty).mul(RATE)).toFixed(8));
  expect(dec(t.tax).gt(0)).toBe(true);
  const after = await usdt(user);
  expect(dec(after).sub(before).toString(), 'USDT nhận về').toBe(dec(t.quoteQty).sub(t.fee).sub(t.tax).toString());
  await user.context().close();
});

test('Trang Thuế: có dòng khấu trừ, tổng năm = thuế vừa trích, CSV có đúng tiêu đề TAX_EXPORT_COLUMNS', async ({ page, browser, baseURL }) => {
  await signUpStaff(page, 'admin');
  await setTax(page, { taxMode: 'WITHHOLD', taxRate: RATE });
  const user = await trader(browser, baseURL);
  const { step } = await lotRules(user);
  await sellMarket(user, toStep(0.00333333, step));
  const trade = await lastTrade(user);
  const records = await apiGet<{ items: TaxWithholding[] }>(user, '/api/v1/account/tax/withholdings');
  expect(records.items).toHaveLength(1);
  expect(records.items[0]!.taxAmount).toBe(trade.tax);

  await user.goto('/account/tax');
  await expect(user.getByTestId('account-tax-page')).toBeVisible();
  await expect(user.getByTestId('tax-withholding-row')).toHaveCount(1);
  await expect(user.getByTestId('tax-withholding-row').first()).toHaveAttribute('data-trade-id', trade.id);
  const summary = await apiGet<TaxSummary>(user, '/api/v1/account/tax/summary');
  expect(summary.totals.taxAmount).toBe(trade.tax);
  expect(dec(await dataValue(user.getByTestId('tax-year-total'))).toString(), 'tổng thuế năm hiển thị').toBe(dec(trade.tax).toString());
  await expect(user.getByTestId('tax-month-row')).toHaveCount(12);
  await expect(user.getByTestId('tax-category-select').locator('option')).toHaveCount(3);

  expect(await csvHeader(user, user.getByTestId('tax-export-csv'))).toBe(TAX_EXPORT_COLUMNS.join(','));
  await user.context().close();
});

test('Đổi phân loại sang DOMESTIC_ORG → bán tiếp không thêm dòng khấu trừ và Trade.tax = 0', async ({ page, browser, baseURL }) => {
  await signUpStaff(page, 'admin');
  await setTax(page, { taxMode: 'WITHHOLD', taxRate: RATE });
  const user = await trader(browser, baseURL);
  const { step } = await lotRules(user);
  await sellMarket(user, toStep(0.002, step));
  expect((await apiGet<{ items: TaxWithholding[] }>(user, '/api/v1/account/tax/withholdings')).items).toHaveLength(1);

  await user.goto('/account/tax');
  await user.getByTestId('tax-category-select').selectOption('DOMESTIC_ORG');
  await expect.poll(async () => (await apiGet<TaxProfile>(user, '/api/v1/account/tax/profile')).category, 'server phải lưu phân loại').toBe('DOMESTIC_ORG');

  await sellMarket(user, toStep(0.002, step));
  const t = await lastTrade(user);
  expect(t.side).toBe('SELL');
  expect(dec(t.tax).toString(), 'tổ chức trong nước không bị khấu trừ').toBe('0');
  expect((await apiGet<{ items: TaxWithholding[] }>(user, '/api/v1/account/tax/withholdings')).items, 'không thêm bản ghi').toHaveLength(1);
  await user.reload();
  await expect(user.getByTestId('tax-withholding-row')).toHaveCount(1);
  await user.context().close();
});

test('Admin tắt thuế ở trang Thuế → form BÁN không còn khối thuế (không cần tải lại)', async ({ page, browser, baseURL }) => {
  await signUpStaff(page, 'admin');
  await setTax(page, { taxMode: 'WITHHOLD', taxRate: RATE });
  const user = await trader(browser, baseURL);
  const { tick, step } = await lotRules(user);
  await fillSellLimit(user, toStep(123457.12, tick), toStep(0.00123456, step));
  await expect(user.getByTestId('tax-breakdown')).toBeVisible();

  await page.goto('/admin/tax');
  await page.getByTestId('admin-tax-mode').selectOption('OFF');
  await page.getByTestId('admin-tax-reason').fill(REASON);
  await page.getByTestId('admin-tax-save').click();
  await expect.poll(async () => (await apiGet<TaxSettings>(page, '/api/v1/admin/tax/settings')).taxMode).toBe('OFF');
  await expect(user.getByTestId('tax-breakdown')).toHaveCount(0);
  await user.context().close();
});

test('Tỷ giá VND: chưa đặt thì không có tax-vnd; admin đặt tỷ giá thì có, = roundUp(thuế × tỷ giá, 0)', async ({ page, browser, baseURL }) => {
  await signUpStaff(page, 'admin');
  await setTax(page, { taxMode: 'WITHHOLD', taxRate: RATE, taxVndRate: null });
  const user = await trader(browser, baseURL);
  const { tick, step } = await lotRules(user);
  const price = toStep(123457.12, tick);
  const quantity = toStep(0.00123456, step);
  await fillSellLimit(user, price, quantity);
  await expect(user.getByTestId('tax-breakdown')).toBeVisible();
  await expect(user.getByTestId('tax-vnd'), 'chưa có tỷ giá: không bịa số VND').toHaveCount(0);

  await page.goto('/admin/tax');
  await page.getByTestId('admin-tax-vnd-rate').fill('26350');
  await page.getByTestId('admin-tax-reason').fill(REASON);
  await page.getByTestId('admin-tax-save').click();
  await expect.poll(async () => (await apiGet<TaxSettings>(page, '/api/v1/admin/tax/settings')).taxVndRate).toBe('26350');

  const tax = roundUp(dec(price).mul(quantity).mul(RATE));
  await expect(user.getByTestId('tax-vnd')).toBeVisible();
  expect(dec(await dataValue(user.getByTestId('tax-vnd'))).toString()).toBe(roundUp(tax.mul('26350'), 0).toString());
  await user.context().close();
});

test('Form MUA không bao giờ có khối thuế, kể cả khi thuế đang bật', async ({ page, browser, baseURL }) => {
  await signUpStaff(page, 'admin');
  await setTax(page, { taxMode: 'WITHHOLD', taxRate: RATE });
  const user = await trader(browser, baseURL);
  const { step } = await lotRules(user);
  await user.goto('/trade/BTCUSDT');
  await user.getByRole('button', { name: /^MUA BTC$/ }).first().click();
  const form = orderForm(user);
  await expect.poll(async () => Number(await decimalInputs(form).nth(0).inputValue())).toBeGreaterThan(0);
  await decimalInputs(form).nth(1).fill(toStep(0.00123456, step));
  await expect(form.getByRole('button', { name: /^MUA BTC$/ })).toBeVisible();
  await expect(user.getByTestId('tax-breakdown')).toHaveCount(0);
  await user.context().close();
});

test('Admin: tổng hợp thuế kỳ khớp API, có dòng theo cặp, CSV đúng tiêu đề, không có nút chốt/nộp', async ({ page, browser, baseURL }) => {
  await signUpStaff(page, 'admin');
  await setTax(page, { taxMode: 'WITHHOLD', taxRate: RATE });
  const user = await trader(browser, baseURL);
  const { step } = await lotRules(user);
  await sellMarket(user, toStep(0.00333333, step));
  const tax = (await lastTrade(user)).tax;

  const period = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
  const summary = await apiGet<AdminTaxSummary>(page, `/api/v1/admin/tax/summary?period=${period}`);
  expect(dec(summary.totals.taxAmount).gte(tax), 'tổng kỳ gồm thuế vừa trích').toBe(true);

  await page.goto('/admin/tax');
  await expect(page.getByTestId('admin-tax-period')).toBeVisible();
  await expect.poll(async () => dec((await dataValue(page.getByTestId('admin-tax-total'))) || '0').toString()).toBe(dec(summary.totals.taxAmount).toString());
  await expect(page.locator('[data-testid="admin-tax-by-symbol-row"][data-symbol="BTCUSDT"]')).toHaveCount(1);
  expect(await csvHeader(page, page.getByTestId('admin-tax-export-csv'))).toBe(ADMIN_TAX_EXPORT_COLUMNS.join(','));
  await expect(page.getByRole('button', { name: /chốt|nộp|phát hành/i }), 'sàn thử nghiệm: không có chốt sổ / nộp thuế').toHaveCount(0);
  await user.context().close();
});
