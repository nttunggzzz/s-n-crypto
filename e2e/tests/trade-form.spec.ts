import type { Balances, ExchangeInfo, Order } from '@cex/contracts';
import { apiGet, apiPost, expect, expectCleanText, signUp, test } from '../fixtures.ts';
import type { Locator, Page } from '@playwright/test';

// Acceptance tests for the order form (docs/reports/2026-10-12-ra-soat-ui-lan-2.md N-04, N-05, N-06 and
// …-lan-3.md K-03). The amount boxes have no data-testid yet, so they are found by position: in the Limit form
// the decimal inputs are [price, quantity, total]; in the Market form [amount].

const balanceOf = async (page: Page, asset: string) =>
  Number((await apiGet<Balances>(page, '/api/v1/wallet/balances')).items.find((b) => b.asset === asset)?.available ?? 0);

/** The desktop order form of the page (the one with the "MUA BTC" submit button). */
const orderForm = (page: Page) => page.locator('form').filter({ has: page.getByRole('button', { name: /^(MUA|BÁN) BTC$/ }) });
const decimalInputs = (form: Locator) => form.locator('input[inputmode="decimal"]');

async function lastPrice(page: Page, symbol = 'BTCUSDT'): Promise<number> {
  const t = await apiGet<{ items: { symbol: string; lastPrice: string | null }[] }>(page, '/api/v1/market/tickers');
  return Number(t.items.find((x) => x.symbol === symbol)!.lastPrice);
}

test('Limit: ô giá được điền sẵn theo giá thị trường (N-04) — chỉ nhập khối lượng là đặt được lệnh', async ({ page }) => {
  await signUp(page);
  await apiPost(page, '/api/v1/wallet/faucet');
  await page.goto('/trade/BTCUSDT');
  const form = orderForm(page);
  const [price, quantity] = [decimalInputs(form).nth(0), decimalInputs(form).nth(1)];

  // the box holds the current price (not just a faint placeholder)
  await expect.poll(async () => Number(await price.inputValue())).toBeGreaterThan(0);
  const market = await lastPrice(page);
  expect(Math.abs(Number(await price.inputValue()) - market) / market, 'ô giá điền sẵn phải gần giá thị trường').toBeLessThan(0.01);

  // a tiny buy far below the market: it must rest on the book (a Limit at the prefilled price may fill at once; that is fine too)
  await quantity.fill('0.001');
  await form.getByRole('button', { name: /^MUA BTC$/ }).click();
  await expect(page.locator('body')).not.toContainText('Vui lòng nhập đầy đủ giá và khối lượng');
  await page.getByTestId('order-confirm').click();
  await expect
    .poll(async () => (await apiGet<{ items: Order[] }>(page, '/api/v1/orders/history')).items.length + (await apiGet<{ items: Order[] }>(page, '/api/v1/orders/open')).items.length)
    .toBeGreaterThan(0);
  await expectCleanText(page);
});

test('Limit: đổi giá thì "Tổng giá trị" tính lại, và xóa trắng ô giá không bị điền lại (K-03)', async ({ page }) => {
  await signUp(page);
  await apiPost(page, '/api/v1/wallet/faucet');
  await page.goto('/trade/BTCUSDT');
  const form = orderForm(page);
  const [price, quantity, total] = [decimalInputs(form).nth(0), decimalInputs(form).nth(1), decimalInputs(form).nth(2)];
  await expect.poll(async () => Number(await price.inputValue())).toBeGreaterThan(0);

  await quantity.fill('0.01');
  await expect.poll(async () => Number(await total.inputValue())).toBeGreaterThan(0);
  await price.fill('80000');
  await expect.poll(async () => Number(await total.inputValue()), '80.000 × 0,01 = 800 (tổng phải theo giá mới, không giữ giá cũ)').toBe(800);

  // clearing the price box leaves it empty until the user types again
  await price.fill('');
  await page.waitForTimeout(1500); // longer than a price tick: the old prefill effect refilled it at once
  await expect(price).toHaveValue('');
});

test('Bán Market bằng nút 50%: khối lượng điền theo số coin đang có và lệnh khớp (N-05)', async ({ page }) => {
  await signUp(page);
  await apiPost(page, '/api/v1/wallet/faucet');
  await apiPost(page, '/api/v1/orders', { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quoteOrderQty: '1000' });
  await expect.poll(() => balanceOf(page, 'BTC')).toBeGreaterThan(0);
  const before = await balanceOf(page, 'BTC');
  const info = await apiGet<ExchangeInfo>(page, '/api/v1/market/exchange-info');
  const step = Number(info.symbols.find((s) => s.symbol === 'BTCUSDT')!.stepSize);

  await page.goto('/trade/BTCUSDT');
  await page.getByRole('button', { name: /^BÁN BTC$/ }).first().click();
  await page.getByRole('button', { name: 'Thị trường', exact: true }).click();
  await page.getByRole('button', { name: '50%', exact: true }).click();
  const form = orderForm(page);
  await expect.poll(async () => Number(await decimalInputs(form).first().inputValue()), 'nút 50% phải điền khối lượng BTC (không đòi nhập số USDT)').toBeGreaterThan(0);
  await form.getByRole('button', { name: /^BÁN BTC$/ }).click();
  await expect(page.locator('body')).not.toContainText('Vui lòng nhập số tiền USDT');
  await page.getByTestId('order-confirm').click();

  await expect.poll(() => balanceOf(page, 'BTC')).toBeLessThan(before);
  const after = await balanceOf(page, 'BTC');
  expect(before - after, 'đã bán khoảng một nửa').toBeGreaterThan(before * 0.5 - 2 * step);
  expect(before - after).toBeLessThan(before * 0.5 + 2 * step);
});

test.describe('điện thoại', () => {
  test('bấm "BÁN BTC" ở thanh dưới thì form mở ở phía Bán, không phải Mua (N-06) @mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'thanh Mua/Bán dưới cùng chỉ có trên điện thoại');
    await signUp(page);
    await page.goto('/trade/BTCUSDT');
    await page.getByRole('button', { name: /^BÁN BTC$/ }).last().click();
    const submit = page.locator('form button[type="submit"]');
    await expect(submit).toHaveText(/^BÁN BTC$/);
    await expect(page.locator('form').getByRole('button', { name: /^MUA BTC$/ })).toHaveCount(1); // the side tab, not the submit button
    await expect(submit).not.toHaveText(/^MUA BTC$/);
  });
});
