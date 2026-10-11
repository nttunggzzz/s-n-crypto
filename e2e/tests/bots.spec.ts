import type { Balances, DcaPlan, ExchangeInfo, GridBot, Order, Ticker } from '@cex/contracts';
import { apiGet, apiPost, expect, signUp, test, toStep } from '../fixtures.ts';

// Acceptance tests for the bots page (PROMPT-06). Element ids: docs/antigravity/TESTIDS.md.

const gridBots = (page: import('@playwright/test').Page) => apiGet<{ items: GridBot[] }>(page, '/api/v1/bots/grid');
const dcaPlans = (page: import('@playwright/test').Page) => apiGet<{ items: DcaPlan[] }>(page, '/api/v1/bots/dca');

test('Bot lưới: xem trước → tạo → lệnh bot có badge, không có nút Hủy → dừng và bán coin', async ({ page }) => {
  await signUp(page);
  await apiPost(page, '/api/v1/wallet/faucet');
  const info = await apiGet<ExchangeInfo>(page, '/api/v1/market/exchange-info');
  const tick = info.symbols.find((s) => s.symbol === 'BTCUSDT')!.tickSize;
  const last = Number((await apiGet<{ items: Ticker[] }>(page, '/api/v1/market/tickers')).items.find((t) => t.symbol === 'BTCUSDT')!.lastPrice);

  await page.goto('/bots?symbol=BTCUSDT');
  await expect(page.getByTestId('grid-symbol')).toHaveValue('BTCUSDT');
  await page.getByTestId('grid-lower').fill(toStep(last * 0.97, tick));
  await page.getByTestId('grid-upper').fill(toStep(last * 1.03, tick));
  await page.getByTestId('grid-count').fill('10');
  await page.getByTestId('grid-investment').fill('500');
  await expect(page.getByTestId('grid-preview-profit')).toContainText('%'); // preview runs by itself (debounced)
  await page.getByTestId('grid-create').click();
  await page.getByTestId('bot-confirm').click();

  await expect.poll(async () => (await gridBots(page)).items.map((b) => b.status)).toEqual(['RUNNING']);
  const card = page.getByTestId('grid-bot-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('BTC');

  // its orders: badge "Bot lưới", no cancel button (only stopping the bot cancels them)
  await page.goto('/trade/BTCUSDT');
  const botRows = page.getByTestId('open-order-row').filter({ hasText: 'Bot lưới' });
  await expect(botRows.first()).toBeVisible();
  await expect(botRows.first().getByTestId('order-cancel')).toHaveCount(0);

  // stop and sell what the bot holds
  await page.goto('/bots');
  await page.getByTestId('grid-bot-card').getByTestId('grid-bot-stop').click();
  await page.getByTestId('grid-stop-sell-base').check();
  await page.getByTestId('grid-stop-confirm').click();
  await expect.poll(async () => (await gridBots(page)).items[0]?.status).toBe('STOPPED');
  await expect.poll(async () => {
    const open = await apiGet<{ items: Order[] }>(page, '/api/v1/orders/open');
    return open.items.filter((o) => o.source === 'GRID');
  }).toEqual([]);
  const balances = await apiGet<Balances>(page, '/api/v1/wallet/balances');
  expect(Number(balances.items.find((b) => b.asset === 'USDT')?.locked ?? 0)).toBe(0);
  expect(Number(balances.items.find((b) => b.asset === 'BTC')?.available ?? 0)).toBeLessThan(0.0001); // dust only
  await expect(page.getByTestId('grid-bot-card')).toContainText(/Đã dừng/);
});

test('Mua định kỳ: tạo kế hoạch hằng ngày 20 USDT → tạm dừng → hủy (biến khỏi danh sách)', async ({ page }) => {
  await signUp(page);
  await apiPost(page, '/api/v1/wallet/faucet');
  await page.goto('/bots?symbol=BTCUSDT');
  await page.getByTestId('bots-tab-dca').click();
  await expect(page.getByTestId('dca-symbol')).toHaveValue('BTCUSDT');
  await page.getByTestId('dca-amount').fill('20');
  await page.getByTestId('dca-interval').selectOption('DAILY');
  await page.getByTestId('dca-create').click();
  await page.getByTestId('bot-confirm').click();

  await expect.poll(async () => (await dcaPlans(page)).items.map((p) => [p.status, Number(p.quoteAmount), p.interval])).toEqual([['ACTIVE', 20, 'DAILY']]);
  const card = page.getByTestId('dca-plan-card');
  await expect(card).toContainText('GMT+7'); // the hour is Vietnam time

  await card.getByTestId('dca-pause').click();
  await expect.poll(async () => (await dcaPlans(page)).items[0]?.status).toBe('PAUSED');
  await card.getByTestId('dca-cancel').click();
  await page.getByTestId('dca-cancel-confirm').click();
  await expect.poll(async () => (await dcaPlans(page)).items).toEqual([]); // canceled plans are no longer listed
  await expect(page.getByTestId('dca-plan-card')).toHaveCount(0);
});
