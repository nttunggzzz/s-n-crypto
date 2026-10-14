import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { ADMIN_TAX_EXPORT_COLUMNS, ApiError, TAX_EXPORT_COLUMNS } from '@cex/contracts';
import { exchangeSettings, taxWithholdings, trades } from '../../db/schema.ts';
import { marketTrade, setBook } from '../../../test/helpers.ts';
import { ApiHarness } from '../../../test/apiHarness.ts';
import { periodRange, vnMonthStart, vnYearNow, yearRange } from './period.ts';

/**
 * Batch T3 (module T section 3.7): the tax reports - periods in Vietnam time, user summary, record list, CSV, admin summary.
 * Data is built with REAL orders (placeOrder through HTTP) except the time-boundary test, which inserts records with a
 * fixed created_at for trades that were really made. Expected values are computed by hand in the comments.
 *
 * ORDER MATTERS: the admin-summary block runs first on purpose - it sums the whole CURRENT month, so it must be the
 * first thing that creates withholding records in this file's database.
 */
const h = new ApiHarness();
const db = () => h.env.database.db;

async function expectApiError(p: Promise<unknown>, code: string, status: number) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof ApiError && e.code === code && e.status === status);
}
/** Raw GET (to send what the typed client would not: a bad query). */
async function rawGet(b: { cookie: () => string }, path: string) {
  const res = await fetch(`${h.base}${path}`, { headers: { cookie: b.cookie() } });
  const text = await res.text();
  let error: { code?: string } | undefined;
  try {
    error = (JSON.parse(text) as { error?: { code: string } }).error;
  } catch {
    // csv
  }
  return { status: res.status, code: error?.code, text };
}

async function setTax(mode: 'OFF' | 'WITHHOLD', rate = '0.001', vnd: string | null = '26350') {
  await db().update(exchangeSettings).set({ taxMode: mode, taxRate: rate, taxVndRate: vnd }).where(eq(exchangeSettings.id, 1));
  await h.env.ex.config.reload();
}
type U = Awaited<ReturnType<typeof h.user>>;
async function funded(): Promise<U> {
  const u = await h.user();
  await u.b.faucetClaim({ body: {} });
  return u;
}
const buy = (u: U, symbol: string, quantity: string) => u.b.placeOrder({ body: { symbol, side: 'BUY', type: 'MARKET', quantity } });
const sell = (u: U, symbol: string, quantity: string) => u.b.placeOrder({ body: { symbol, side: 'SELL', type: 'MARKET', quantity } });
const profile = (u: U, category: 'INDIVIDUAL' | 'FOREIGN_ORG' | 'DOMESTIC_ORG') => u.b.taxUpdateProfile({ body: { category } });
/** Current month in Vietnam time, "YYYY-MM". */
const vnNow = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 7);

beforeAll(async () => {
  await h.start();
});
afterAll(async () => {
  await h.stop();
});
beforeEach(async () => {
  h.env.clock.ms = Date.now();
  setBook(h.env, 'BTCUSDT', [['99.00', '100.00000']], [['100.00', '100.00000']]);
  setBook(h.env, 'ETHUSDT', [['2000.00', '100.0000']], [['2001.00', '100.0000']]);
  marketTrade(h.env, 'BTCUSDT', '99.50');
  marketTrade(h.env, 'ETHUSDT', '2000.50');
});

// ───────────────────────────── 1. periods (pure)

describe('period.ts - Vietnam time (UTC+7)', () => {
  it('periodRange: months and quarters, year change, last millisecond INCLUDED', () => {
    const iso = (p: string) => {
      const r = periodRange(p);
      return [r.from.toISOString(), r.to.toISOString()];
    };
    expect(iso('2026-10')).toEqual(['2026-09-30T17:00:00.000Z', '2026-10-31T16:59:59.999Z']); // the example of the contract
    expect(iso('2026-01')).toEqual(['2025-12-31T17:00:00.000Z', '2026-01-31T16:59:59.999Z']);
    expect(iso('2026-12')).toEqual(['2026-11-30T17:00:00.000Z', '2026-12-31T16:59:59.999Z']); // into the next year
    expect(iso('2026-Q1')).toEqual(['2025-12-31T17:00:00.000Z', '2026-03-31T16:59:59.999Z']);
    expect(iso('2026-Q4')).toEqual(['2026-09-30T17:00:00.000Z', '2026-12-31T16:59:59.999Z']);
    expect(iso('2028-02')).toEqual(['2028-01-31T17:00:00.000Z', '2028-02-29T16:59:59.999Z']); // leap year
    expect(() => periodRange('2026-13')).toThrow();
    expect(() => periodRange('2026-Q5')).toThrow();
  });

  it('vnMonthStart(year, 13) is January of the next year; yearRange covers exactly one year; vnYearNow follows UTC+7', () => {
    expect(vnMonthStart(2026, 13).toISOString()).toBe('2026-12-31T17:00:00.000Z');
    expect([yearRange(2026).from.toISOString(), yearRange(2026).to.toISOString()]).toEqual(['2025-12-31T17:00:00.000Z', '2026-12-31T16:59:59.999Z']);
    expect(vnYearNow(new Date('2026-12-31T16:59:59.999Z'))).toBe(2026);
    expect(vnYearNow(new Date('2026-12-31T17:00:00.000Z'))).toBe(2027);
  });
});

// ───────────────────────────── 2. admin summary (FIRST data of the file, see the note on top)

describe('admin tax summary / list / CSV', () => {
  const ids: { u1: string; u2: string; u3: string } = { u1: '', u2: '', u3: '' };

  it('byCategory has all 3 rows in enum order, bySymbol is sorted by tax NUMERICALLY, userCount and VND sums are exact', async () => {
    await setTax('WITHHOLD', '0.01', '25000');
    // U1 INDIVIDUAL: BTC 5 @ 99 = 495 -> tax 4.95 ; ETH 0.25 @ 2000 = 500 -> tax 5
    // U2 FOREIGN_ORG: BTC 6 @ 99 = 594 -> tax 5.94 ; ETH 0.245 @ 2000 = 490 -> tax 4.9
    // U3 DOMESTIC_ORG sells too but is not withheld
    const u1 = await funded();
    const u2 = await funded();
    const u3 = await funded();
    Object.assign(ids, { u1: u1.id, u2: u2.id, u3: u3.id });
    await profile(u2, 'FOREIGN_ORG');
    await profile(u3, 'DOMESTIC_ORG');
    for (const [u, btcBuy, ethBuy] of [[u1, '6', '0.3'], [u2, '7', '0.3'], [u3, '1', '0.1']] as const) {
      await buy(u, 'BTCUSDT', btcBuy);
      await buy(u, 'ETHUSDT', ethBuy);
    }
    await sell(u1, 'BTCUSDT', '5');
    await sell(u1, 'ETHUSDT', '0.25');
    await sell(u2, 'BTCUSDT', '6');
    await sell(u2, 'ETHUSDT', '0.245');
    await sell(u3, 'BTCUSDT', '0.5');

    const admin = await h.staff('admin');
    const s = await admin.b.adminTaxSummary({ query: { period: vnNow() } });
    const zero = { withholdingCount: 0, withheldGrossQuote: '0.00000000', taxAmount: '0.00000000', withheldGrossVnd: '0', taxVnd: '0', vndMissingCount: 0, userCount: 0 };
    expect(s.asset).toBe('USDT');
    // 4 records, 2 users: gross 495+500+594+490 = 2079 ; tax 4.95+5+5.94+4.9 = 20.79
    // VND (rate 25000): gross 51,975,000 ; tax 123,750+125,000+148,500+122,500 = 519,750
    expect(s.totals).toEqual({ withholdingCount: 4, userCount: 2, withheldGrossQuote: '2079.00000000', taxAmount: '20.79000000', withheldGrossVnd: '51975000', taxVnd: '519750', vndMissingCount: 0 });
    expect(s.byCategory.map((c) => c.category)).toEqual(['INDIVIDUAL', 'FOREIGN_ORG', 'DOMESTIC_ORG']);
    expect(s.byCategory[0]).toEqual({ category: 'INDIVIDUAL', withholdingCount: 2, userCount: 1, withheldGrossQuote: '995.00000000', taxAmount: '9.95000000', withheldGrossVnd: '24875000', taxVnd: '248750', vndMissingCount: 0 });
    expect(s.byCategory[1]).toEqual({ category: 'FOREIGN_ORG', withholdingCount: 2, userCount: 1, withheldGrossQuote: '1084.00000000', taxAmount: '10.84000000', withheldGrossVnd: '27100000', taxVnd: '271000', vndMissingCount: 0 });
    expect(s.byCategory[2]).toEqual({ category: 'DOMESTIC_ORG', ...zero }); // never withheld, the row is still there
    // BTCUSDT 4.95 + 5.94 = 10.89 ; ETHUSDT 5 + 4.9 = 9.9 -> BTC first (as strings '10.89...' < '9.9...': a string sort would be wrong)
    expect(s.bySymbol).toEqual([
      { symbol: 'BTCUSDT', withholdingCount: 2, userCount: 2, withheldGrossQuote: '1089.00000000', taxAmount: '10.89000000', withheldGrossVnd: '27225000', taxVnd: '272250', vndMissingCount: 0 },
      { symbol: 'ETHUSDT', withholdingCount: 2, userCount: 2, withheldGrossQuote: '990.00000000', taxAmount: '9.90000000', withheldGrossVnd: '24750000', taxVnd: '247500', vndMissingCount: 0 },
    ]);
    // the same month as a quarter holds the same records
    const q = Math.ceil(Number(vnNow().slice(5)) / 3);
    const quarter = await admin.b.adminTaxSummary({ query: { period: `${vnNow().slice(0, 4)}-Q${q}` } });
    expect(quarter.totals).toEqual(s.totals);
    // from / to of the contract example, independent of the data
    const oct = await admin.b.adminTaxSummary({ query: { period: '2026-10' } });
    expect([oct.period, oct.from, oct.to]).toEqual(['2026-10', '2026-09-30T17:00:00.000Z', '2026-10-31T16:59:59.999Z']);
    // a period without records: zeros, 3 category rows, no symbol rows
    const empty = await admin.b.adminTaxSummary({ query: { period: '2020-02' } });
    expect(empty.totals).toEqual({ ...zero });
    expect(empty.byCategory).toHaveLength(3);
    expect(empty.bySymbol).toEqual([]);
  });

  it('list: newest first, userId and symbol filters, pagination, every row carries userId', async () => {
    const admin = await h.staff('support'); // support has tax.read
    const all = await admin.b.adminTaxWithholdings({ query: { limit: 50 } });
    expect(all.items).toHaveLength(4);
    expect(all.nextCursor).toBeNull();
    const idsDesc = all.items.map((r) => Number(r.id));
    expect(idsDesc).toEqual([...idsDesc].sort((a, b) => b - a));
    expect(new Set(all.items.map((r) => r.userId))).toEqual(new Set([ids.u1, ids.u2])); // U3 (domestic) has none
    const mine = await admin.b.adminTaxWithholdings({ query: { userId: ids.u1, limit: 50 } });
    expect(mine.items.map((r) => [r.userId, r.symbol, r.category, r.taxAmount])).toEqual([
      [ids.u1, 'ETHUSDT', 'INDIVIDUAL', '5.00000000'],
      [ids.u1, 'BTCUSDT', 'INDIVIDUAL', '4.95000000'],
    ]);
    const eth = await admin.b.adminTaxWithholdings({ query: { symbol: 'ETHUSDT', limit: 50 } });
    expect(eth.items.map((r) => r.symbol)).toEqual(['ETHUSDT', 'ETHUSDT']);
    const p1 = await admin.b.adminTaxWithholdings({ query: { limit: 3 } });
    expect(p1.items).toHaveLength(3);
    const p2 = await admin.b.adminTaxWithholdings({ query: { limit: 3, cursor: p1.nextCursor! } });
    expect([p2.items.length, p2.nextCursor]).toEqual([1, null]);
    expect(await admin.b.adminTaxWithholdings({ query: { userId: ids.u3, limit: 50 } })).toEqual({ items: [], nextCursor: null });
  });

  it('CSV: ADMIN_TAX_EXPORT_COLUMNS header after the BOM, one line per record, userId column filled', async () => {
    const admin = await h.staff('admin');
    const text = await admin.b.adminTaxExport({ query: {} });
    const lines = text.split('\r\n');
    expect(lines[0]).toBe('﻿' + ADMIN_TAX_EXPORT_COLUMNS.join(','));
    expect(lines.filter((l) => l !== '')).toHaveLength(1 + 4);
    const userCol = ADMIN_TAX_EXPORT_COLUMNS.indexOf('userId');
    expect([ids.u1, ids.u2]).toContain(lines[1]!.split(',')[userCol]);
    const onlyU2 = (await admin.b.adminTaxExport({ query: { userId: ids.u2 } })).split('\r\n').filter((l) => l !== '');
    expect(onlyU2).toHaveLength(1 + 2);
    expect(onlyU2.slice(1).every((l) => l.split(',')[userCol] === ids.u2)).toBe(true);
  });

  it('permissions: a plain user gets 403, no session gets 401, bad periods / cursors get 400', async () => {
    const user = await h.user();
    const anon = h.browser();
    const support = await h.staff('support');
    for (const call of [
      (b: typeof user.b) => b.adminTaxSummary({ query: { period: '2026-10' } }),
      (b: typeof user.b) => b.adminTaxWithholdings({ query: { limit: 5 } }),
      (b: typeof user.b) => b.adminTaxExport({ query: {} }),
    ]) {
      await expectApiError(call(user.b), 'FORBIDDEN', 403);
      await expectApiError(call(anon), 'UNAUTHENTICATED', 401);
      await call(support.b); // tax.read is enough
    }
    for (const path of ['/api/v1/admin/tax/summary', '/api/v1/admin/tax/summary?period=2026-13', '/api/v1/admin/tax/summary?period=2026-Q5', '/api/v1/admin/tax/summary?period=2026', '/api/v1/admin/tax/withholdings?cursor=abc', '/api/v1/admin/tax/withholdings?userId=not-a-uuid']) {
      const r = await rawGet(support.b, path);
      expect([r.status, r.code], path).toEqual([400, 'VALIDATION_ERROR']);
    }
  });
});

// ───────────────────────────── 3. the user's summary

describe('taxSummary (user)', () => {
  it('12 months, totals = sum of the records, a record without a VND rate makes the VND of that month and of the total null, sales count the sells made while the tax was OFF', async () => {
    const a = await funded();
    await buy(a, 'BTCUSDT', '1'); // 0.999 BTC
    await setTax('OFF');
    const a1 = await sell(a, 'BTCUSDT', '0.1'); // OFF: sale 9.9, fee 0.0099, no record
    await setTax('WITHHOLD', '0.001', '26350');
    const a2 = await sell(a, 'BTCUSDT', '0.2'); // gross 19.8 -> tax 0.0198 ; VND gross 521,730 , tax ceil(521.73) = 522
    await setTax('WITHHOLD', '0.001', null);
    const a3 = await sell(a, 'BTCUSDT', '0.1'); // gross 9.9 -> tax 0.0099 ; no VND rate then
    await setTax('OFF');
    // pick the realized PnL by hand so the SQL sum is checkable: 1.5 , -0.25 , none (no cost basis)
    await db().update(trades).set({ realizedPnl: '1.5' }).where(eq(trades.orderId, Number(a1.order.id)));
    await db().update(trades).set({ realizedPnl: '-0.25' }).where(eq(trades.orderId, Number(a2.order.id)));
    await db().update(trades).set({ realizedPnl: null }).where(eq(trades.orderId, Number(a3.order.id)));

    const s = await a.b.taxSummary({ query: {} });
    expect([s.year, s.asset, s.category]).toEqual([vnYearNow(), 'USDT', 'INDIVIDUAL']);
    expect(s.months.map((m) => m.month)).toEqual(Array.from({ length: 12 }, (_, i) => `${s.year}-${String(i + 1).padStart(2, '0')}`));
    const now = s.months.find((m) => m.month === vnNow())!;
    // withheld: 2 records, gross 19.8 + 9.9 = 29.7, tax 0.0198 + 0.0099 = 0.0297 ; VND unknown for one -> null
    // sales: 3 sells, gross 9.9 + 19.8 + 9.9 = 39.6, fees 0.0099 + 0.0198 + 0.0099 = 0.0396, PnL 1.5 - 0.25 = 1.25, 1 without cost basis
    const expected = {
      withholdingCount: 2,
      withheldGrossQuote: '29.70000000',
      taxAmount: '0.02970000',
      withheldGrossVnd: null,
      taxVnd: null,
      vndMissingCount: 1,
      sellCount: 3,
      sellGrossQuote: '39.60000000',
      sellFees: '0.03960000',
      realizedPnl: '1.25000000',
      sellsWithoutCostBasis: 1,
    };
    expect(now).toEqual({ month: vnNow(), ...expected });
    expect(s.totals).toEqual(expected);
    const other = s.months.filter((m) => m.month !== vnNow());
    expect(other).toHaveLength(11);
    for (const m of other) {
      expect(m).toEqual({ month: m.month, withholdingCount: 0, withheldGrossQuote: '0.00000000', taxAmount: '0.00000000', withheldGrossVnd: '0', taxVnd: '0', vndMissingCount: 0, sellCount: 0, sellGrossQuote: '0.00000000', sellFees: '0.00000000', realizedPnl: '0.00000000', sellsWithoutCostBasis: 0 });
    }
    // a year without anything: 12 zero rows
    const old = await a.b.taxSummary({ query: { year: 2021 } });
    expect([old.year, old.months.length, old.totals.sellCount, old.totals.taxVnd]).toEqual([2021, 12, 0, '0']);
  });

  it('with a VND rate the VND sums are whole dong; a DOMESTIC_ORG seller has sales but no withholding', async () => {
    await setTax('WITHHOLD', '0.001', '26350');
    const b = await funded();
    await buy(b, 'BTCUSDT', '1');
    await sell(b, 'BTCUSDT', '0.3'); // gross 29.7, tax 0.0297 ; VND gross 782,595 , tax ceil(782.595) = 783
    const sb = await b.b.taxSummary({ query: {} });
    expect(sb.totals).toMatchObject({ withholdingCount: 1, withheldGrossQuote: '29.70000000', taxAmount: '0.02970000', withheldGrossVnd: '782595', taxVnd: '783', vndMissingCount: 0, sellCount: 1 });

    const org = await funded();
    await profile(org, 'DOMESTIC_ORG');
    await buy(org, 'BTCUSDT', '1');
    await sell(org, 'BTCUSDT', '0.3');
    const so = await org.b.taxSummary({ query: {} });
    expect(so.category).toBe('DOMESTIC_ORG');
    expect(so.totals).toMatchObject({ withholdingCount: 0, taxAmount: '0.00000000', sellCount: 1, sellGrossQuote: '29.70000000', sellFees: '0.02970000' });
    await setTax('OFF');
  });

  it('each user sees only their own data in all three endpoints; a user with nothing gets zeros / empty', async () => {
    await setTax('WITHHOLD', '0.001', '26350');
    const x = await funded();
    const y = await funded();
    await buy(x, 'BTCUSDT', '1');
    await sell(x, 'BTCUSDT', '0.3');
    await setTax('OFF');
    expect((await x.b.taxSummary({ query: {} })).totals.withholdingCount).toBe(1);
    expect((await x.b.taxWithholdings({ query: { limit: 10 } })).items).toHaveLength(1);
    // Y has no sale and no record, but X's one exists in the same database
    const sy = await y.b.taxSummary({ query: {} });
    expect([sy.totals.withholdingCount, sy.totals.taxAmount, sy.totals.sellCount, sy.totals.sellGrossQuote]).toEqual([0, '0.00000000', 0, '0.00000000']);
    expect(await y.b.taxWithholdings({ query: { limit: 10 } })).toEqual({ items: [], nextCursor: null });
    const csvY = (await y.b.taxExport({ query: {} })).split('\r\n').filter((l) => l !== '');
    expect(csvY).toEqual(['﻿' + TAX_EXPORT_COLUMNS.join(',')]);
    // another user's filter cannot reach X's rows: Y asking for X's symbol gets nothing either
    expect((await y.b.taxWithholdings({ query: { symbol: 'BTCUSDT', limit: 10 } })).items).toEqual([]);
  });

  it('bad input and no session: year out of range -> 400, no session -> 401 on all three', async () => {
    const u = await h.user();
    for (const path of ['/api/v1/account/tax/summary?year=2019', '/api/v1/account/tax/summary?year=abc', '/api/v1/account/tax/withholdings?cursor=abc', '/api/v1/account/tax/withholdings?limit=0', '/api/v1/account/tax/export.csv?from=yesterday']) {
      const r = await rawGet(u.b, path);
      expect([r.status, r.code], path).toEqual([400, 'VALIDATION_ERROR']);
    }
    const anon = h.browser();
    await expectApiError(anon.taxSummary({ query: {} }), 'UNAUTHENTICATED', 401);
    await expectApiError(anon.taxWithholdings({ query: { limit: 5 } }), 'UNAUTHENTICATED', 401);
    await expectApiError(anon.taxExport({ query: {} }), 'UNAUTHENTICATED', 401);
  });
});

// ───────────────────────────── 4. list pagination and CSV

describe('taxWithholdings pagination and taxExport CSV', () => {
  it('3 records, limit 2: page 1 has 2 rows and a cursor, page 2 has 1 row and null; filters work; fields are the record itself', async () => {
    await setTax('WITHHOLD', '0.001', '26350');
    const p = await funded();
    await buy(p, 'BTCUSDT', '1');
    await sell(p, 'BTCUSDT', '0.1'); // gross 9.9, tax 0.0099
    await sell(p, 'BTCUSDT', '0.2'); // gross 19.8, tax 0.0198
    await sell(p, 'BTCUSDT', '0.3'); // gross 29.7, tax 0.0297
    await setTax('OFF');
    const page1 = await p.b.taxWithholdings({ query: { limit: 2 } });
    expect(page1.items.map((r) => r.taxAmount)).toEqual(['0.02970000', '0.01980000']); // newest first
    expect(page1.nextCursor).toBe(page1.items[1]!.id);
    const page2 = await p.b.taxWithholdings({ query: { limit: 2, cursor: page1.nextCursor! } });
    expect(page2.items.map((r) => r.taxAmount)).toEqual(['0.00990000']);
    expect(page2.nextCursor).toBeNull();
    const first = page2.items[0]!;
    expect(first).toMatchObject({
      symbol: 'BTCUSDT',
      asset: 'USDT',
      quantity: '0.10000000',
      price: '99.00000000',
      grossQuote: '9.90000000',
      taxRate: '0.001',
      category: 'INDIVIDUAL',
      vndRate: '26350',
      grossVnd: '260865', // 9.9 x 26350 = 260,865
      taxVnd: '261', // ceil(0.0099 x 26350 = 260.865)
    });
    expect(first.createdAt).toMatch(/Z$/);
    // filters
    expect((await p.b.taxWithholdings({ query: { symbol: 'ETHUSDT', limit: 10 } })).items).toEqual([]);
    expect((await p.b.taxWithholdings({ query: { from: '2999-01-01T00:00:00.000Z', limit: 10 } })).items).toEqual([]);
    expect((await p.b.taxWithholdings({ query: { to: '2000-01-01T00:00:00.000Z', limit: 10 } })).items).toEqual([]);
    expect((await p.b.taxWithholdings({ query: { from: '2000-01-01T00:00:00.000Z', to: '2999-01-01T00:00:00.000Z', limit: 10 } })).items).toHaveLength(3);

    // CSV of the same user: header, 3 lines newest first, GMT+7 = UTC + 7 h, ids match the list
    const text = await p.b.taxExport({ query: {} });
    const lines = text.split('\r\n');
    expect(lines.at(-1)).toBe('');
    expect(lines[0]).toBe('﻿' + TAX_EXPORT_COLUMNS.join(','));
    const rows = lines.slice(1, -1).map((l) => l.split(','));
    expect(rows).toHaveLength(3);
    const col = (r: string[], name: (typeof TAX_EXPORT_COLUMNS)[number]) => r[TAX_EXPORT_COLUMNS.indexOf(name)];
    expect(rows.map((r) => col(r, 'taxAmount'))).toEqual(['0.02970000', '0.01980000', '0.00990000']);
    expect(rows.map((r) => col(r, 'withholdingId'))).toEqual([...page1.items.map((r) => r.id), first.id]);
    const last = rows[2]!;
    const utc = col(last, 'time_utc')!;
    expect(col(last, 'time_gmt7')).toBe(new Date(Date.parse(utc) + 7 * 3_600_000).toISOString().replace('T', ' ').slice(0, 19));
    expect([col(last, 'symbol'), col(last, 'quantity'), col(last, 'price'), col(last, 'grossQuote'), col(last, 'asset'), col(last, 'taxRate'), col(last, 'category'), col(last, 'vndRate'), col(last, 'grossVnd'), col(last, 'taxVnd')]).toEqual(['BTCUSDT', '0.10000000', '99.00000000', '9.90000000', 'USDT', '0.001', 'INDIVIDUAL', '26350', '260865', '261']);
    // filter applies to the CSV too
    expect((await p.b.taxExport({ query: { symbol: 'ETHUSDT' } })).split('\r\n').filter((l) => l !== '')).toHaveLength(1);
  });

  it('a record without a VND rate leaves its three VND cells EMPTY in the CSV (null is not 0)', async () => {
    await setTax('WITHHOLD', '0.001', null);
    const q = await funded();
    await buy(q, 'BTCUSDT', '1');
    await sell(q, 'BTCUSDT', '0.1');
    await setTax('OFF');
    const [line] = (await q.b.taxExport({ query: {} })).split('\r\n').slice(1, 2);
    const cells = line!.split(',');
    expect(cells).toHaveLength(TAX_EXPORT_COLUMNS.length);
    expect(cells.slice(-3)).toEqual(['', '', '']); // vndRate, grossVnd, taxVnd
    expect(cells[TAX_EXPORT_COLUMNS.indexOf('taxAmount')]).toBe('0.00990000');
    const rec = (await q.b.taxWithholdings({ query: { limit: 5 } })).items[0]!;
    expect([rec.vndRate, rec.grossVnd, rec.taxVnd]).toEqual([null, null, null]);
  });
});

// ───────────────────────────── 5. the Vietnam-time boundaries with fixed created_at

describe('month and quarter boundaries (records inserted with a fixed created_at)', () => {
  it('16:59:59.999Z belongs to the month that ends there, 17:00:00.000Z to the next one - in the user summary and in the admin periods', async () => {
    const t = await funded();
    await buy(t, 'BTCUSDT', '1');
    await setTax('OFF');
    const orderIds: number[] = [];
    for (let i = 0; i < 6; i++) orderIds.push(Number((await sell(t, 'BTCUSDT', '0.1')).order.id));
    const tradeRows = await Promise.all(orderIds.map(async (o) => (await db().select().from(trades).where(eq(trades.orderId, o)))[0]!));
    const at = [
      '2025-10-31T16:59:59.999Z', // R1 -> October (last millisecond)
      '2025-10-31T17:00:00.000Z', // R2 -> November (first millisecond), no VND rate
      '2025-09-30T17:00:00.000Z', // R3 -> October (first millisecond)
      '2025-09-30T16:59:59.999Z', // R4 -> September (last millisecond)
      '2025-12-31T16:59:59.999Z', // R5 -> December 2025 (last millisecond of the year)
      '2025-12-31T17:00:00.000Z', // R6 -> January 2026
    ];
    // every record: 0.1 BTC @ 99 = 9.9, tax 0.0099 ; VND at 26350: gross 260,865 , tax 261 (R2 has none)
    await db().insert(taxWithholdings).values(
      tradeRows.map((tr, i) => ({
        tradeId: tr.id,
        orderId: tr.orderId,
        userId: t.id,
        symbol: 'BTCUSDT',
        asset: 'USDT',
        quantity: '0.1',
        price: '99',
        grossQuote: '9.9',
        taxRate: '0.001',
        taxAmount: '0.0099',
        category: 'INDIVIDUAL' as const,
        vndRate: i === 1 ? null : '26350',
        grossVnd: i === 1 ? null : '260865',
        taxVnd: i === 1 ? null : '261',
        createdAt: new Date(at[i]!),
      })),
    );
    const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
    const s25 = await t.b.taxSummary({ query: { year: 2025 } });
    const count = (m: number) => s25.months.find((x) => x.month === ym(2025, m))!;
    expect([9, 10, 11, 12].map((m) => count(m).withholdingCount)).toEqual([1, 2, 1, 1]); // Sept R4 ; Oct R1+R3 ; Nov R2 ; Dec R5
    expect([1, 2, 3, 4, 5, 6, 7, 8].every((m) => count(m).withholdingCount === 0)).toBe(true);
    expect(count(10)).toMatchObject({ withheldGrossQuote: '19.80000000', taxAmount: '0.01980000', withheldGrossVnd: '521730', taxVnd: '522', vndMissingCount: 0 });
    expect(count(11)).toMatchObject({ withheldGrossVnd: null, taxVnd: null, vndMissingCount: 1 }); // the month without a rate
    expect(count(9)).toMatchObject({ withheldGrossVnd: '260865', taxVnd: '261' }); // a clean month next to it keeps its VND
    // the total of 2025: 5 records (R1..R5), one without VND -> VND null, not a partial sum
    expect(s25.totals).toMatchObject({ withholdingCount: 5, withheldGrossQuote: '49.50000000', taxAmount: '0.04950000', withheldGrossVnd: null, taxVnd: null, vndMissingCount: 1 });
    // R6 is January 2026 of the next year
    const s26 = await t.b.taxSummary({ query: { year: 2026 } });
    expect(s26.months[0]).toMatchObject({ month: '2026-01', withholdingCount: 1, withheldGrossVnd: '260865', taxVnd: '261' });

    const admin = await h.staff('admin');
    const sum = (period: string) => admin.b.adminTaxSummary({ query: { period } });
    expect((await sum('2025-10')).totals).toMatchObject({ withholdingCount: 2, userCount: 1, withheldGrossQuote: '19.80000000', withheldGrossVnd: '521730' });
    expect((await sum('2025-09')).totals.withholdingCount).toBe(1); // R4 only
    expect((await sum('2025-11')).totals).toMatchObject({ withholdingCount: 1, withheldGrossVnd: null, vndMissingCount: 1 });
    expect((await sum('2025-12')).totals.withholdingCount).toBe(1); // R5, not R6
    expect((await sum('2026-01')).totals.withholdingCount).toBe(1); // R6 only
    // Q4 2025 = 2025-09-30T17:00:00.000Z .. 2025-12-31T16:59:59.999Z : R3, R1, R2, R5 - not R4 (1 ms before) and not R6 (1 ms after)
    const q4 = await sum('2025-Q4');
    expect([q4.from, q4.to]).toEqual(['2025-09-30T17:00:00.000Z', '2025-12-31T16:59:59.999Z']);
    expect(q4.totals).toMatchObject({ withholdingCount: 4, userCount: 1, withheldGrossQuote: '39.60000000', withheldGrossVnd: null, vndMissingCount: 1 });
    expect((await sum('2025-Q3')).totals.withholdingCount).toBe(1); // R4
    // the list/CSV filters use the same inclusive bounds
    const oct = await admin.b.adminTaxWithholdings({ query: { from: '2025-09-30T17:00:00.000Z', to: '2025-10-31T16:59:59.999Z', limit: 50 } });
    expect(oct.items.map((r) => r.createdAt).sort()).toEqual(['2025-09-30T17:00:00.000Z', '2025-10-31T16:59:59.999Z']);
  });
});

// ───────────────────────────── 6. append-only guard stays

describe('reports do not write', () => {
  it('reading every report leaves the withholding records untouched', async () => {
    const before = await db().select().from(taxWithholdings);
    const u = await h.user();
    await u.b.taxSummary({ query: {} });
    await u.b.taxWithholdings({ query: { limit: 5 } });
    await u.b.taxExport({ query: {} });
    expect(await db().select().from(taxWithholdings)).toEqual(before);
  });
});
