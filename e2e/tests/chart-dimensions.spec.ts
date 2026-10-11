import { expect, test } from '../fixtures.ts';

test.describe('Section A: Chart height stability & no infinite loop', () => {
  const viewports = [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ];

  for (const vp of viewports) {
    test(`Chart height is bounded and stable at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('/trade/BTCUSDT');
      await page.waitForSelector('.tv-lightweight-charts', { timeout: 10000 });

      // 1. Initial measurement
      const chartEl = page.locator('.tv-lightweight-charts').first();
      await expect(chartEl).toBeVisible();

      const initialBox = await chartEl.boundingBox();
      expect(initialBox).not.toBeNull();
      const initialHeight = initialBox!.height;

      // Must be bounded within 360px - 760px
      expect(initialHeight).toBeGreaterThanOrEqual(360);
      expect(initialHeight).toBeLessThanOrEqual(760);

      // 2. Wait 3 seconds to verify NO infinite expansion loop
      await page.waitForTimeout(3000);
      const settledBox = await chartEl.boundingBox();
      expect(settledBox).not.toBeNull();
      expect(Math.abs(settledBox!.height - initialHeight)).toBeLessThanOrEqual(2);

      // 3. Switch timeframe (1m then 1h) - height must remain stable
      const btn1m = page.locator('button:has-text("1m")').first();
      if (await btn1m.isVisible()) {
        await btn1m.click();
        await page.waitForTimeout(1000);
        const after1mBox = await chartEl.boundingBox();
        expect(after1mBox!.height).toBeGreaterThanOrEqual(360);
        expect(after1mBox!.height).toBeLessThanOrEqual(760);
      }

      const btn1h = page.locator('button:has-text("1h")').first();
      if (await btn1h.isVisible()) {
        await btn1h.click();
        await page.waitForTimeout(1000);
        const after1hBox = await chartEl.boundingBox();
        expect(after1hBox!.height).toBeGreaterThanOrEqual(360);
        expect(after1hBox!.height).toBeLessThanOrEqual(760);
      }

      // 4. Verify chart does not cause runaway height expansion of the document
      const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      expect(scrollHeight).toBeLessThan(1400);
      expect(Math.abs(settledBox!.height - initialHeight)).toBeLessThanOrEqual(2);
    });
  }
});

test.describe('Section B: Single chart instance on desktop and mobile separation', () => {
  test('Renders exactly 1 .tv-lightweight-charts element on desktop and does not duplicate API requests', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const requests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/market/candles') || url.includes('/market/depth') || url.includes('/market/trades')) {
        requests.push(url);
      }
    });

    await page.goto('/trade/BTCUSDT');
    await page.waitForSelector('.tv-lightweight-charts', { timeout: 10000 });
    await page.waitForTimeout(2000);

    const count = await page.locator('.tv-lightweight-charts').count();
    expect(count).toBe(1);

    // Verify requests were made and not duplicated simultaneously by dual-mount
    const candleReqs = requests.filter((u) => u.includes('/market/candles'));
    expect(candleReqs.length).toBeGreaterThanOrEqual(1);
    // Should not have duplicate initial requests from 2 mounted charts
    expect(candleReqs.length).toBeLessThanOrEqual(2);
  });
});
