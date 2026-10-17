import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { asc, eq, sql } from 'drizzle-orm';
import { ApiError, type AccountTradingStats, type VolumeBucket } from '@cex/contracts';
import { dec } from '@cex/core';
import { futuresTrades, symbols, trades } from '../../db/schema.ts';
import { ApiHarness } from '../../../test/apiHarness.ts';
import { marketTrade, setBook, setFuturesBook, setMark } from '../../../test/helpers.ts';
import { vnDayStart } from '../tax/period.ts';
import { gmt7Day } from './pnlService.ts';
import { statsWindows } from './statsService.ts';

/**
 * Profile numbers (0.19.0): `accountTradingStats` and `adminGetUser(...).trading`. Real PostgreSQL, real fills through the
 * HTTP API; the fill times are then rewritten (trades / futures_trades are not append-only) so every boundary is exact to the
 * millisecond relative to a fixed test clock. Responses are validated against the contract by the harness.
 */
const h = new ApiHarness();
const db = () => h.env.database.db;

/** 2026-10-17T05:00:00Z = 12:00 on 17 Oct in GMT+7. Today (GMT+7) started at 2026-10-16T17:00:00Z. */
const NOW = Date.UTC(2026, 9, 17, 5, 0, 0);

beforeAll(async () => {
  await h.start();
});
afterAll(async () => {
  await h.stop();
});
beforeEach(async () => {
  h.env.clock.ms = NOW;
  setBook(h.env, 'BTCUSDT', [['99.00', '10.00000']], [['100.00', '10.00000']]);
  marketTrade(h.env, 'BTCUSDT', '99.50');
  setFuturesBook(h.env, 'BTCUSDT', [['80000.0', '1.000']], [['80010.0', '1.000']]);
  setMark(h.env, 'BTCUSDT', '80000');
});

type User = Awaited<ReturnType<ApiHarness['user']>>;

async function expectApiError(p: Promise<unknown>, code: string, status: number) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof ApiError && e.code === code && e.status === status);
}

/** Market order on BTCUSDT (one fill against the one-level book); returns the trade id and checks the hand-computed quoteQty. */
async function spot(u: User, side: 'BUY' | 'SELL', quantity: string, expectedQuote: string): Promise<number> {
  const r = await u.b.placeOrder({ body: { symbol: 'BTCUSDT', side, type: 'MARKET', quantity } });
  expect(r.fills, `${side} ${quantity}`).toHaveLength(1);
  expect(r.fills[0]!.quoteQty).toBe(expectedQuote);
  return Number(r.fills[0]!.id);
}
const stampSpot = (id: number, iso: string) => db().update(trades).set({ createdAt: new Date(iso) }).where(eq(trades.id, id));

const bucket = (spotSum: string, futures: string, total: string, fills: number): VolumeBucket => ({ spot: spotSum, futures, total, fills });
const stripAsOf = ({ asOf: _asOf, ...rest }: AccountTradingStats) => rest;

describe('volume: hand-computed windows', () => {
  /**
   * Spot fills of user A (BUY at the ask 100, SELL at the bid 99), stamped relative to NOW = 2026-10-17T05:00Z:
   *   f1 BUY  1    quote 100   2026-10-17T04:00:00.000Z   today
   *   f2 BUY  2    quote 200   2026-10-16T16:59:59.999Z   1 ms before today starts (23:59:59.999 GMT+7 yesterday)
   *   f3 SELL 0.5  quote 49.5  2026-10-11T00:00:00.000Z   inside the 7 days
   *   f4 BUY  0.3  quote 30    2026-10-10T16:59:59.999Z   1 ms before the 7-day window starts (2026-10-10T17:00Z)
   *   f8 BUY  0.05 quote 5     2026-09-30T17:00:00.000Z   00:00:00.000 on 1 Oct GMT+7: first instant of this month
   *   f5 BUY  0.25 quote 25    2026-09-30T16:59:59.999Z   last instant of September GMT+7
   *   f6 BUY  0.1  quote 10    2026-09-17T16:59:59.999Z   1 ms before the 30-day window starts (2026-09-17T17:00Z); still September
   *   f7 BUY  0.07 quote 7     2026-08-31T16:59:59.999Z   last instant of August GMT+7: in no window
   * Futures fills of user A: open BUY 0.002 @80010 = 160.02 (2026-10-16T16:00Z, yesterday), close SELL 0.002 @80000 = 160.00 (2026-10-17T03:00Z, today).
   */
  async function setUpA(): Promise<User> {
    const a = await h.user();
    await a.b.faucetClaim();
    const f1 = await spot(a, 'BUY', '1', '100.00000000');
    const f2 = await spot(a, 'BUY', '2', '200.00000000');
    const f4 = await spot(a, 'BUY', '0.3', '30.00000000');
    const f8 = await spot(a, 'BUY', '0.05', '5.00000000');
    const f5 = await spot(a, 'BUY', '0.25', '25.00000000');
    const f6 = await spot(a, 'BUY', '0.1', '10.00000000');
    const f7 = await spot(a, 'BUY', '0.07', '7.00000000');
    const f3 = await spot(a, 'SELL', '0.5', '49.50000000');
    await stampSpot(f1, '2026-10-17T04:00:00.000Z');
    await stampSpot(f2, '2026-10-16T16:59:59.999Z');
    await stampSpot(f3, '2026-10-11T00:00:00.000Z');
    await stampSpot(f4, '2026-10-10T16:59:59.999Z');
    await stampSpot(f8, '2026-09-30T17:00:00.000Z');
    await stampSpot(f5, '2026-09-30T16:59:59.999Z');
    await stampSpot(f6, '2026-09-17T16:59:59.999Z');
    await stampSpot(f7, '2026-08-31T16:59:59.999Z');

    await a.b.futuresTransfer({ body: { direction: 'SPOT_TO_FUTURES', amount: '500' } });
    await a.b.futuresPlaceOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.002' } });
    await a.b.futuresClosePosition({ params: { symbol: 'BTCUSDT' }, body: {} });
    const ft = await db().select().from(futuresTrades).where(eq(futuresTrades.userId, a.id)).orderBy(asc(futuresTrades.id));
    expect(ft.map((t) => [t.side, dec(t.quoteQty).toFixed(8)])).toEqual([
      ['BUY', '160.02000000'],
      ['SELL', '160.00000000'],
    ]);
    await db().update(futuresTrades).set({ createdAt: new Date('2026-10-16T16:00:00.000Z') }).where(eq(futuresTrades.id, ft[0]!.id));
    await db().update(futuresTrades).set({ createdAt: new Date('2026-10-17T03:00:00.000Z') }).where(eq(futuresTrades.id, ft[1]!.id));
    return a;
  }

  it('today / 7d / 30d / this month / previous month equal the hand-computed sums; spot and futures are split', async () => {
    const a = await setUpA();
    const s = await a.b.accountTradingStats();
    expect(s.asOf).toBe('2026-10-17T05:00:00.000Z');
    // today (>= 2026-10-16T17:00Z): f1 100 + futures close 160.00
    expect(s.volume.today).toEqual(bucket('100.00000000', '160.00000000', '260.00000000', 2));
    // 7 days (>= 2026-10-10T17:00Z): f1 100 + f2 200 + f3 49.5 = 349.5 ; futures 160.02 + 160.00 = 320.02
    expect(s.volume.last7d).toEqual(bucket('349.50000000', '320.02000000', '669.52000000', 5));
    // 30 days (>= 2026-09-17T17:00Z): 349.5 + f4 30 + f8 5 + f5 25 = 409.5 ; futures 320.02 (f6 and f7 are older)
    expect(s.volume.last30d).toEqual(bucket('409.50000000', '320.02000000', '729.52000000', 8));
    // this month (>= 2026-09-30T17:00Z): 349.5 + f4 30 + f8 5 = 384.5 ; futures 320.02
    expect(s.volume.thisMonth).toEqual(bucket('384.50000000', '320.02000000', '704.52000000', 7));
    // previous month [2026-08-31T17:00Z, 2026-09-30T17:00Z): f5 25 + f6 10 = 35 (f7 is 1 ms before it starts, f8 is exactly at its end)
    expect(s.volume.previousMonth).toEqual(bucket('35.00000000', '0.00000000', '35.00000000', 2));
    expect(s.volume.excludedNonUsdtFills).toBe(0);
    // no tax was ever on for this user
    expect(s.tax).toEqual({
      taxMode: 'OFF',
      category: 'INDIVIDUAL',
      thisMonth: { month: '2026-10', withheldCount: 0, withheldAmount: '0.00000000' },
      previousMonth: { month: '2026-09', withheldCount: 0, withheldAmount: '0.00000000' },
    });
  });

  it('a fill at 23:59:59.999 GMT+7 yesterday is not in today but is in the 7 days; 00:00:00.000 today is in today', async () => {
    const u = await h.user();
    await u.b.faucetClaim();
    const yesterdayLast = await spot(u, 'BUY', '1', '100.00000000');
    const todayFirst = await spot(u, 'BUY', '2', '200.00000000');
    await stampSpot(yesterdayLast, '2026-10-16T16:59:59.999Z'); // 23:59:59.999 GMT+7 on 16 Oct
    await stampSpot(todayFirst, '2026-10-16T17:00:00.000Z'); // 00:00:00.000 GMT+7 on 17 Oct
    const s = await u.b.accountTradingStats();
    expect(s.volume.today).toEqual(bucket('200.00000000', '0.00000000', '200.00000000', 1));
    expect(s.volume.last7d).toEqual(bucket('300.00000000', '0.00000000', '300.00000000', 2));
    expect(s.volume.thisMonth.total).toBe('300.00000000');
  });

  it("another user's fills are never counted, in either direction", async () => {
    const a = await setUpA();
    const before = stripAsOf(await a.b.accountTradingStats());

    // B trades today (real fills at the DB time; the clock decides the window) and has a futures fill
    const b = await h.user();
    await b.b.faucetClaim();
    const id = await spot(b, 'BUY', '4', '400.00000000');
    await stampSpot(id, '2026-10-17T01:00:00.000Z');
    await b.b.futuresTransfer({ body: { direction: 'SPOT_TO_FUTURES', amount: '300' } });
    await b.b.futuresPlaceOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.001' } });
    const [bf] = await db().select().from(futuresTrades).where(eq(futuresTrades.userId, b.id));
    await db().update(futuresTrades).set({ createdAt: new Date('2026-10-17T02:00:00.000Z') }).where(eq(futuresTrades.id, bf!.id));

    const sb = await b.b.accountTradingStats();
    expect(sb.volume.today).toEqual(bucket('400.00000000', '80.01000000', '480.01000000', 2)); // 0.001 × 80010 = 80.01
    expect(sb.volume.previousMonth.fills).toBe(0);
    expect(stripAsOf(await a.b.accountTradingStats()), "A's numbers did not move when B traded").toEqual(before);
  });

  it('a user without a single fill gets real zeros (not null, not missing)', async () => {
    const u = await h.user();
    const s = await u.b.accountTradingStats();
    const zero = bucket('0.00000000', '0.00000000', '0.00000000', 0);
    expect(s.volume).toEqual({ today: zero, last7d: zero, last30d: zero, thisMonth: zero, previousMonth: zero, excludedNonUsdtFills: 0 });
    expect(s.tax.thisMonth).toEqual({ month: '2026-10', withheldCount: 0, withheldAmount: '0.00000000' });
  });

  it('pairs not quoted in USDT (or no longer listed) are never summed and are counted as excluded', async () => {
    const u = await h.user();
    await u.b.faucetClaim();
    const usdt = await spot(u, 'BUY', '1', '100.00000000');
    const other = await spot(u, 'BUY', '2', '200.00000000');
    const gone = await spot(u, 'BUY', '3', '300.00000000');
    const old = await spot(u, 'BUY', '0.4', '40.00000000');
    await stampSpot(usdt, '2026-10-17T01:00:00.000Z');
    await stampSpot(other, '2026-10-17T02:00:00.000Z');
    await stampSpot(gone, '2026-10-17T03:00:00.000Z');
    await stampSpot(old, '2026-08-01T00:00:00.000Z'); // older than 30 days: neither summed nor counted
    // relabel two of the fills: one to a BTC-quoted pair that is listed, one to a pair that is not in `symbols` at all
    await db().insert(symbols).values({ symbol: 'ETHBTC', baseAsset: 'ETH', quoteAsset: 'BTC', tickSize: '0.00001', stepSize: '0.0001', minQty: '0.0001', maxQty: '9000', minNotional: '0.0001', sourceStatus: 'TRADING', sortOrder: 99 });
    try {
      await db().update(trades).set({ symbol: 'ETHBTC' }).where(eq(trades.id, other));
      await db().update(trades).set({ symbol: 'GHOSTUSDT' }).where(eq(trades.id, gone));
      await db().update(trades).set({ symbol: 'ETHBTC' }).where(eq(trades.id, old));
      const s = await u.b.accountTradingStats();
      expect(s.volume.today).toEqual(bucket('100.00000000', '0.00000000', '100.00000000', 1));
      expect(s.volume.last30d).toEqual(bucket('100.00000000', '0.00000000', '100.00000000', 1));
      expect(s.volume.excludedNonUsdtFills).toBe(2); // the BTC-quoted fill and the unlisted pair; the August one is outside 30 days
    } finally {
      await db().update(trades).set({ symbol: 'BTCUSDT' }).where(sql`${trades.userId} = ${u.id}`);
      await db().delete(symbols).where(eq(symbols.symbol, 'ETHBTC'));
    }
  });
});

describe('tax already withheld, this and last month (GMT+7)', () => {
  const setTax = async (mode: 'OFF' | 'WITHHOLD') => {
    const admin = await h.staff('admin');
    await admin.b.adminUpdateTaxSettings({ body: { taxMode: mode, taxRate: '0.001', reason: `account stats test: tax ${mode}` } });
    return admin;
  };
  const vnMonthOfNow = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 7);

  it('tax on, a SELL: this month = the fill tax with count 1; previous month 0; DOMESTIC_ORG declares itself so nothing is withheld', async () => {
    h.env.clock.ms = Date.now(); // the fill is stamped by the database clock (real time): query in the same instant
    setBook(h.env, 'BTCUSDT', [['99.00', '10.00000']], [['100.00', '10.00000']]);
    marketTrade(h.env, 'BTCUSDT', '99.50');
    await setTax('WITHHOLD');
    try {
      const u = await h.user();
      await u.b.faucetClaim();
      await spot(u, 'BUY', '1', '100.00000000');
      const sell = await u.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.5' } });
      expect(sell.fills[0]!.tax).toBe('0.04950000'); // 49.5 × 0.001
      const s = await u.b.accountTradingStats();
      const month = vnMonthOfNow(new Date(h.env.clock.ms));
      expect(s.tax.taxMode).toBe('WITHHOLD');
      expect(s.tax.category).toBe('INDIVIDUAL');
      expect(s.tax.thisMonth).toEqual({ month, withheldCount: 1, withheldAmount: sell.fills[0]!.tax });
      expect(s.tax.previousMonth).toMatchObject({ withheldCount: 0, withheldAmount: '0.00000000' });
      // the volume counts the BUY and the SELL both (100 + 49.5)
      expect(s.volume.today.spot).toBe('149.50000000');

      // a self-declared domestic organization is never withheld: tax stays 0 for its own SELL, volume still counts
      const org = await h.user();
      await org.b.taxUpdateProfile({ body: { category: 'DOMESTIC_ORG' } });
      await org.b.faucetClaim();
      await spot(org, 'BUY', '1', '100.00000000');
      const orgSell = await org.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.5' } });
      expect(orgSell.fills[0]!.tax).toBe('0.00000000');
      const so = await org.b.accountTradingStats();
      expect(so.tax.category).toBe('DOMESTIC_ORG');
      expect(so.tax.thisMonth).toMatchObject({ withheldCount: 0, withheldAmount: '0.00000000' });
      expect(so.volume.today.spot).toBe('149.50000000');
    } finally {
      await setTax('OFF');
    }
  });

  it('the tax of a fill moves to the previous month when the month turns; month labels follow GMT+7', async () => {
    h.env.clock.ms = Date.now();
    setBook(h.env, 'BTCUSDT', [['99.00', '10.00000']], [['100.00', '10.00000']]);
    marketTrade(h.env, 'BTCUSDT', '99.50');
    await setTax('WITHHOLD');
    try {
      const u = await h.user();
      await u.b.faucetClaim();
      await spot(u, 'BUY', '2', '200.00000000'); // the BUY fee is taken in BTC, so 2 are bought to be able to sell 1
      const sell = await u.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '1' } });
      expect(sell.fills[0]!.tax).toBe('0.09900000'); // 99 × 0.001
      // the clock moves to 10 days into the next GMT+7 month; the fill (stamped at the real time) is now "last month"
      const d = new Date(h.env.clock.ms + 7 * 3_600_000);
      const nextMonthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 7 * 3_600_000;
      h.env.clock.ms = nextMonthStart + 10 * 86_400_000;
      const s = await u.b.accountTradingStats();
      expect(s.tax.thisMonth).toEqual({ month: vnMonthOfNow(new Date(h.env.clock.ms)), withheldCount: 0, withheldAmount: '0.00000000' });
      expect(s.tax.previousMonth).toEqual({ month: vnMonthOfNow(new Date(h.env.clock.ms - 15 * 86_400_000)), withheldCount: 1, withheldAmount: '0.09900000' });
      // the volume of that fill is previous-month volume too (and not in 7 days any more)
      expect(s.volume.previousMonth.spot).toBe('299.00000000'); // 200 + 99
      expect(s.volume.last7d.fills).toBe(0);
    } finally {
      h.env.clock.ms = Date.now();
      await setTax('OFF');
    }
  });

  it('month edges to the millisecond: 00:00:00.000 on the 1st GMT+7 is this month, 23:59:59.999 before it is last month, older is nothing', async () => {
    h.env.clock.ms = Date.now();
    setBook(h.env, 'BTCUSDT', [['99.00', '10.00000']], [['100.00', '10.00000']]);
    marketTrade(h.env, 'BTCUSDT', '99.50');
    await setTax('WITHHOLD');
    // tax_withholdings is append-only (trigger): the test DB lets this test move created_at, then puts the guard back
    try {
      const u = await h.user();
      await u.b.faucetClaim();
      await spot(u, 'BUY', '4', '400.00000000');
      const sells: { id: number; tax: string }[] = [];
      for (const [qty, quote, tax] of [
        ['0.5', '49.50000000', '0.04950000'],
        ['1', '99.00000000', '0.09900000'],
        ['2', '198.00000000', '0.19800000'],
        ['0.1', '9.90000000', '0.00990000'],
      ] as const) {
        const r = await u.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: qty } });
        expect(r.fills[0]!.quoteQty).toBe(quote);
        expect(r.fills[0]!.tax).toBe(tax);
        sells.push({ id: Number(r.fills[0]!.id), tax });
      }
      const at = ['2026-09-30T17:00:00.000Z', '2026-09-30T16:59:59.999Z', '2026-08-31T17:00:00.000Z', '2026-08-31T16:59:59.999Z'];
      await db().execute(sql`alter table tax_withholdings disable trigger tax_withholdings_append_only`);
      try {
        for (const [i, s] of sells.entries()) {
          await db().execute(sql`update tax_withholdings set created_at = ${at[i]!}::timestamptz where trade_id = ${s.id}`);
          await db().execute(sql`update trades set created_at = ${at[i]!}::timestamptz where id = ${s.id}`);
        }
      } finally {
        await db().execute(sql`alter table tax_withholdings enable trigger tax_withholdings_append_only`);
      }
      h.env.clock.ms = NOW;
      const s = await u.b.accountTradingStats();
      // this month: only the fill at 2026-09-30T17:00:00.000Z
      expect(s.tax.thisMonth).toEqual({ month: '2026-10', withheldCount: 1, withheldAmount: '0.04950000' });
      // previous month [2026-08-31T17:00Z, 2026-09-30T17:00Z): 0.099 + 0.198 ; the fill 1 ms before it starts is nothing
      expect(s.tax.previousMonth).toEqual({ month: '2026-09', withheldCount: 2, withheldAmount: '0.29700000' });
    } finally {
      h.env.clock.ms = Date.now();
      await setTax('OFF');
    }
  });
});

describe('admin user detail', () => {
  it("adminGetUser(...).trading is the user's own accountTradingStats (same service, same numbers)", async () => {
    const admin = await h.staff('admin');
    const u = await h.user();
    await u.b.faucetClaim();
    const id = await spot(u, 'BUY', '1', '100.00000000');
    await stampSpot(id, '2026-10-17T01:00:00.000Z');
    await u.b.futuresTransfer({ body: { direction: 'SPOT_TO_FUTURES', amount: '300' } });
    await u.b.futuresPlaceOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.001' } });

    const own = await u.b.accountTradingStats();
    const detail = await admin.b.adminGetUser({ params: { userId: u.id } });
    expect(stripAsOf(detail.trading)).toEqual(stripAsOf(own));
    expect(detail.trading.volume.thisMonth.spot).toBe('100.00000000');
    // the 0.18.0 field is untouched
    expect(detail.tax).toEqual({ category: 'INDIVIDUAL', categoryUpdatedAt: null, withheldCount: 0, withheldTotal: '0.00000000' });

    // a quiet user: honest zeros; and the detail of one user never carries the numbers of the other
    const quiet = await h.user();
    const dq = await admin.b.adminGetUser({ params: { userId: quiet.id } });
    expect(dq.trading.volume.last30d).toEqual(bucket('0.00000000', '0.00000000', '0.00000000', 0));
  });

  it('refusals: anonymous 401; a normal user cannot read the admin detail (403); an unknown user is 404', async () => {
    const admin = await h.staff('admin');
    const u = await h.user();
    await expectApiError(h.browser().accountTradingStats(), 'UNAUTHENTICATED', 401);
    await expectApiError(u.b.adminGetUser({ params: { userId: admin.id } }), 'FORBIDDEN', 403);
    await expectApiError(admin.b.adminGetUser({ params: { userId: '00000000-0000-4000-8000-00000000dead' } }), 'NOT_FOUND', 404);
  });

  it('the user endpoint has no id: it always answers for the session user (a query parameter cannot redirect it)', async () => {
    const a = await h.user();
    const b = await h.user();
    await a.b.faucetClaim();
    const id = await spot(a, 'BUY', '1', '100.00000000');
    await stampSpot(id, '2026-10-17T01:00:00.000Z');
    const res = await fetch(`${h.base}/api/v1/account/stats?userId=${a.id}`, { headers: { cookie: b.b.cookie() } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AccountTradingStats;
    expect(body.volume.today.fills).toBe(0); // B's own (empty) numbers, not A's
  });

  it('the endpoint is rate limited per user (30 a minute at scale 1): the 31st call is 429', async () => {
    const h2 = new ApiHarness();
    await h2.start({ env: { RATE_LIMIT_SCALE: '1' } });
    try {
      const u = await h2.user();
      for (let i = 0; i < 30; i++) await u.b.accountTradingStats();
      await expectApiError(u.b.accountTradingStats(), 'RATE_LIMITED', 429);
    } finally {
      await h2.stop();
    }
  });
});

describe('windows (pure)', () => {
  it('days follow the PnL analysis rule (gmt7Day), including the 1 ms edges', () => {
    for (const iso of ['2026-10-16T16:59:59.999Z', '2026-10-16T17:00:00.000Z', '2026-10-17T05:00:00.000Z', '2026-12-31T16:59:59.999Z', '2027-01-01T00:00:00.000Z']) {
      const at = new Date(iso);
      expect(vnDayStart(at).toISOString(), iso).toBe(new Date(Date.parse(`${gmt7Day(at)}T00:00:00.000Z`) - 7 * 3_600_000).toISOString());
    }
  });

  it('statsWindows: mid month, January (previous month = December of the year before), and the first millisecond of a month', () => {
    const mid = statsWindows(new Date('2026-10-17T05:00:00.000Z'));
    expect([mid.today, mid.last7d, mid.last30d, mid.thisMonth, mid.previousMonth].map((d) => d.toISOString())).toEqual([
      '2026-10-16T17:00:00.000Z',
      '2026-10-10T17:00:00.000Z',
      '2026-09-17T17:00:00.000Z',
      '2026-09-30T17:00:00.000Z',
      '2026-08-31T17:00:00.000Z',
    ]);
    expect([mid.thisMonthLabel, mid.previousMonthLabel]).toEqual(['2026-10', '2026-09']);

    const jan = statsWindows(new Date('2026-01-15T00:00:00.000Z'));
    expect([jan.thisMonth.toISOString(), jan.previousMonth.toISOString(), jan.thisMonthLabel, jan.previousMonthLabel]).toEqual(['2025-12-31T17:00:00.000Z', '2025-11-30T17:00:00.000Z', '2026-01', '2025-12']);

    // 2026-09-30T17:00:00.000Z is already 1 October in GMT+7
    const edge = statsWindows(new Date('2026-09-30T17:00:00.000Z'));
    expect([edge.thisMonthLabel, edge.today.toISOString()]).toEqual(['2026-10', '2026-09-30T17:00:00.000Z']);
    const before = statsWindows(new Date('2026-09-30T16:59:59.999Z'));
    expect(before.thisMonthLabel).toBe('2026-09');
  });
});
