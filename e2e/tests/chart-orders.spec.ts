import { dec, floorToStep } from '@cex/core';
import type { Balances, ExchangeInfo, Order, Trade } from '@cex/contracts';
import { apiGet, apiPost, expect, expectCleanText, signUp, test } from '../fixtures.ts';
import type { Page } from '@playwright/test';

// Acceptance for docs/antigravity/PROMPT-12 (owner's request: see on the chart where my orders rest and where they filled).
// The chart is a canvas: the page keeps a hidden list next to it (PROMPT-12 section D) —
//   chart-order-line  (data-order-id, data-side, data-price = the API price string)
//   chart-fill-marker (data-side, data-price = volume-weighted average price floored to the tick, data-time = candle open, UTC s, data-count)
// Orders and trades are set up through the API: the server pushes them on the `user` channel, which is what the chart must follow.

const lines = (page: Page) => page.getByTestId('chart-order-line');
const markers = (page: Page) => page.getByTestId('chart-fill-marker');
const tickSize = async (page: Page) => (await apiGet<ExchangeInfo>(page, '/api/v1/market/exchange-info')).symbols.find((s) => s.symbol === 'BTCUSDT')!.tickSize;
const myTrades = async (page: Page) => (await apiGet<{ items: Trade[] }>(page, '/api/v1/trades?symbol=BTCUSDT&limit=200')).items;
const vwap = (trades: Trade[], tick: string) => {
  const qty = trades.reduce((s, t) => s.add(dec(t.quantity)), dec('0'));
  const quote = trades.reduce((s, t) => s.add(dec(t.quoteQty)), dec('0'));
  return floorToStep(quote.div(qty), dec(tick)).toString();
};

test('lệnh đang mở hiện thành đường trên chart ngay khi đặt, mất khi hủy — không tải lại trang', async ({ page }) => {
  await signUp(page);
  await apiPost(page, '/api/v1/wallet/faucet');
  await page.goto('/trade/BTCUSDT');
  await expect(page.getByTestId('chart-my-orders-toggle')).toBeVisible();
  await expect(lines(page)).toHaveCount(0);

  const tick = await tickSize(page);
  const last = (await apiGet<{ items: { symbol: string; lastPrice: string }[] }>(page, '/api/v1/market/tickers')).items.find((t) => t.symbol === 'BTCUSDT')!.lastPrice;
  const price = floorToStep(dec(last).mul('0.8'), dec(tick)).toString();
  const placed = await apiPost<{ order: Order }>(page, '/api/v1/orders', { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.001', price });

  const line = page.locator(`[data-testid="chart-order-line"][data-order-id="${placed.order.id}"]`);
  await expect(line, 'đường lệnh phải hiện trong 5 giây, không cần tải lại').toHaveCount(1, { timeout: 5_000 });
  await expect(line).toHaveAttribute('data-side', 'BUY');
  expect(dec((await line.getAttribute('data-price'))!).eq(dec(price)), 'giá của đường = giá đã đặt').toBe(true);

  expect((await page.request.delete(`/api/v1/orders/${placed.order.id}`)).ok()).toBe(true);
  await expect(lines(page), 'hủy lệnh → đường biến mất').toHaveCount(0, { timeout: 5_000 });
  await expectCleanText(page);
});

test('khớp lệnh để lại ký hiệu B / S đúng giá khớp; còn sau khi tải lại và khi đổi khung giờ; nút "Lệnh của tôi" ẩn/hiện', async ({ page }) => {
  await signUp(page);
  await apiPost(page, '/api/v1/wallet/faucet');
  await page.goto('/trade/BTCUSDT');
  await expect(page.getByTestId('chart-my-orders-toggle')).toBeVisible();
  const tick = await tickSize(page);

  // buy: a B marker at the average fill price, without a reload
  await apiPost(page, '/api/v1/orders', { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quoteOrderQty: '100' });
  const buy = markers(page).and(page.locator('[data-side="BUY"]'));
  await expect(buy, 'ký hiệu B phải hiện trong 5 giây').toHaveCount(1, { timeout: 5_000 });
  const buys = (await myTrades(page)).filter((t) => t.side === 'BUY');
  expect(await buy.getAttribute('data-price'), 'giá của B = giá khớp trung bình').toBe(vwap(buys, tick));
  expect(Number(await buy.getAttribute('data-count'))).toBe(buys.length);

  // after a reload it is still there (loaded from the trade history)
  await page.reload();
  await expect(buy).toHaveCount(1);

  // 1h candles: the marker sits on the hour candle that holds the fill
  await page.getByRole('button', { name: '1h', exact: true }).click();
  const fillSec = Math.floor(new Date(buys[0]!.createdAt).getTime() / 1000);
  await expect(buy).toHaveAttribute('data-time', String(Math.floor(fillSec / 3600) * 3600));

  // sell everything: an S marker too
  const btc = (await apiGet<Balances>(page, '/api/v1/wallet/balances')).items.find((b) => b.asset === 'BTC')!.available;
  const step = (await apiGet<ExchangeInfo>(page, '/api/v1/market/exchange-info')).symbols.find((s) => s.symbol === 'BTCUSDT')!.stepSize;
  await apiPost(page, '/api/v1/orders', { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: floorToStep(dec(btc), dec(step)).toString() });
  const sell = markers(page).and(page.locator('[data-side="SELL"]'));
  await expect(sell, 'ký hiệu S phải hiện trong 5 giây').toHaveCount(1, { timeout: 5_000 });
  expect(await sell.getAttribute('data-price')).toBe(vwap((await myTrades(page)).filter((t) => t.side === 'SELL'), tick));

  // the toggle hides lines and markers, and brings them back
  const toggle = page.getByTestId('chart-my-orders-toggle');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(markers(page)).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(markers(page)).toHaveCount(2);
  await expectCleanText(page);
});

test('chưa đăng nhập: không có nút "Lệnh của tôi", không có đường lệnh hay ký hiệu khớp', async ({ page }) => {
  await page.goto('/trade/BTCUSDT');
  await expect(page.locator('.tv-lightweight-charts').first()).toBeVisible();
  await expect(page.getByTestId('chart-my-orders-toggle')).toHaveCount(0);
  await expect(lines(page)).toHaveCount(0);
  await expect(markers(page)).toHaveCount(0);
});
