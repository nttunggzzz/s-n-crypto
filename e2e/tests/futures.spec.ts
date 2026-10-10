import type { FuturesAccount, FuturesExchangeInfo, FuturesPosition, MarkPrice } from '@cex/contracts';
import { apiGet, apiPost, expect, signUp, test, toStep } from '../fixtures.ts';

// Acceptance test for the futures page (PROMPT-05 + REVIEW-03). Element ids: docs/antigravity/TESTIDS.md.
// The UI drives every step; the API checks what really happened.

const positions = (page: import('@playwright/test').Page) => apiGet<{ items: FuturesPosition[] }>(page, '/api/v1/futures/positions');

test('Futures: chuyển 1.000 USDT sang ví Futures → mở Long thị trường → đặt TP/SL → đóng vị thế', async ({ page }) => {
  await signUp(page);
  await apiPost(page, '/api/v1/wallet/faucet');
  await page.goto('/futures/BTCUSDT');

  // 1. transfer from the spot wallet (the dialog opened from the futures page defaults to Spot → Futures)
  await page.getByTestId('futures-transfer-open').click();
  await page.getByTestId('transfer-amount').fill('1000');
  await page.getByTestId('transfer-submit').click();
  await expect.poll(async () => Number((await apiGet<FuturesAccount>(page, '/api/v1/futures/account')).walletBalance)).toBe(1000);
  await expect(page.getByTestId('futures-available')).toContainText('1.000');

  // 2. market long, 0.002 BTC (quantity in coin), default leverage
  await page.getByTestId('futures-order-type-market').click();
  await page.getByTestId('futures-unit-coin').click();
  await page.getByTestId('futures-qty').fill('0.002');
  await page.getByTestId('futures-open-long').click();
  await page.getByTestId('order-confirm').click(); // preferences.confirmOrders is on by default
  const row = page.getByTestId('position-row').filter({ hasText: 'BTCUSDT' });
  await expect(row).toBeVisible();
  const [pos] = (await positions(page)).items;
  expect(pos).toMatchObject({ symbol: 'BTCUSDT', side: 'LONG' });
  expect(Number(pos!.quantity)).toBe(0.002);
  await expect(row).toContainText(/\d/); // liquidation price, margin, PnL are shown

  // 3. take-profit / stop-loss 5 % away from the mark price
  const info = await apiGet<FuturesExchangeInfo>(page, '/api/v1/futures/exchange-info');
  const tick = info.symbols.find((s) => s.symbol === 'BTCUSDT')!.tickSize;
  const mark = Number((await apiGet<MarkPrice>(page, '/api/v1/futures/market/mark/BTCUSDT')).markPrice);
  const tp = toStep(mark * 1.05, tick);
  const sl = toStep(mark * 0.95, tick);
  await row.getByTestId('position-tpsl').click();
  await page.getByTestId('tpsl-take-profit').fill(tp);
  await page.getByTestId('tpsl-stop-loss').fill(sl);
  await page.getByTestId('tpsl-save').click();
  await expect.poll(async () => {
    const p = (await positions(page)).items[0];
    return [Number(p?.takeProfitPrice), Number(p?.stopLossPrice)];
  }).toEqual([Number(tp), Number(sl)]);

  // 4. close everything at market
  await row.getByTestId('position-close').click();
  await page.getByTestId('close-confirm').click();
  await expect.poll(async () => (await positions(page)).items.length).toBe(0);
  await expect(page.getByTestId('position-row')).toHaveCount(0);
  const history = await apiGet<{ items: FuturesPosition[] }>(page, '/api/v1/futures/positions/history');
  expect(history.items[0]).toMatchObject({ symbol: 'BTCUSDT', status: 'CLOSED' });
  const acc = await apiGet<FuturesAccount>(page, '/api/v1/futures/account');
  expect(Number(acc.positionMargin)).toBe(0);
  expect(Math.abs(Number(acc.walletBalance) - 1000)).toBeLessThan(5); // ± PnL and fees of a 0.002 BTC round trip
});
