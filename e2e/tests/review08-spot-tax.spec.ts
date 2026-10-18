import type { Balances, ExchangeInfo, TaxSettings } from '@cex/contracts';
import { dec, roundUp } from '@cex/core';
import type { Locator, Page } from '@playwright/test';
import { apiGet, apiPost, expect, otherBrowser, signUp, signUpStaff, test, toStep } from '../fixtures.ts';

// Acceptance tests for review 8, S-03 (docs/antigravity/PROMPT-17): under "Phí giao dịch" the Spot order form always has a
// tax line `spot-tax-line` that says what the exchange will do with tax, with the rate taken from the server (never hard-coded).
// `page` is the admin (staff, 2FA) session, the trader is a second browser; tax settings are global on the e2e server, so every
// test puts them back to OFF afterwards (same pattern as tax.spec.ts, which must stay green).

const REASON = 'Kiểm thử e2e — thuế trên form Spot (rà soát 8)';
const RATE = '0.0025'; // 0,25 %: not the default 0,1 %, so a hard-coded rate in the UI is caught

test.afterEach(async ({ page }) => {
  await page.request.patch('/api/v1/admin/tax/settings', { data: { taxMode: 'OFF', taxRate: '0.001', taxVndRate: null, reason: REASON } }).catch(() => undefined);
});

async function setTax(admin: Page, patch: { taxMode?: 'OFF' | 'WITHHOLD'; taxRate?: string }) {
  const r = await admin.request.patch('/api/v1/admin/tax/settings', { data: { ...patch, reason: REASON } });
  expect(r.ok(), `PATCH admin/tax/settings → ${r.status()} ${await r.text()}`).toBe(true);
  return (await r.json()) as TaxSettings;
}

/** A fresh trader (own browser) holding BTC bought through the API. */
async function trader(browser: Parameters<typeof otherBrowser>[0], baseURL: string | undefined): Promise<Page> {
  const user = await otherBrowser(browser, baseURL);
  await signUp(user);
  await apiPost(user, '/api/v1/wallet/faucet');
  await apiPost(user, '/api/v1/orders', { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quoteOrderQty: '2000' });
  await expect.poll(async () => dec((await apiGet<Balances>(user, '/api/v1/wallet/balances')).items.find((b) => b.asset === 'BTC')?.total ?? '0').gt(0)).toBe(true);
  return user;
}

const lotRules = async (page: Page) => {
  const info = await apiGet<ExchangeInfo>(page, '/api/v1/market/exchange-info');
  const s = info.symbols.find((x) => x.symbol === 'BTCUSDT')!;
  return { tick: s.tickSize, step: s.stepSize, feeRate: info.feeRate };
};

const orderForm = (page: Page) => page.locator('form').filter({ has: page.getByRole('button', { name: /^(MUA|BÁN) BTC$/ }) });
const decimalInputs = (form: Locator) => form.locator('input[inputmode="decimal"]');
const dataValue = async (l: Locator) => (await l.getAttribute('data-value', { timeout: 5_000 })) ?? '';
/** 0.0025 → "0,25" (the percentage as the vi-VN form writes it). */
const percent = (rate: string) => dec(rate).mul(100).toString().replace('.', ',');
const percentRegex = (rate: string) => new RegExp(`${percent(rate)}\\s?%`);

async function openSide(page: Page, side: 'MUA' | 'BÁN') {
  await page.goto('/trade/BTCUSDT');
  await page.getByRole('button', { name: new RegExp(`^${side} BTC$`) }).first().click();
  const form = orderForm(page);
  await expect.poll(async () => Number(await decimalInputs(form).nth(0).inputValue())).toBeGreaterThan(0); // the Limit price is prefilled
  return form;
}

test('Thuế BẬT: form MUA luôn có spot-tax-line "chỉ khấu trừ khi bán" kèm tỉ lệ thuế lấy từ server; phí ghi kèm tỉ lệ; không có tax-breakdown', async ({ page, browser, baseURL }) => {
  await signUpStaff(page, 'admin');
  await setTax(page, { taxMode: 'WITHHOLD', taxRate: RATE });
  const user = await trader(browser, baseURL);
  const { step, feeRate } = await lotRules(user);

  const form = await openSide(user, 'MUA');
  // "luôn có": the line is there before anything is typed
  const line = user.getByTestId('spot-tax-line');
  await expect(line).toBeVisible();
  await expect(line).toContainText('chỉ khấu trừ khi bán');
  await expect(line, `tỉ lệ thuế ${percent(RATE)}% lấy từ exchange:status, không ghi cứng 0,1%`).toContainText(percentRegex(RATE));

  // typing a quantity keeps the line and still shows no tax breakdown on the BUY side
  await decimalInputs(form).nth(1).fill(toStep(0.00123456, step));
  await expect(line).toContainText('chỉ khấu trừ khi bán');
  await expect(user.getByTestId('tax-breakdown')).toHaveCount(0);

  // the fee line carries the fee rate: "Phí giao dịch (0,1%): ~…"
  await expect(form).toContainText(new RegExp(`Phí giao dịch \\(\\s?${percent(feeRate)}\\s?%\\)`));
  await user.context().close();
});

test('Thuế TẮT: spot-tax-line ghi "không áp dụng" ở cả form MUA lẫn form BÁN (không còn "chỉ khấu trừ khi bán")', async ({ page, browser, baseURL }) => {
  await signUpStaff(page, 'admin');
  await setTax(page, { taxMode: 'OFF' });
  const user = await trader(browser, baseURL);

  await openSide(user, 'BÁN');
  const sellLine = user.getByTestId('spot-tax-line');
  await expect(sellLine).toBeVisible();
  await expect(sellLine).toContainText('không áp dụng');
  await expect(user.getByTestId('tax-breakdown')).toHaveCount(0);

  // the BUY form follows the same rule: with tax off there is nothing to say about "chỉ khấu trừ khi bán"
  await openSide(user, 'MUA');
  const buyLine = user.getByTestId('spot-tax-line');
  await expect(buyLine).toBeVisible();
  await expect(buyLine, 'MUA khi sàn tắt thuế cũng phải ghi "không áp dụng"').toContainText('không áp dụng');
  await user.context().close();
});

test('Thuế BẬT: form BÁN giữ tax-breakdown (thuế = roundUp(gộp × tỉ lệ), thực nhận) và vẫn có spot-tax-line', async ({ page, browser, baseURL }) => {
  await signUpStaff(page, 'admin');
  await setTax(page, { taxMode: 'WITHHOLD', taxRate: RATE });
  const user = await trader(browser, baseURL);
  const { tick, step } = await lotRules(user);
  const price = toStep(123457.123456, tick); // a limit far above the market: it only rests, we never submit
  const quantity = toStep(0.00123456, step);

  const form = await openSide(user, 'BÁN');
  await decimalInputs(form).nth(0).fill(price);
  await decimalInputs(form).nth(1).fill(quantity);
  await expect(user.getByTestId('tax-breakdown')).toBeVisible();
  const gross = dec(price).mul(quantity);
  const tax = roundUp(gross.mul(RATE));
  expect(dec(await dataValue(user.getByTestId('tax-amount'))).toFixed(8), `thuế ước tính = roundUp(gộp × ${RATE})`).toBe(tax.toFixed(8));
  const fee = dec(await dataValue(user.getByTestId('tax-fee')));
  expect(dec(await dataValue(user.getByTestId('tax-net'))).toFixed(8), 'thực nhận = gộp − phí − thuế').toBe(gross.sub(fee).sub(tax).toFixed(8));

  const line = user.getByTestId('spot-tax-line');
  await expect(line, 'form BÁN có thuế vẫn có dòng spot-tax-line').toBeVisible();
  await expect(line).toContainText(percentRegex(RATE));
  await user.context().close();
});

test('Tổ chức trong nước (DOMESTIC_ORG): form BÁN ghi "tự kê khai", không có tax-breakdown', async ({ page, browser, baseURL }) => {
  await signUpStaff(page, 'admin');
  await setTax(page, { taxMode: 'WITHHOLD', taxRate: RATE });
  const user = await trader(browser, baseURL);
  const { tick, step } = await lotRules(user);
  const put = await user.request.put('/api/v1/account/tax/profile', { data: { category: 'DOMESTIC_ORG' } });
  expect(put.ok(), `PUT tax/profile → ${put.status()} ${await put.text()}`).toBe(true);

  const form = await openSide(user, 'BÁN');
  await decimalInputs(form).nth(0).fill(toStep(123457.12, tick));
  await decimalInputs(form).nth(1).fill(toStep(0.00123456, step));
  const line = user.getByTestId('spot-tax-line');
  await expect(line).toBeVisible();
  await expect(line).toContainText('tự kê khai');
  await expect(user.getByTestId('tax-breakdown'), 'DOMESTIC_ORG không bị khấu trừ: không có khối thuế').toHaveCount(0);
  await user.context().close();
});
