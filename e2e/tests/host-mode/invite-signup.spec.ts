import type { Locator, Page } from '@playwright/test';
import { apiGet, apiPost, createInvite, expect, expectCleanText, newAccount, test } from '../../fixtures.ts';

/**
 * Project `host-mode`: the stack configured like the owner's live server (`npm run host`) — sign-up only with an
 * invite code, no email verification (GET /api/v1/config → registration INVITE_ONLY, emailVerificationRequired
 * false). What real users go through there; the default stack (:5190) cannot show it (docs/LOI-HIEN-TAI.md C1).
 */

interface BalanceRow {
  asset: string;
  available: string;
  locked: string;
}

/** "ABCD-EFGH" / "abcd efgh" → "ABCDEFGH": the server accepts the code in any of these spellings. */
const normalizeCode = (code: unknown) => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** What a button offers right now: its text, plus " (bị khóa)" while it is disabled. */
const buttonState = async (button: Locator) => `${(await button.innerText()).trim()}${(await button.isEnabled()) ? '' : ' (bị khóa)'}`;

async function fillRegisterForm(page: Page, acc: ReturnType<typeof newAccount>) {
  await page.getByLabel('Địa chỉ Email').fill(acc.email);
  await page.getByLabel('Tên hiển thị').fill(acc.name);
  await page.getByLabel(/^Mật khẩu/).fill(acc.password);
}

const isRegister = (r: { url(): string; request(): { method(): string } }) =>
  r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/auth/register';

/** Faucet on /assets, then a 100 USDT market buy on /trade/BTCUSDT (as spot.spec) — by an account whose email is NOT verified. */
async function faucetAndMarketBuy(page: Page) {
  await page.goto('/assets');
  const faucet = page.getByRole('button', { name: /Nạp ngay|xác minh email/i });
  const usable = /^Nạp ngay [^()]*$/;
  // soft: a wrongly locked faucet is reported, then the test claims through the API so the order form is checked in the same run
  await expect
    .configure({ soft: true })
    .poll(() => buttonState(faucet), 'server không bắt xác minh email (emailVerificationRequired: false) → nút nạp tiền ảo phải bấm được')
    .toMatch(usable);
  if (usable.test(await buttonState(faucet))) await faucet.click();
  else {
    await apiPost(page, '/api/v1/wallet/faucet');
    await page.reload();
  }
  await expect(page.locator('body')).toContainText('10.000,00');
  await expectCleanText(page);

  await page.goto('/trade/BTCUSDT');
  const panel = page.locator('div').filter({ has: page.locator('form') }).filter({ hasText: 'Khả dụng' }).last();
  await panel.getByRole('button', { name: 'Thị trường', exact: true }).click();
  const form = panel.locator('form');
  const submit = form.getByRole('button', { name: /^MUA BTC$|xác minh email/i });
  await expect
    .poll(() => buttonState(submit), 'server không bắt xác minh email (emailVerificationRequired: false) → form đặt lệnh không được khóa')
    .toBe('MUA BTC');
  await form.getByPlaceholder('100.00').fill('100');
  await submit.click();
  await page.getByRole('button', { name: 'Xác nhận đặt' }).click();

  // the server filled it: about 100 USDT spent, BTC received (same session as the page)
  await expect
    .poll(async () => {
      const items = (await apiGet<{ items: BalanceRow[] }>(page, '/api/v1/wallet/balances')).items;
      return Number(items.find((b) => b.asset === 'BTC')?.available ?? '0');
    })
    .toBeGreaterThan(0);
  const usdt = (await apiGet<{ items: BalanceRow[] }>(page, '/api/v1/wallet/balances')).items.find((b) => b.asset === 'USDT')!;
  expect(Number(usdt.available)).toBeGreaterThan(9899);
  expect(Number(usdt.available)).toBeLessThan(9901);
  await expectCleanText(page);
}

test('mở link mời → đăng ký bằng form → nạp tiền ảo → mua Market 100 USDT mà không cần xác minh email', async ({ page, request }) => {
  const invite = createInvite();
  const acc = newAccount();

  // the link the operator sends (`npm run host -- invite`): <app>/register?invite=XXXX-XXXX
  expect(new URL(invite.link).pathname).toBe('/register');
  await page.goto(invite.link);
  await fillRegisterForm(page, acc);
  const [reg] = await Promise.all([page.waitForResponse(isRegister), page.getByRole('button', { name: 'Đăng ký tài khoản' }).click()]);
  expect(normalizeCode((reg.request().postDataJSON() as { inviteCode?: string }).inviteCode), 'đăng ký phải gửi mã mời lấy từ link (?invite=)').toBe(
    normalizeCode(invite.code),
  );
  expect(reg.status(), `POST /api/v1/auth/register → ${reg.status()} ${await reg.text()}`).toBe(201);
  await page.waitForURL(/\/trade\//);

  // signed in as the new account, which has not verified its email (and does not need to here)
  const me = await apiGet<{ email: string; emailVerified: boolean }>(page, '/api/v1/me');
  expect(me.email).toBe(acc.email);
  expect(me.emailVerified).toBe(false);
  // the invite (1 use) was consumed by this sign-up
  const again = await request.post('/api/v1/auth/register', { data: { ...newAccount(), inviteCode: invite.code } });
  expect(again.status()).toBe(400);
  expect(((await again.json()) as { error: { code: string; details?: { reason?: string } } }).error).toMatchObject({ code: 'INVALID_INVITE', details: { reason: 'USED_UP' } });

  await faucetAndMarketBuy(page);
});

test('tài khoản chưa xác minh email → nạp tiền ảo → mua Market 100 USDT (server không bắt xác minh)', async ({ page }) => {
  // set-up through the API with a valid invite, so this checks the email gate alone (the sign-up form is tested above)
  const acc = newAccount();
  const reg = await page.request.post('/api/v1/auth/register', { data: { ...acc, inviteCode: createInvite().code } });
  expect(reg.status(), await reg.text()).toBe(201);
  expect((await apiGet<{ emailVerified: boolean }>(page, '/api/v1/me')).emailVerified).toBe(false);

  await faucetAndMarketBuy(page);
});

test.describe(() => {
  // the server refuses the sign-up (400 INVALID_INVITE, reason MISSING) — the browser logs that 400; nothing else is allowed
  test.use({ expectedApiErrors: [{ method: 'POST', path: '/api/v1/auth/register', status: 400, code: 'INVALID_INVITE' }] });

  test('đăng ký không có mã mời → báo lỗi rõ ràng, không tạo tài khoản', async ({ page, request }) => {
    const acc = newAccount();
    await page.goto('/register');
    await fillRegisterForm(page, acc);
    // texts about the invite code already on the page (e.g. the label of a "Mã mời" field) are not the message
    const mentions = page.getByText(/mã mời/i).filter({ visible: true });
    const before = await mentions.count();
    await page.getByRole('button', { name: 'Đăng ký tài khoản' }).click();

    await expect.poll(() => mentions.count(), 'sau khi bấm Đăng ký phải hiện thông báo nói rõ cần mã mời').toBeGreaterThan(before);
    await expect(page).toHaveURL(/\/register/);
    // no account was created: not signed in, and the credentials do not log in
    expect((await page.request.get('/api/v1/me')).status()).toBe(401);
    const login = await request.post('/api/v1/auth/login', { data: { email: acc.email, password: acc.password } });
    expect(login.ok(), `POST /api/v1/auth/login → ${login.status()} ${await login.text()}`).toBe(false);
  });
});
