import type { FuturesAccount, FuturesExchangeInfo, FuturesOrder, FuturesPosition, FuturesSymbolSettings, MarkPrice } from '@cex/contracts';
import { dec, floorToStep, initialMargin, roundUp } from '@cex/core';
import type { Dec } from '@cex/core';
import type { Locator, Page } from '@playwright/test';
import { apiGet, apiPost, expect, expectCleanText, signUp, test, toStep } from '../fixtures.ts';

// Acceptance tests for review 8, batch 1: docs/antigravity/PROMPT-17 S-01 (futures order errors + pre-flight check) and
// S-02 (fee, total cost, funding, maximum size on the futures form). Element ids: docs/antigravity/TESTIDS.md,
// section "Rà soát lần 8 (PROMPT-17/18)".
//
// Prices on the e2e stack are simulated (MARKET_FEED=sim) and move all the time, so every number that is compared
// exactly comes from a LIMIT order whose price the test types itself (notional = price × quantity, no market input);
// MARKET numbers are compared with a tolerance. Money is compared as Decimal strings, never as floats.
// The orders in these tests are never confirmed unless the test says so: they would only rest or fill on the sim book.

const SYMBOL = 'BTCUSDT';

interface Rules {
  tick: string;
  step: string;
  minNotional: string;
  takerFee: string;
  makerFee: string;
}
async function rules(page: Page): Promise<Rules> {
  const info = await apiGet<FuturesExchangeInfo>(page, '/api/v1/futures/exchange-info');
  const s = info.symbols.find((x) => x.symbol === SYMBOL)!;
  return { tick: s.tickSize, step: s.stepSize, minNotional: s.minNotional, takerFee: info.fees.takerFee, makerFee: info.fees.makerFee };
}

/** A new verified trader whose futures wallet holds exactly `usdt` (spot faucet → transfer, through the API). */
async function fundedTrader(page: Page, usdt: string) {
  const acc = await signUp(page);
  await apiPost(page, '/api/v1/wallet/faucet');
  await apiPost(page, '/api/v1/futures/transfer', { direction: 'SPOT_TO_FUTURES', asset: 'USDT', amount: usdt });
  return acc;
}

const futuresAccount = (page: Page) => apiGet<FuturesAccount>(page, '/api/v1/futures/account');
const leverageOf = async (page: Page) => (await apiGet<{ items: FuturesSymbolSettings[] }>(page, '/api/v1/futures/settings')).items.find((s) => s.symbol === SYMBOL)!.leverage;

async function setLeverage(page: Page, leverage: number) {
  const r = await page.request.put(`/api/v1/futures/settings/${SYMBOL}/leverage`, { data: { leverage } });
  expect(r.ok(), `PUT leverage ${leverage} → ${r.status()} ${await r.text()}`).toBe(true);
}

/** What the form must show for a LIMIT order (docs PROMPT-17 S-02): margin rounded up, fee at the taker rate rounded up. */
function expectedCost(price: string, quantity: string, leverage: number, takerFee: string) {
  const notional = dec(price).mul(quantity);
  const margin = initialMargin(dec(price), dec(quantity), leverage);
  const fee = roundUp(notional.mul(takerFee));
  return { notional, margin, fee, cost: margin.add(fee) };
}

/** `data-value` of an element the page must show (a clear failure when the element or the attribute is missing). */
async function dataValue(l: Locator, what: string): Promise<string> {
  await expect(l, `${what}: phần tử phải hiển thị`).toBeVisible();
  const v = await l.getAttribute('data-value', { timeout: 5_000 });
  expect(v, `${what}: thiếu thuộc tính data-value`).not.toBeNull();
  return v!;
}
const expectDec = (actual: string, expected: Dec, what: string) => expect(dec(actual).toFixed(8), what).toBe(expected.toFixed(8));

/**
 * The `data-value` of `l` becomes `expected` (polled up to 15 s). The form first computes from a default guess (leverage 10x) until the
 * saved per-symbol settings arrive from the server, so the first render after a reload may show the margin of another leverage.
 */
async function expectDecEventually(l: Locator, expected: Dec, what: string) {
  await expect(l, `${what}: phần tử phải hiển thị`).toBeVisible();
  await expect
    .poll(
      async () => {
        const v = await l.getAttribute('data-value', { timeout: 2_000 }).catch(() => null);
        if (v === null) return 'thiếu data-value';
        try {
          return dec(v).toFixed(8);
        } catch {
          return `data-value không phải số: "${v}"`;
        }
      },
      { message: what, timeout: 15_000 },
    )
    .toBe(expected.toFixed(8));
}

/** The numbers in a Vietnamese text: "1.234,5" → "1234.5", "704" → "704", "704.00" → "704.00". */
function numbersIn(text: string): string[] {
  return (text.match(/\d[\d.,]*/g) ?? []).map((raw) => {
    const t = raw.replace(/[.,]+$/, '');
    if (t.includes(',')) return t.replace(/\./g, '').replace(',', '.');
    if (/^\d{1,3}(\.\d{3})+$/.test(t)) return t.replace(/\./g, '');
    return t;
  });
}
/** Does the text contain a number equal to `expected` (± `tolerance`)? */
function hasNumber(text: string, expected: Dec, tolerance = '0.01'): boolean {
  return numbersIn(text).some((n) => {
    try {
      return dec(n).sub(expected).abs().lte(tolerance);
    } catch {
      return false;
    }
  });
}

/** Opens /futures/BTCUSDT on the LIMIT tab with the price and the quantity (in coin) typed in. */
async function fillLimitForm(page: Page, price: string, quantity: string) {
  await page.goto(`/futures/${SYMBOL}`);
  await page.getByTestId('futures-order-type-limit').click();
  await page.getByTestId('futures-unit-coin').click();
  await page.getByTestId('futures-price').fill(price);
  await page.getByTestId('futures-qty').fill(quantity);
}

/**
 * The support-chat widget (AiAssistantWidget) greets with a bubble about 1,2 s after every page load and keeps it until it is closed; its fixed
 * box (pointer-events: auto) then covers the right-hand end of the order buttons ("Mở Short", part of "Mở Long") and the "Chuyển từ Spot" link.
 * A user closes the bubble; so do the tests before they click there. That the box covers the buttons at all is its own test below.
 */
async function closeSupportBubble(page: Page) {
  await page.getByTitle('Đóng thông báo').first().click({ timeout: 6_000 }).catch(() => undefined);
}

const positions = (page: Page) => apiGet<{ items: FuturesPosition[] }>(page, '/api/v1/futures/positions');
const openOrders = (page: Page) => apiGet<{ items: FuturesOrder[] }>(page, '/api/v1/futures/orders/open');

test('S-01: ví Futures 100 USDT, lệnh 0,1 BTC → Mở Long/Short khóa, lý do ghi số tiền còn thiếu; "Chuyển từ Spot" mở hộp chuyển và đủ tiền thì mở khóa', async ({ page }) => {
  await fundedTrader(page, '100');
  const r = await rules(page);
  const leverage = await leverageOf(page);
  const price = '80000';
  const quantity = '0.1';
  const want = expectedCost(price, quantity, leverage, r.takerFee);
  const missing = want.cost.sub('100');
  expect(missing.gt(0), 'thiết lập của test: chi phí phải lớn hơn ví').toBe(true);

  await fillLimitForm(page, price, quantity);
  expectDec(await dataValue(page.getByTestId('futures-est-cost'), 'Tổng cần'), want.cost, `tổng cần = ký quỹ + phí (x${leverage})`);

  // the order cannot be afforded: both buttons are locked and the reason says how much is missing (client-side pre-flight check)
  await expect(page.getByTestId('futures-open-long')).toBeDisabled();
  await expect(page.getByTestId('futures-open-short')).toBeDisabled();
  const reason = page.getByTestId('futures-order-block-reason');
  await expect(reason).toBeVisible();
  await expect(reason).toContainText(/cần thêm/i);
  await expect.poll(async () => hasNumber(await reason.innerText(), missing), { message: `lý do phải ghi số còn thiếu ≈ ${missing.toFixed(2)} USDT (tổng cần − khả dụng)` }).toBe(true);
  expect(hasNumber(await reason.innerText(), dec('100')), 'lý do ghi cả số khả dụng (100)').toBe(true);

  // "Chuyển từ Spot" opens the transfer dialog; moving enough money unlocks the buttons
  await closeSupportBubble(page);
  await page.getByRole('button', { name: 'Chuyển từ Spot' }).click();
  await expect(page.getByTestId('transfer-amount')).toBeVisible();
  await page.getByTestId('transfer-amount').fill('1000');
  await page.getByTestId('transfer-submit').click();
  await expect.poll(async () => dec((await futuresAccount(page)).walletBalance).toFixed(8), 'server phải ghi ví Futures = 1.100').toBe('1100.00000000');
  await expect(page.getByTestId('futures-open-long')).toBeEnabled();
  await expect(page.getByTestId('futures-order-block-reason')).toHaveCount(0);
  expect((await openOrders(page)).items, 'chưa đặt lệnh nào').toHaveLength(0);
});

test('S-01: giá trị lệnh dưới mức tối thiểu → Mở Long/Short khóa, lý do ghi mức tối thiểu và giá trị hiện tại', async ({ page }) => {
  await fundedTrader(page, '1000');
  const r = await rules(page);
  // 0,001 BTC at 20.000 = 20 USDT < minNotional (50)
  const price = '20000';
  const quantity = '0.001';
  expect(dec(price).mul(quantity).lt(r.minNotional)).toBe(true);

  await fillLimitForm(page, price, quantity);
  await expect(page.getByTestId('futures-open-long')).toBeDisabled();
  await expect(page.getByTestId('futures-open-short')).toBeDisabled();
  const reason = page.getByTestId('futures-order-block-reason');
  await expect(reason).toBeVisible();
  await expect.poll(async () => hasNumber(await reason.innerText(), dec(r.minNotional), '0'), { message: `lý do phải ghi mức tối thiểu ${r.minNotional} USDT` }).toBe(true);
  expect(hasNumber(await reason.innerText(), dec(price).mul(quantity), '0'), 'lý do ghi giá trị lệnh hiện tại (20)').toBe(true);
  expect((await openOrders(page)).items).toHaveLength(0);
});

test('S-02: giá trị / ký quỹ / phí / tổng cần khớp công thức @cex/core ở x20 rồi x10 (đổi đòn bẩy → ký quỹ đổi); có dòng funding', async ({ page }) => {
  await fundedTrader(page, '5000');
  const r = await rules(page);
  const mark = await apiGet<MarkPrice>(page, '/api/v1/futures/market/mark/BTCUSDT');
  expect(mark.fundingRate, 'sim phải có funding rate').not.toBeNull();
  const price = '80000';
  const quantity = '0.1';
  const margins: Record<number, Dec> = {};

  for (const leverage of [20, 10]) {
    await setLeverage(page, leverage);
    await fillLimitForm(page, price, quantity); // page.goto = reload: the page reads the leverage saved on the server
    const want = expectedCost(price, quantity, leverage, r.takerFee);
    margins[leverage] = want.margin;
    await expectDecEventually(page.getByTestId('futures-est-notional'), want.notional, `giá trị lệnh x${leverage}`);
    await expectDecEventually(page.getByTestId('futures-est-margin'), want.margin, `ký quỹ ban đầu = initialMargin(giá, khối lượng, ${leverage}) làm tròn lên`);
    await expectDecEventually(page.getByTestId('futures-est-fee'), want.fee, `phí mở = roundUp(giá trị × takerFee ${r.takerFee})`);
    await expectDecEventually(page.getByTestId('futures-est-cost'), want.cost, `tổng cần = ký quỹ + phí (x${leverage})`);
  }
  expect(margins[10]!.toFixed(8), 'đổi x20 → x10: ký quỹ gấp đôi').toBe(margins[20]!.mul(2).toFixed(8));

  // fee line: the taker rate; LIMIT adds the maker note ("khớp maker … thì hoàn phần chênh")
  const feeText = (await page.getByTestId('futures-est-fee').innerText()).replace(/\s+/g, ' ');
  expect(feeText, 'ghi tỉ lệ taker').toMatch(/taker/i);
  expect(hasNumber(feeText, dec(r.takerFee).mul(100), '0.0001'), `ghi tỉ lệ taker ${dec(r.takerFee).mul(100).toString()}%`).toBe(true);
  expect(feeText, 'lệnh LIMIT: ghi chú maker').toMatch(/maker/i);

  // funding: "{rate}% · còn {countdown}", with who pays (sim rate is always > 0: Long pays Short)
  const funding = page.getByTestId('futures-est-funding');
  await expect(funding).toBeVisible();
  const fundingText = (await funding.innerText()).replace(/\s+/g, ' ');
  expect(fundingText).toMatch(/còn/i);
  expect(hasNumber(fundingText, dec(mark.fundingRate!).mul(100), '0.0005'), `funding ghi tỉ lệ ${dec(mark.fundingRate!).mul(100).toString()}%`).toBe(true);
  if (dec(mark.fundingRate!).gt(0)) expect(fundingText, 'rate > 0: Long trả Short').toMatch(/Long trả Short/i);
  await expectCleanText(page);
});

test('S-02: lệnh MARKET tính theo giá mark và chỉ ghi phí taker (không có ghi chú maker)', async ({ page }) => {
  await fundedTrader(page, '5000');
  const r = await rules(page);
  await page.goto(`/futures/${SYMBOL}`);
  await page.getByTestId('futures-order-type-market').click();
  await page.getByTestId('futures-unit-coin').click();
  await page.getByTestId('futures-qty').fill('0.1');
  const leverage = await leverageOf(page);

  const ids = ['futures-est-notional', 'futures-est-margin', 'futures-est-fee', 'futures-est-cost'] as const;
  for (const id of ids) await dataValue(page.getByTestId(id), id); // present with a data-value
  // the mark price moves on the sim stack every second: read the four numbers in ONE synchronous DOM read so they belong to the same render
  const snap = await page.evaluate((list) => Object.fromEntries(list.map((id) => [id, document.querySelector(`[data-testid="${id}"]`)?.getAttribute('data-value') ?? null])), [...ids]);
  const notional = dec(snap['futures-est-notional']!);

  // the reference price of a MARKET order is the mark price: compare with a read taken right after, within 0,5 %
  const mark = dec((await apiGet<MarkPrice>(page, '/api/v1/futures/market/mark/BTCUSDT')).markPrice!);
  expect(notional.sub(mark.mul('0.1')).abs().div(mark.mul('0.1')).lt('0.005'), `giá trị lệnh Market ${notional.toString()} phải ≈ mark × 0,1 = ${mark.mul('0.1').toString()}`).toBe(true);

  // margin, fee and total are the formulas applied to the displayed notional (exact)
  const margin = roundUp(notional.div(leverage));
  const fee = roundUp(notional.mul(r.takerFee));
  expectDec(snap['futures-est-margin']!, margin, 'ký quỹ = giá trị ÷ đòn bẩy (làm tròn lên)');
  expectDec(snap['futures-est-fee']!, fee, 'phí = giá trị × taker (làm tròn lên)');
  expectDec(snap['futures-est-cost']!, margin.add(fee), 'tổng cần = ký quỹ + phí');
  expect(await page.getByTestId('futures-est-fee').innerText(), 'lệnh Market: không có ghi chú maker').not.toMatch(/maker/i);
});

test('S-02: "Tối đa mở được" Long/Short = khả dụng ÷ (giá/đòn bẩy + giá × taker) làm tròn xuống theo bước; nút "Tối đa" điền đúng số đó', async ({ page }) => {
  await fundedTrader(page, '1000');
  const r = await rules(page);
  const leverage = await leverageOf(page);
  const price = '80000';
  const available = dec((await futuresAccount(page)).available);
  const perUnit = dec(price).div(leverage).add(dec(price).mul(r.takerFee));
  const max = floorToStep(available.div(perUnit), dec(r.step));
  expect(max.gt(0), 'thiết lập của test: tối đa phải > 0').toBe(true);

  await fillLimitForm(page, price, '0.001');
  await expect.poll(async () => dec(await dataValue(page.getByTestId('futures-max-long'), 'Tối đa Long')).toFixed(8), { message: `tối đa Long = ${max.toString()} BTC (LIMIT: không bị giới hạn bởi sổ lệnh)` }).toBe(max.toFixed(8));
  expectDec(await dataValue(page.getByTestId('futures-max-short'), 'Tối đa Short'), max, 'tối đa Short');

  await page.getByRole('button', { name: 'Tối đa', exact: true }).click();
  await expect.poll(async () => dec((await page.getByTestId('futures-qty').inputValue()) || '0').toFixed(8), { message: 'nút Tối đa điền khối lượng tối đa vào ô khối lượng' }).toBe(max.toFixed(8));
  // and what it filled is affordable: nothing locks the buttons
  await expect(page.getByTestId('futures-open-long')).toBeEnabled();
  await expect(page.getByTestId('futures-order-block-reason')).toHaveCount(0);
});

test('S-02: hộp xác nhận đặt lệnh hiện cùng giá trị / ký quỹ / phí / tổng cần với form', async ({ page }) => {
  await fundedTrader(page, '5000');
  const r = await rules(page);
  const leverage = await leverageOf(page);
  const price = '80000';
  const quantity = '0.1';
  const want = expectedCost(price, quantity, leverage, r.takerFee);

  await fillLimitForm(page, price, quantity);
  await expect(page.getByTestId('futures-open-long')).toBeEnabled();
  await closeSupportBubble(page);
  await page.getByTestId('futures-open-long').click();
  await expect(page.getByTestId('order-confirm'), 'preferences.confirmOrders bật mặc định: hộp xác nhận hiện').toBeVisible();
  expectDec(await dataValue(page.getByTestId('futures-confirm-notional'), 'Xác nhận: giá trị'), want.notional, 'hộp xác nhận: giá trị lệnh');
  expectDec(await dataValue(page.getByTestId('futures-confirm-margin'), 'Xác nhận: ký quỹ'), want.margin, 'hộp xác nhận: ký quỹ');
  expectDec(await dataValue(page.getByTestId('futures-confirm-fee'), 'Xác nhận: phí'), want.fee, 'hộp xác nhận: phí mở');
  expectDec(await dataValue(page.getByTestId('futures-confirm-cost'), 'Xác nhận: tổng cần'), want.cost, 'hộp xác nhận: tổng cần');

  // not confirmed: nothing was placed
  await page.keyboard.press('Escape');
  expect((await openOrders(page)).items).toHaveLength(0);
  expect((await positions(page)).items).toHaveLength(0);
});

// Wrong-side take-profit: the server answers INVALID_TPSL (400) with details.markPrice; a client pre-check that stops the
// order earlier is fine too — what matters is that the user is told which way is right and that nothing was opened.
test.describe('S-01: TP/SL sai phía', () => {
  test.use({ expectedApiErrors: [{ method: 'POST', path: '/api/v1/futures/orders', status: 400, code: 'INVALID_TPSL' }] });

  for (const side of ['LONG', 'SHORT'] as const) {
    test(`${side}: chốt lời sai phía → thông báo nói rõ chiều đúng (${side === 'LONG' ? 'cao hơn' : 'thấp hơn'} giá mark) và không mở vị thế`, async ({ page }) => {
      await fundedTrader(page, '1000');
      const r = await rules(page);
      const mark = Number((await apiGet<MarkPrice>(page, '/api/v1/futures/market/mark/BTCUSDT')).markPrice);
      // LONG: TP below the mark (wrong), SL below it (right). SHORT: TP above the mark (wrong), SL above it (right).
      const tp = toStep(mark * (side === 'LONG' ? 0.95 : 1.05), r.tick);
      const sl = toStep(mark * (side === 'LONG' ? 0.9 : 1.1), r.tick);

      await page.goto(`/futures/${SYMBOL}`);
      await page.getByTestId('futures-order-type-market').click();
      await page.getByTestId('futures-unit-coin').click();
      await page.getByTestId('futures-qty').fill('0.002');
      await page.getByTestId('futures-tpsl-toggle').check();
      await page.getByTestId('futures-order-tp').fill(tp);
      await page.getByTestId('futures-order-sl').fill(sl);

      // The form is ready once the contract and the mark price are loaded: until then its button is disabled ("Đang tải thông tin hợp đồng…")
      // and isEnabled() below would be false for that reason only — the total cost of the typed quantity is positive only after both arrived.
      await expect(page.getByTestId('futures-est-cost'), 'form chưa tính được chi phí (hợp đồng / giá mark chưa tải)').toHaveAttribute('data-value', /[1-9]/);
      await closeSupportBubble(page);
      const open = page.getByTestId(side === 'LONG' ? 'futures-open-long' : 'futures-open-short');
      // a form that already refuses the wrong-side TP (disabled button + the message) is as good as a server refusal: only click an enabled button
      if (await open.isEnabled({ timeout: 5_000 })) {
        await open.click();
        // the confirmation box (preferences.confirmOrders) — absent if the form already refused the order
        const confirm = page.getByTestId('order-confirm');
        await confirm.waitFor({ state: 'visible', timeout: 3_000 }).then(() => confirm.click(), () => undefined);
      }
      const expected = side === 'LONG' ? /chốt lời[^.]*cao hơn/i : /chốt lời[^.]*thấp hơn/i;
      await expect(page.getByText(expected).first(), `thông báo phải nói chốt lời phải ${side === 'LONG' ? 'cao hơn' : 'thấp hơn'} giá mark`).toBeVisible();

      expect((await positions(page)).items, 'không mở vị thế').toHaveLength(0);
      expect((await openOrders(page)).items, 'không có lệnh chờ').toHaveLength(0);
      expect(dec((await futuresAccount(page)).available).toFixed(8), 'ví Futures không đổi').toBe('1000.00000000');
    });
  }
});

test('Mở Long / Mở Short bấm được ở 1440×900: không có hộp nổi nào (chat hỗ trợ) phủ lên nút', async ({ page }) => {
  await fundedTrader(page, '1000');
  await page.goto(`/futures/${SYMBOL}`);
  await expect(page.getByTestId('futures-open-short')).toBeVisible();
  // the greeting bubble of the support chat appears ~1,2 s after load; wait for it (when the widget has none, there is nothing to cover the buttons)
  await page.getByTitle('Đóng thông báo').first().waitFor({ state: 'visible', timeout: 6_000 }).catch(() => undefined);

  for (const id of ['futures-open-long', 'futures-open-short']) {
    // what a mouse click on the centre of the button would hit
    const hit = await page.getByTestId(id).evaluate((el) => {
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return top && !el.contains(top) ? `<${top.tagName.toLowerCase()} class="${String(top.className).slice(0, 80)}">` : null;
    });
    expect(hit, `${id}: bấm vào giữa nút trúng ${hit ?? '(chính nút)'} chứ không phải nút`).toBeNull();
  }
});
