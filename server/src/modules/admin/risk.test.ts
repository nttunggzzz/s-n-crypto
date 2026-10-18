import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { ApiError } from '@cex/contracts';
import { dec } from '@cex/core';
import { futuresFundingPayments, futuresPositions, users } from '../../db/schema.ts';
import { applyBalanceChanges } from '../exchange/ledger.ts';
import { reconcile } from '../exchange/reconciliation.ts';
import { createUser, setBook, setFuturesBook, setMark } from '../../../test/helpers.ts';
import { ApiHarness } from '../../../test/apiHarness.ts';

let adminNow = new Date();
const h = new ApiHarness();
const db = () => h.env.database.db;

async function expectApiError(p: Promise<unknown>, code: string, status?: number) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof ApiError && e.code === code && (status === undefined || e.status === status));
}

beforeAll(async () => {
  await h.start({ adminClock: () => adminNow });
});
afterAll(async () => {
  await h.stop();
});
beforeEach(() => {
  h.env.clock.ms = Date.now();
  adminNow = new Date();
  setBook(h.env, 'BTCUSDT', [['99.00', '1.00000']], [['100.00', '0.50000'], ['101.00', '1.00000']]);
  setFuturesBook(h.env, 'BTCUSDT', [['80000.0', '1.000']], [['80010.0', '1.000']]);
  setMark(h.env, 'BTCUSDT', '80000');
  setMark(h.env, 'ETHUSDT', '2500');
});

const uidOf = async (id: string) => String((await db().select({ uid: users.uid }).from(users).where(eq(users.id, id)))[0]!.uid);

async function addPosition(userId: string, o: { symbol: string; side: 'LONG' | 'SHORT'; quantity: string; entryPrice: string; margin: string; leverage: number }) {
  const [p] = await db().insert(futuresPositions).values({ userId, ...o, maxQuantity: o.quantity }).returning();
  return p!;
}

describe('permissions', () => {
  it('a plain user gets 403 and an anonymous caller 401 on every risk endpoint; support (users.read + exchange.read) is allowed', async () => {
    const plain = await h.user();
    const anon = h.browser();
    const support = await h.staff('support');
    for (const call of [(b: typeof plain.b) => b.adminRiskPositions(), (b: typeof plain.b) => b.adminLiquidations(), (b: typeof plain.b) => b.adminFundingSummary(), (b: typeof plain.b) => b.adminMetrics()]) {
      await expectApiError(call(plain.b), 'FORBIDDEN', 403);
      await expectApiError(call(anon), 'UNAUTHENTICATED', 401);
      await call(support.b);
    }
  });
});

describe('liquidations and today metrics from real trades', () => {
  it('a liquidated LONG shows with its lost margin; the day bucket sums the real fills; books stay balanced', async () => {
    const admin = await h.staff('admin');
    // spot: BUY 0.1 @ 100 (fee 0.0001 BTC = 0.01 USDT), then SELL the 0.0999 BTC received @ 99 (fee 0.001 x 9.8901)
    const s = await h.user();
    await s.b.faucetClaim();
    await s.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.1' } });
    await s.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.0999' } });

    // futures: 20x LONG 0.01 @ 80010 (margin 40.005, fee 0.40005), liquidated at mark 76300 (fee 2.905 = all that is left)
    const f = await createUser(h.env);
    await db().transaction((tx) => applyBalanceChanges(tx, [{ userId: f, asset: 'USDT', type: 'FAUCET', deltaAvailable: dec('10000'), refType: 'FAUCET', refId: 't' }]));
    const svc = h.env.futures.service;
    await svc.transfer(f, 'SPOT_TO_FUTURES', '1000');
    await svc.setLeverage(f, 'BTCUSDT', 20);
    await svc.placeOrder(f, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01' });
    setMark(h.env, 'BTCUSDT', '76300');
    await h.env.futures.engine.drain();

    adminNow = new Date();
    const liq = await admin.b.adminLiquidations();
    expect(liq.nextCursor).toBeNull();
    expect(liq.items).toHaveLength(1);
    expect(liq.items[0]).toMatchObject({
      userId: f,
      uid: await uidOf(f),
      symbol: 'BTCUSDT',
      side: 'LONG',
      leverage: 20,
      quantity: '0.01',
      entryPrice: '80010',
      liquidationPrice: '76300',
      margin: '40.00500000',
      lostMargin: '40.00500000',
      fee: '2.90500000',
      isBot: false,
    });
    expect((await admin.b.adminLiquidations({ query: { symbol: 'ETHUSDT' } })).items).toEqual([]);
    expect((await admin.b.adminLiquidations({ query: { symbol: 'BTCUSDT' } })).items).toHaveLength(1);

    const m = await admin.b.adminMetrics({ query: { range: '7d' } });
    expect(m.days).toHaveLength(7);
    const today = m.days[6]!;
    expect(today).toMatchObject({
      spotVolume: '19.89010000',
      spotFees: '0.01989010',
      futuresVolume: '1563.10000000', // 800.1 open + 763 liquidation
      futuresFees: '3.30505000', // 0.40005 + 2.905
      taxWithheld: '0.00000000',
      activeTraders: 2,
      liquidations: 1,
    });
    expect(m.totals).toMatchObject({ spotVolume: '19.89010000', futuresVolume: '1563.10000000', activeTraders: 2, liquidations: 1 });
    expect(m.days.slice(0, 6).every((d) => d.spotVolume === '0.00000000' && d.futuresVolume === '0.00000000' && d.activeTraders === 0)).toBe(true);
    expect(m.excludedNonUsdtFills).toBe(0);
    expect((await reconcile(db(), false)).mismatches).toEqual([]);
  });
});

describe('metrics day buckets (GMT+7)', () => {
  it('splits at 00:00 GMT+7 to the millisecond, keeps zero days, and 30d / 90d return every day', async () => {
    const admin = await h.staff('admin');
    adminNow = new Date('2026-10-12T03:00:00.000Z'); // 10:00 on 12 Oct in Vietnam
    const at = async (iso: string) => {
      const id = await createUser(h.env);
      await db().update(users).set({ createdAt: new Date(iso) }).where(eq(users.id, id));
      return id;
    };
    await at('2026-10-05T16:59:59.999Z'); // 05 Oct 23:59:59.999 GMT+7: the day before the range
    await at('2026-10-05T17:00:00.000Z'); // 06 Oct 00:00 GMT+7: first day of the range
    await at('2026-10-09T16:59:59.999Z'); // 09 Oct 23:59:59.999
    await at('2026-10-09T17:00:00.000Z'); // 10 Oct 00:00
    await at('2026-10-12T02:59:00.000Z'); // today
    // two liquidated positions either side of midnight (10 / 11 Oct) with no order / ledger rows
    for (const [iso, symbol] of [['2026-10-10T16:59:59.999Z', 'BTCUSDT'], ['2026-10-10T17:00:00.000Z', 'ETHUSDT']] as const) {
      const id = await createUser(h.env);
      const p = await addPosition(id, { symbol, side: 'LONG', quantity: '1', entryPrice: '100', margin: '10', leverage: 10 });
      await db().update(futuresPositions).set({ status: 'CLOSED', quantity: '0', margin: '0', closeReason: 'LIQUIDATION', closedAt: new Date(iso) }).where(eq(futuresPositions.id, p.id));
    }

    const m = await admin.b.adminMetrics({ query: { range: '7d' } });
    expect(m.from).toBe('2026-10-05T17:00:00.000Z');
    expect(m.to).toBe('2026-10-12T03:00:00.000Z');
    expect(m.days.map((d) => d.date)).toEqual(['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12']);
    expect(m.days.map((d) => d.newUsers)).toEqual([1, 0, 0, 1, 1, 0, 1]);
    expect(m.days.map((d) => d.liquidations)).toEqual([0, 0, 0, 0, 1, 1, 0]);
    expect(m.days[1]).toEqual({ date: '2026-10-07', spotVolume: '0.00000000', futuresVolume: '0.00000000', spotFees: '0.00000000', futuresFees: '0.00000000', taxWithheld: '0.00000000', newUsers: 0, activeTraders: 0, liquidations: 0 });
    expect(m.totals).toMatchObject({ newUsers: 4, liquidations: 2 });
    expect((await admin.b.adminMetrics({ query: { range: '30d' } })).days).toHaveLength(30);
    const d90 = await admin.b.adminMetrics({ query: { range: '90d' } });
    expect(d90.days).toHaveLength(90);
    expect(d90.days[89]!.date).toBe('2026-10-12');
    expect((await admin.b.adminMetrics()).range).toBe('7d');
    await expectApiError(admin.b.adminMetrics({ query: { range: '1y' as never } }), 'VALIDATION_ERROR', 400);

    // liquidation list: newest first, cursor never repeats or skips; rows without order / ledger records show null, not 0
    adminNow = new Date();
    const p1 = await admin.b.adminLiquidations({ query: { limit: 2 } });
    expect(p1.items).toHaveLength(2);
    expect(p1.items[0]!.liquidatedAt > '2026-10-12').toBe(true); // the real liquidation of the first test
    expect(p1.items[1]!.liquidatedAt).toBe('2026-10-10T17:00:00.000Z');
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await admin.b.adminLiquidations({ query: { limit: 2, cursor: p1.nextCursor! } });
    const all = [...p1.items, ...p2.items];
    expect(all.map((l) => l.liquidatedAt)).toEqual([all[0]!.liquidatedAt, '2026-10-10T17:00:00.000Z', '2026-10-10T16:59:59.999Z']);
    expect(p2.nextCursor).toBeNull();
    expect(p2.items[0]).toMatchObject({ quantity: null, liquidationPrice: null, margin: null, lostMargin: null, fee: null });
    const ranged = await admin.b.adminLiquidations({ query: { from: '2026-10-10T17:00:00.000Z', to: '2026-10-10T17:00:00.000Z' } });
    expect(ranged.items.map((l) => l.symbol)).toEqual(['ETHUSDT']);
    await expectApiError(admin.b.adminLiquidations({ query: { cursor: 'nope' } }), 'VALIDATION_ERROR', 400);
  });
});

describe('funding summary', () => {
  it('sums the inserted payments per symbol and side, inside the window only', async () => {
    const admin = await h.staff('admin');
    const a = await createUser(h.env);
    const b = await createUser(h.env);
    const longBtc = await addPosition(a, { symbol: 'BTCUSDT', side: 'LONG', quantity: '1', entryPrice: '80000', margin: '8000', leverage: 10 });
    const longEth = await addPosition(a, { symbol: 'ETHUSDT', side: 'LONG', quantity: '1', entryPrice: '2500', margin: '250', leverage: 10 });
    const shortBtc = await addPosition(b, { symbol: 'BTCUSDT', side: 'SHORT', quantity: '1', entryPrice: '80000', margin: '8000', leverage: 10 });
    const pay = (p: { id: number; userId: string; symbol: string }, iso: string, amount: string) => ({ positionId: p.id, userId: p.userId, symbol: p.symbol, fundingTime: new Date(iso), amount });
    await db()
      .insert(futuresFundingPayments)
      .values([
        pay(longBtc, '2026-10-02T00:00:00.000Z', '-1.5'),
        pay(longBtc, '2026-10-03T00:00:00.000Z', '-0.5'),
        pay(longBtc, '2026-10-04T00:00:00.000Z', '0.25'),
        pay(shortBtc, '2026-10-02T00:00:00.000Z', '1.5'),
        pay(shortBtc, '2026-10-03T00:00:00.000Z', '0.5'),
        pay(longEth, '2026-10-02T08:00:00.000Z', '-0.3'),
        pay(longBtc, '2026-09-30T23:59:59.999Z', '-9'), // before the window
        pay(longBtc, '2026-10-08T00:00:00.001Z', '-9'), // after the window
      ]);
    const r = await admin.b.adminFundingSummary({ query: { from: '2026-10-01T00:00:00.000Z', to: '2026-10-08T00:00:00.000Z' } });
    expect(r.items).toEqual([
      {
        symbol: 'BTCUSDT',
        long: { paid: '2.00000000', received: '0.25000000', net: '-1.75000000', payments: 3 },
        short: { paid: '0.00000000', received: '2.00000000', net: '2.00000000', payments: 2 },
        net: '0.25000000',
        payments: 5,
      },
      {
        symbol: 'ETHUSDT',
        long: { paid: '0.30000000', received: '0.00000000', net: '-0.30000000', payments: 1 },
        short: { paid: '0.00000000', received: '0.00000000', net: '0.00000000', payments: 0 },
        net: '-0.30000000',
        payments: 1,
      },
    ]);
    expect(r.totals).toEqual({
      long: { paid: '2.30000000', received: '0.25000000', net: '-2.05000000', payments: 4 },
      short: { paid: '0.00000000', received: '2.00000000', net: '2.00000000', payments: 2 },
      net: '-0.05000000',
      payments: 6,
    });
    expect((await admin.b.adminFundingSummary({ query: { from: '2026-10-01T00:00:00.000Z', to: '2026-10-08T00:00:00.000Z', symbol: 'ETHUSDT' } })).items.map((i) => i.symbol)).toEqual(['ETHUSDT']);
    // defaults: the last 7 days up to the clock
    adminNow = new Date('2026-10-08T00:00:00.000Z');
    const d = await admin.b.adminFundingSummary();
    expect([d.from, d.to]).toEqual(['2026-10-01T00:00:00.000Z', '2026-10-08T00:00:00.000Z']);
    expect(d.totals.payments).toBe(6);
    // an empty window is all zeros, not an error
    const empty = await admin.b.adminFundingSummary({ query: { from: '2025-01-01T00:00:00.000Z', to: '2025-01-02T00:00:00.000Z' } });
    expect(empty.items).toEqual([]);
    expect(empty.totals.net).toBe('0.00000000');
    await expectApiError(admin.b.adminFundingSummary({ query: { from: '2026-10-08T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' } }), 'VALIDATION_ERROR', 400);
    await expectApiError(admin.b.adminFundingSummary({ query: { from: '2024-01-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' } }), 'VALIDATION_ERROR', 400);
  });
});

describe('risk positions (mmr 0.004, BTC tick 0.1, ETH tick 0.01; mark BTC 78000)', () => {
  it('hand-computed numbers for LONG and SHORT, nulls for a STALE mark, sort order, open interest, paging', async () => {
    const admin = await h.staff('admin');
    await db().delete(futuresFundingPayments); // the funding test left open positions behind
    await db().delete(futuresPositions);
    const [u1, u2, u3, u4] = [await createUser(h.env), await createUser(h.env), await createUser(h.env), await createUser(h.env)] as [string, string, string, string];
    const long = await addPosition(u1, { symbol: 'BTCUSDT', side: 'LONG', quantity: '0.5', entryPrice: '80000', margin: '4000', leverage: 10 });
    const short = await addPosition(u2, { symbol: 'BTCUSDT', side: 'SHORT', quantity: '0.25', entryPrice: '80000', margin: '2000', leverage: 10 });
    const eth = await addPosition(u3, { symbol: 'ETHUSDT', side: 'LONG', quantity: '2', entryPrice: '2500', margin: '1000', leverage: 5 });
    const near = await addPosition(u4, { symbol: 'BTCUSDT', side: 'LONG', quantity: '1', entryPrice: '80000', margin: '4000', leverage: 20 });
    // ETH mark goes stale (no update for > 10 s) while BTC keeps ticking
    h.env.clock.advance(11_000);
    setMark(h.env, 'BTCUSDT', '78000');
    adminNow = new Date();

    const r = await admin.b.adminRiskPositions();
    const byId = new Map(r.items.map((i) => [i.positionId, i]));
    // LONG 0.5 @ 80000, margin 4000: liq = (40000 - 4000) / (0.5 x 0.996) = 72289.15.. -> 72289.2 (tick up)
    //   uPnL -1000, notional 39000, distance (78000 - 72289.2) / 78000 = 0.073215, ratio 156 / 3000 = 0.052
    expect(byId.get(String(long.id))).toMatchObject({
      uid: await uidOf(u1),
      markPrice: '78000',
      notional: '39000.00000000',
      margin: '4000.00000000',
      unrealizedPnl: '-1000.00000000',
      liquidationPrice: '72289.2',
      liqDistance: '0.073215',
      marginRatio: '0.052000',
    });
    // SHORT 0.25 @ 80000, margin 2000: liq = 22000 / (0.25 x 1.004) = 87649.40.. -> 87649.4 (tick down)
    //   uPnL +500, notional 19500, distance (87649.4 - 78000) / 78000 = 0.123710, ratio 78 / 2500 = 0.0312
    expect(byId.get(String(short.id))).toMatchObject({ side: 'SHORT', unrealizedPnl: '500.00000000', notional: '19500.00000000', liquidationPrice: '87649.4', liqDistance: '0.123710', marginRatio: '0.031200' });
    // 1 @ 80000, margin 4000: liq = 76000 / 0.996 = 76305.22 -> 76305.3; uPnL -2000, distance 1694.7 / 78000 = 0.021727, ratio 312 / 2000 = 0.156
    expect(byId.get(String(near.id))).toMatchObject({ liquidationPrice: '76305.3', liqDistance: '0.021727', marginRatio: '0.156000', notional: '78000.00000000' });
    // STALE mark: only what does not need it. liq = 4000 / (2 x 0.996) = 2008.03.. -> 2008.04
    expect(byId.get(String(eth.id))).toMatchObject({ markPrice: null, notional: null, unrealizedPnl: null, liqDistance: null, marginRatio: null, liquidationPrice: '2008.04', margin: '1000.00000000' });

    // default sort: closest to liquidation first, null last
    expect(r.items.map((i) => i.positionId)).toEqual([near.id, long.id, short.id, eth.id].map(String));
    expect((await admin.b.adminRiskPositions({ query: { sort: 'notional' } })).items.map((i) => i.positionId)).toEqual([near.id, long.id, short.id, eth.id].map(String));
    expect(r.nextCursor).toBeNull();

    // open interest per symbol (quantities always; notionals null while the mark is not LIVE)
    expect(r.totals).toEqual([
      { symbol: 'BTCUSDT', positions: 3, longQty: '1.5', shortQty: '0.25', longNotional: '117000.00000000', shortNotional: '19500.00000000', margin: '10000.00000000', markStatus: 'LIVE' },
      { symbol: 'ETHUSDT', positions: 1, longQty: '2', shortQty: '0', longNotional: null, shortNotional: null, margin: '1000.00000000', markStatus: 'STALE' },
    ]);

    // filters: symbol narrows items and totals, side narrows items only
    const sym = await admin.b.adminRiskPositions({ query: { symbol: 'ETHUSDT' } });
    expect(sym.items.map((i) => i.positionId)).toEqual([String(eth.id)]);
    expect(sym.totals.map((t) => t.symbol)).toEqual(['ETHUSDT']);
    const shorts = await admin.b.adminRiskPositions({ query: { side: 'SHORT' } });
    expect(shorts.items.map((i) => i.positionId)).toEqual([String(short.id)]);
    expect(shorts.totals[0]!.longQty).toBe('1.5');

    // paging over one stable order
    const p1 = await admin.b.adminRiskPositions({ query: { limit: 3 } });
    expect(p1.nextCursor).toBe('3');
    const p2 = await admin.b.adminRiskPositions({ query: { limit: 3, cursor: p1.nextCursor! } });
    expect([...p1.items, ...p2.items].map((i) => i.positionId)).toEqual(r.items.map((i) => i.positionId));
    expect(p2.nextCursor).toBeNull();
    await expectApiError(admin.b.adminRiskPositions({ query: { cursor: '-1' } }), 'VALIDATION_ERROR', 400);

    // BTC mark UNAVAILABLE-like (stale too): everything that depends on it is null, sorted last
    h.env.clock.advance(11_000);
    const stale = await admin.b.adminRiskPositions();
    expect(stale.items.every((i) => i.markPrice === null && i.liqDistance === null && i.marginRatio === null && i.unrealizedPnl === null && i.notional === null)).toBe(true);
    expect(stale.items.every((i) => i.liquidationPrice !== null)).toBe(true);
    expect(stale.items.map((i) => i.positionId)).toEqual([long.id, short.id, eth.id, near.id].map(String).sort((a, b) => Number(a) - Number(b)));
    expect(stale.totals.every((t) => t.markStatus === 'STALE' && t.longNotional === null)).toBe(true);
  });
});
