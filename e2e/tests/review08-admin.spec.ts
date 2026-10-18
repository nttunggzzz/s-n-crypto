import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AdminOverview, AdminUserDetail, Balances, ExchangeInfo, Me, PublicConfig, TaxSettings } from '@cex/contracts';
import { dec } from '@cex/core';
import type { Dec } from '@cex/core';
import type { Browser, Locator, Page } from '@playwright/test';
import { base32Decode, hotp, totpStep } from '../../server/src/modules/auth/totp.ts';
import { apiGet, apiPost, expect, otherBrowser, signUp, signUpStaff, test, toStep } from '../fixtures.ts';

// Acceptance tests for review 8, web admin: PROMPT-17 S-13 (2FA flag from publicConfig) and S-15 (user detail: tax, volume,
// holdings) plus the P1 items of PROMPT-18 that can be checked from the outside (AD-07, AD-10).
// `page` is the staff session (admin, 2FA on) unless the test says otherwise; the trader is a second browser. The e2e server keeps
// STAFF_REQUIRE_2FA at its default (true), so publicConfig.staffTwoFactorRequired is true here. Element ids: docs/antigravity/TESTIDS.md,
// section "Rà soát lần 8 (PROMPT-17/18)". Amounts are compared as Decimal strings; balances priced at the live sim price are compared
// with a tolerance (the sim price moves every second).

const REASON = 'Kiểm thử e2e — web admin (rà soát 8)';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test.afterEach(async ({ page }) => {
  await page.request.patch('/api/v1/admin/tax/settings', { data: { taxMode: 'OFF', taxRate: '0.001', taxVndRate: null, reason: REASON } }).catch(() => undefined);
});

async function setTax(admin: Page, taxMode: 'OFF' | 'WITHHOLD') {
  const r = await admin.request.patch('/api/v1/admin/tax/settings', { data: { taxMode, taxRate: '0.001', reason: REASON } });
  expect(r.ok(), `PATCH admin/tax/settings → ${r.status()} ${await r.text()}`).toBe(true);
  return (await r.json()) as TaxSettings;
}

/** URL of the e2e database, the way the fixtures find it (server/scripts/e2eStack.ts writes .e2e/stack.json). */
const e2eDatabaseUrl = () => (JSON.parse(readFileSync(path.join(ROOT, '.e2e/stack.json'), 'utf8')) as { databaseUrl: string }).databaseUrl;

/** The `admin:set-role` command on the e2e database (what an operator does) — without turning 2FA on. */
function setRole(email: string, role: 'support' | 'admin' | 'owner') {
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/setRole.ts', email, role], {
    cwd: path.join(ROOT, 'server'),
    env: { ...process.env, DATABASE_URL: e2eDatabaseUrl(), NODE_ENV: 'development', LOG_LEVEL: 'warn' },
    stdio: 'pipe',
  });
}

async function enableTwoFactor(page: Page, password: string) {
  const setup = await apiPost<{ secret: string }>(page, '/api/v1/auth/2fa/setup', { currentPassword: password });
  await apiPost(page, '/api/v1/auth/2fa/enable', { code: hotp(base32Decode(setup.secret), totpStep(Date.now())) });
}

/** Opens a user's page in the admin app by searching their email, as staff would (admin.spec.ts). */
async function openUser(admin: Page, email: string) {
  await admin.goto('/admin/users');
  await admin.getByTestId('admin-user-search').fill(email);
  const row = admin.getByTestId('admin-user-row').filter({ hasText: email });
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(admin).toHaveURL(/\/admin\/users\/\d+$/);
}

const clickTab = (page: Page, name: RegExp) => page.getByRole('tab', { name }).or(page.getByRole('button', { name })).first().click();

/** `data-value` of an element the page must show (a clear failure when the element or the attribute is missing). */
async function dataValue(l: Locator, what: string): Promise<string> {
  await expect(l, `${what}: phần tử phải hiển thị`).toBeVisible();
  await expect(l, `${what}: thiếu thuộc tính data-value`).toHaveAttribute('data-value', /\d/);
  return (await l.getAttribute('data-value', { timeout: 5_000 }))!;
}
const expectDec = (actual: string, expected: string, what: string) => expect(dec(actual).toFixed(8), what).toBe(dec(expected).toFixed(8));
/** |a − b| ≤ rel × max(|a|, |b|): for amounts priced at the moving sim price. */
const near = (a: string | Dec, b: string | Dec, rel = '0.005') => {
  const [x, y] = [dec(a.toString()), dec(b.toString())];
  return x.sub(y).abs().lte(x.abs().gt(y.abs()) ? x.abs().mul(rel) : y.abs().mul(rel));
};

/** A fresh trader (own browser): faucet, BTC bought for 2.000 USDT and 0,003 BTC sold (tax withheld while the tax is on). */
async function trader(browser: Browser, baseURL: string | undefined) {
  const user = await otherBrowser(browser, baseURL);
  const acc = await signUp(user);
  await apiPost(user, '/api/v1/wallet/faucet');
  await apiPost(user, '/api/v1/orders', { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quoteOrderQty: '2000' });
  await expect.poll(async () => dec((await apiGet<Balances>(user, '/api/v1/wallet/balances')).items.find((b) => b.asset === 'BTC')?.total ?? '0').gt(0)).toBe(true);
  const step = (await apiGet<ExchangeInfo>(user, '/api/v1/market/exchange-info')).symbols.find((s) => s.symbol === 'BTCUSDT')!.stepSize;
  await apiPost(user, '/api/v1/orders', { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: toStep(0.003, step) });
  return { user, acc };
}

test('S-15: chi tiết người dùng — thuế đã khấu trừ (mọi thời gian) và khối lượng hôm nay nằm ở thẻ tóm tắt (không cần bấm tab) và khớp API', async ({ page, browser, baseURL }) => {
  await signUpStaff(page, 'admin');
  await setTax(page, 'WITHHOLD');
  const { user, acc } = await trader(browser, baseURL);
  const detail = await apiGet<AdminUserDetail>(page, `/api/v1/admin/users/${acc.id}`);
  expect(dec(detail.tax.withheldTotal).gt(0), 'thuế đang bật: lần bán phải bị khấu trừ').toBe(true);
  expect(dec(detail.trading.volume.today.total).gt(0)).toBe(true);

  await openUser(page, acc.email);
  expectDec(await dataValue(page.getByTestId('admin-user-tax-total'), 'Thuế đã khấu trừ (mọi thời gian)'), detail.tax.withheldTotal, 'admin-user-tax-total = detail.tax.withheldTotal');
  expectDec(await dataValue(page.getByTestId('admin-user-volume-today'), 'Khối lượng hôm nay'), detail.trading.volume.today.total, 'admin-user-volume-today = detail.trading.volume.today.total');
  expect(detail.unpricedAssets, 'mọi tài sản có giá trên sim').toEqual([]);
  await expect(page.getByTestId('admin-unpriced-assets'), 'không có tài sản thiếu giá: không có dòng "Chưa tính giá"').toHaveCount(0);

  // the summary card is not part of a tab: it stays when another tab is open
  await clickTab(page, /Sổ cái/);
  await expect(page.getByTestId('admin-user-tax-total')).toBeVisible();
  await expect(page.getByTestId('admin-user-volume-today')).toBeVisible();
  await user.context().close();
});

test('S-15: tab Số dư là bảng tài sản nắm giữ — một dòng cho mỗi số dư khác 0 (BTC + USDT), có giá trị USDT và % danh mục, giảm dần, dòng tổng = totalValueUsdt', async ({ page, browser, baseURL }) => {
  await signUpStaff(page, 'admin');
  const { user, acc } = await trader(browser, baseURL);
  const detail = await apiGet<AdminUserDetail>(page, `/api/v1/admin/users/${acc.id}`);
  const held = detail.balances.filter((b) => dec(b.total).gt(0));
  expect(held.map((b) => b.asset).sort(), 'thiết lập của test: người dùng có BTC và USDT').toEqual(['BTC', 'USDT']);

  await openUser(page, acc.email);
  await clickTab(page, /^Số dư/);
  await expect(page.getByTestId('admin-holding-row'), 'một dòng cho mỗi số dư khác 0').toHaveCount(held.length);

  // one synchronous DOM read: the rows, their percentages and the total belong to the same render
  const snap = await page.evaluate(() => ({
    total: document.querySelector('[data-testid="admin-holdings-total"]')?.getAttribute('data-value') ?? null,
    rows: Array.from(document.querySelectorAll('[data-testid="admin-holding-row"]')).map((row) => ({
      asset: row.getAttribute('data-asset'),
      value: row.querySelector('[data-testid="admin-holding-value"]')?.getAttribute('data-value') ?? null,
      pct: row.querySelector('[data-testid="admin-holding-pct"]')?.getAttribute('data-value') ?? null,
    })),
  }));
  expect(snap.total, 'admin-holdings-total thiếu hoặc không có data-value').not.toBeNull();
  expect(snap.rows.map((r) => r.asset).sort()).toEqual(['BTC', 'USDT']);
  for (const r of snap.rows) {
    expect(r.value, `${r.asset}: thiếu admin-holding-value[data-value] (giá trị USDT)`).not.toBeNull();
    expect(r.pct, `${r.asset}: thiếu admin-holding-pct[data-value] (% danh mục)`).not.toBeNull();
  }

  // values: USDT is exact, BTC follows the moving sim price
  const usdt = detail.balances.find((b) => b.asset === 'USDT')!;
  const btc = detail.balances.find((b) => b.asset === 'BTC')!;
  expectDec(snap.rows.find((r) => r.asset === 'USDT')!.value!, usdt.valueUsdt!, 'giá trị USDT của dòng USDT = Balance.valueUsdt');
  expect(near(snap.rows.find((r) => r.asset === 'BTC')!.value!, btc.valueUsdt!), `giá trị USDT của dòng BTC ${snap.rows.find((r) => r.asset === 'BTC')!.value} ≈ ${btc.valueUsdt}`).toBe(true);

  // the total is what the server sums, not recomputed by the page: it equals the sum of the row values of the same render, and ≈ totalValueUsdt
  const sum = snap.rows.reduce((s, r) => s.add(r.value!), dec('0'));
  expectDec(snap.total!, sum.toString(), 'dòng tổng = tổng các dòng cùng lần hiển thị');
  expect(near(snap.total!, detail.totalValueUsdt), `tổng ${snap.total} ≈ detail.totalValueUsdt ${detail.totalValueUsdt}`).toBe(true);

  // % of portfolio = value ÷ total × 100 (the page may round to 2 decimals); sorted by value, largest first
  for (const r of snap.rows) {
    const pct = dec(r.value!).div(snap.total!).mul(100);
    expect(dec(r.pct!).sub(pct).abs().lte('0.01'), `${r.asset}: % danh mục ${r.pct} ≈ ${pct.toFixed(4)}`).toBe(true);
  }
  const values = snap.rows.map((r) => dec(r.value!));
  expect(values.every((v, i) => i === 0 || values[i - 1]!.gte(v)), `sắp theo giá trị giảm dần: ${snap.rows.map((r) => `${r.asset}=${r.value}`).join(', ')}`).toBe(true);
  await user.context().close();
});

test('AD-10: Tổng quan không còn số ghi cứng "Độ trễ Binance < 150ms"; số cặp LIVE/STALE/UNAVAILABLE lấy từ market.symbols[].status; đối soát chưa chạy ghi "Chưa chạy"', async ({ page }) => {
  await signUpStaff(page, 'admin');
  const loaded = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/v1/admin/overview' && r.ok());
  await page.goto('/admin/');
  await loaded;
  await expect(page.getByTestId('admin-overview')).toBeVisible();

  const text = await page.getByTestId('admin-overview').innerText();
  expect(text, 'không còn độ trễ Binance ghi cứng').not.toMatch(/150\s?ms/i);

  const counts = (o: AdminOverview) => ({
    live: o.market.symbols.filter((s) => s.status === 'LIVE').length,
    stale: o.market.symbols.filter((s) => s.status === 'STALE').length,
    unavailable: o.market.symbols.filter((s) => s.status === 'UNAVAILABLE').length,
  });
  const health = page.getByTestId('admin-market-health');
  await expect(health, 'khối sức khỏe nguồn giá (admin-market-health)').toBeVisible();
  await expect
    .poll(
      async () => {
        const api = counts(await apiGet<AdminOverview>(page, '/api/v1/admin/overview'));
        const attr = async (name: string) => (await health.getAttribute(`data-${name}`, { timeout: 2_000 })) ?? 'thiếu';
        const ui = { live: await attr('live'), stale: await attr('stale'), unavailable: await attr('unavailable') };
        return JSON.stringify(ui) === JSON.stringify({ live: String(api.live), stale: String(api.stale), unavailable: String(api.unavailable) }) ? 'ok' : `giao diện ${JSON.stringify(ui)} ≠ server ${JSON.stringify(api)}`;
      },
      { message: 'admin-market-health data-live / data-stale / data-unavailable = số cặp theo trạng thái từ server' },
    )
    .toBe('ok');

  // the reconciliation card: nothing ran yet → "Chưa chạy", never a green "KHỚP 100%" / "Sai lệch: 0" (it runs every 10 minutes, or when staff start it)
  const overview = await apiGet<AdminOverview>(page, '/api/v1/admin/overview');
  if (overview.lastReconciliation === null) {
    await expect(page.getByTestId('admin-overview')).toContainText('Chưa chạy');
    await expect(page.getByTestId('admin-overview')).not.toContainText('KHỚP 100%');
    expect(await page.getByTestId('admin-overview').innerText()).not.toMatch(/Sai lệch:\s*0\b/);
  } else {
    test.info().annotations.push({ type: 'note', description: 'đối soát đã chạy trên hệ e2e này: không kiểm nhánh "Chưa chạy" (lastReconciliation ≠ null)' });
  }
});

// AD-07 needs an open futures position whose mark price is not live (FuturesPosition.unrealizedPnl === null). The sim feed of the
// e2e stack has no way to freeze or drop a mark price (server/src/modules/market/sim has no outage hook), so the null state cannot be produced.
// Backend would have to add an e2e-only switch (e.g. a sim "outage" control); then drop `fixme`.
test.fixme('AD-07: vị thế Futures có mark price không live → admin-futures-upnl ghi "—" (không "0.00000000 USDT" xanh) ở chi tiết người dùng', async ({ page, browser, baseURL }) => {
  await signUpStaff(page, 'admin');
  const user = await otherBrowser(browser, baseURL);
  const acc = await signUp(user);
  await apiPost(user, '/api/v1/wallet/faucet');
  await apiPost(user, '/api/v1/futures/transfer', { direction: 'SPOT_TO_FUTURES', asset: 'USDT', amount: '1000' });
  await apiPost(user, '/api/v1/futures/orders', { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.002' });
  // <-- here the mark price of BTCUSDT would be made STALE on the sim feed
  const detail = await apiGet<AdminUserDetail>(page, `/api/v1/admin/users/${acc.id}`);
  expect(detail.futures.unrealizedPnl, 'cần mark STALE: unrealizedPnl phải là null').toBeNull();

  await openUser(page, acc.email);
  await clickTab(page, /Vị thế Futures/);
  await expect(page.getByTestId('admin-futures-upnl').first()).toHaveText(/^—/);
  expect(await page.locator('body').innerText(), 'null không được hiện thành 0').not.toContain('0.00000000 USDT');
  await user.context().close();
});

test.describe('S-13: cờ staffTwoFactorRequired của server (e2e: true)', () => {
  // The admin app may or may not call admin endpoints before it shows the 2FA screen; if it does, the server answers 403 TWO_FACTOR_REQUIRED
  // (a refusal this test provokes on purpose). Any other failing call is still a failure.
  // Strings ("METHOD /path STATUS CODE"), not objects: Playwright reads ANY array whose second element is an object as a fixture tuple
  // `[value, options]` (see ExpectedApiErrorSpec in fixtures.ts). The three calls are the ones the first test can provoke: the overview
  // page, its exchange-settings read, and /admin/users (deep link).
  test.use({
    expectedApiErrors: [
      'GET /api/v1/admin/overview 403 TWO_FACTOR_REQUIRED',
      'GET /api/v1/admin/exchange/settings 403 TWO_FACTOR_REQUIRED',
      'GET /api/v1/admin/users 403 TWO_FACTOR_REQUIRED',
    ],
  });

  test('nhân sự CHƯA bật 2FA mở /admin/ → màn admin-2fa-required, không có dữ liệu tổng quan, không có dải "dev không yêu cầu 2FA"', async ({ page }) => {
    const acc = await signUp(page);
    setRole(acc.email, 'admin'); // staff role, 2FA step skipped on purpose
    const me = await apiGet<Me>(page, '/api/v1/me');
    expect(me.role).toBe('admin');
    expect(me.twoFactorEnabled).toBe(false);
    expect((await apiGet<PublicConfig>(page, '/api/v1/config')).staffTwoFactorRequired, 'hệ e2e giữ mặc định STAFF_REQUIRE_2FA=true').toBe(true);
    const refused = await page.request.get('/api/v1/admin/overview');
    expect(refused.status()).toBe(403);
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe('TWO_FACTOR_REQUIRED');

    await page.goto('/admin/');
    await expect(page.getByTestId('admin-2fa-required'), 'màn bắt buộc bật 2FA').toBeVisible();
    await expect(page.getByTestId('admin-overview'), 'không có dữ liệu tổng quan').toHaveCount(0);
    await expect(page.getByTestId('admin-halt-open')).toHaveCount(0);
    await expect(page.getByTestId('admin-no-2fa-notice'), 'cờ = true: không có dải "Máy chủ dev"').toHaveCount(0);

    // and on a deep link too
    await page.goto('/admin/users');
    await expect(page.getByTestId('admin-2fa-required')).toBeVisible();
    await expect(page.getByTestId('admin-user-search')).toHaveCount(0);
  });

  test('phiên chưa qua 2FA (tài khoản đã bật 2FA ở phiên khác) → mọi lời gọi admin trả TWO_FACTOR_REQUIRED → màn admin-2fa-required, không phải "không có quyền" hay danh sách trống', async ({ page, browser, baseURL }) => {
    const acc = await signUp(page);
    setRole(acc.email, 'admin');
    // a second session signed in BEFORE 2FA is on: enabling 2FA only marks the session that does it as verified
    const stale = await otherBrowser(browser, baseURL);
    await apiPost(stale, '/api/v1/auth/login', { email: acc.email, password: acc.password });
    await enableTwoFactor(page, acc.password);

    const me = await apiGet<Me>(stale, '/api/v1/me');
    expect(me.twoFactorEnabled, 'tài khoản đã bật 2FA').toBe(true);
    const refused = await stale.request.get('/api/v1/admin/overview');
    expect(refused.status(), 'phiên cũ chưa qua 2FA').toBe(403);
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe('TWO_FACTOR_REQUIRED');

    await stale.goto('/admin/users');
    await expect(stale.getByTestId('admin-2fa-required')).toBeVisible();
    await expect(stale.getByTestId('admin-no-access'), 'không báo "không có quyền"').toHaveCount(0);
    await expect(stale.getByTestId('admin-user-row'), 'không hiện danh sách trống/ảo').toHaveCount(0);
    await stale.context().close();
  });
});
