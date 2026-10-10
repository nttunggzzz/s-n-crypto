import { emailLink, expectCleanText, expect, newAccount, test } from '../fixtures.ts';

interface BalanceRow {
  asset: string;
  available: string;
  locked: string;
}

test('người dùng mới: đăng ký → xác minh email → nạp tiền ảo → mua Market 100 USDT', async ({ page }) => {
  const acc = newAccount();

  // register through the form
  await page.goto('/register');
  await page.getByLabel('Địa chỉ Email').fill(acc.email);
  await page.getByLabel('Tên hiển thị').fill(acc.name);
  await page.getByLabel(/^Mật khẩu/).fill(acc.password);
  await page.getByRole('button', { name: 'Đăng ký tài khoản' }).click();
  await page.waitForURL(/\/trade\//);

  // the link from the verification email
  await page.goto(await emailLink(acc.email, 'verify-email'));
  await expect(page.getByText('Xác minh email thành công')).toBeVisible();

  // faucet on the Assets page
  await page.goto('/assets');
  await page.getByRole('button', { name: /Nạp ngay/ }).click();
  await expect(page.locator('body')).toContainText('10.000,00');
  await expectCleanText(page);

  // market buy for 100 USDT
  await page.goto('/trade/BTCUSDT');
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: /^MUA BTC$/ }) });
  const panel = page.locator('div').filter({ has: form }).filter({ hasText: 'Khả dụng' }).last();
  await panel.getByRole('button', { name: 'Thị trường', exact: true }).click();
  await form.getByPlaceholder('100.00').fill('100');
  await form.getByRole('button', { name: /^MUA BTC$/ }).click();
  await page.getByRole('button', { name: 'Xác nhận đặt' }).click();

  // the server filled it: about 100 USDT spent, BTC received (same session as the page)
  await expect
    .poll(async () => {
      const r = await page.request.get('/api/v1/wallet/balances');
      const items = ((await r.json()) as { items: BalanceRow[] }).items;
      return items.find((b) => b.asset === 'BTC')?.available ?? '0';
    })
    .not.toBe('0');
  const r = await page.request.get('/api/v1/wallet/balances');
  const usdt = ((await r.json()) as { items: BalanceRow[] }).items.find((b) => b.asset === 'USDT')!;
  expect(Number(usdt.available)).toBeGreaterThan(9899);
  expect(Number(usdt.available)).toBeLessThan(9901);
  // and the page shows the new available balance without a reload
  await expect(panel).toContainText(/9\.90\d,\d{2}/);
  await expectCleanText(page);
});
