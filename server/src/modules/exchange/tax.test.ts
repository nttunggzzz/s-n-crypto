import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { PlaceOcoRequest, PlaceOrderRequest } from '@cex/contracts';
import { dec } from '@cex/core';
import { exchangeSettings, gridBots, ledgerEntries, orders, taxWithholdings, trades, users } from '../../db/schema.ts';
import { AppError } from '../../lib/errors.ts';
import { AdminService } from '../admin/adminService.ts';
import { TaxService } from '../tax/taxService.ts';
import { applyBalanceChanges, getBalances } from './ledger.ts';
import { reconcile } from './reconciliation.ts';
import { balanceOf, createTestEnv, createUser, marketTrade, setBook, setFuturesBook, setMark, strip, type TestEnv } from '../../../test/helpers.ts';

/**
 * Vietnam tax (module T §3.2, §3.7 batch T2): withholding on spot SELL fills inside settleFills.
 * Hand-computed golden values are in the comments; every test ends with the books reconciled (incl. the tax check).
 */
let env: TestEnv;

const place = (userId: string, o: Record<string, unknown>) => env.ex.orders.placeOrder(userId, PlaceOrderRequest.parse(o));
const oco = (userId: string, o: Record<string, unknown>) => env.ex.orders.placeOco(userId, PlaceOcoRequest.parse(o));
const legsOf = async (listId: number) => env.database.db.select().from(orders).where(eq(orders.orderListId, listId)).orderBy(orders.id);

async function setTax(mode: 'OFF' | 'WITHHOLD', rate = '0.001', vnd: string | null = null) {
  await env.database.db.update(exchangeSettings).set({ taxMode: mode, taxRate: rate, taxVndRate: vnd }).where(eq(exchangeSettings.id, 1));
  await env.ex.config.reload();
}
async function tradeAt(price: string) {
  marketTrade(env, 'BTCUSDT', price);
  await env.ex.matcher.idle('BTCUSDT');
}
const defaultBook = () => setBook(env, 'BTCUSDT', [['99.00', '1.00000'], ['98.00', '2.00000']], [['100.00', '0.50000'], ['101.00', '1.00000']]);
/** 10,000 USDT, bought 1 BTC for 100.5 (0.5 @ 100 + 0.5 @ 101), fee 0.001 BTC → 0.999 BTC, 9,899.5 USDT; tax OFF while buying. */
async function userWithBtc(): Promise<string> {
  const u = await createUser(env);
  await env.ex.faucet.claim(u);
  await place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '1' });
  defaultBook();
  return u;
}
const tradesOf = (orderId: number) => env.database.db.select().from(trades).where(eq(trades.orderId, orderId)).orderBy(trades.id);
const recordsOf = (orderId: number) => env.database.db.select().from(taxWithholdings).where(eq(taxWithholdings.orderId, orderId)).orderBy(taxWithholdings.tradeId);
const taxLedger = (userId: string) =>
  env.database.db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.userId, userId), eq(ledgerEntries.type, 'TAX_WITHHOLDING')))
    .orderBy(ledgerEntries.id);
async function expectBooksBalanced() {
  expect((await reconcile(env.database.db, false)).mismatches).toEqual([]);
}

beforeEach(async () => {
  if (env) await env.close();
  env = await createTestEnv();
  defaultBook();
  await tradeAt('100.00');
});
afterAll(async () => {
  await env?.close();
});

describe('withholding on spot SELL fills', () => {
  it('MARKET SELL over two levels: tax per fill on the gross value, one ledger line, Trade.tax, one record per trade, PnL after tax', async () => {
    const u = await userWithBtc();
    await setTax('WITHHOLD', '0.001', '26350');
    setBook(env, 'BTCUSDT', [['99.00', '0.50000'], ['98.00', '2.00000']], [['100.00', '1.00000']]);
    const r = await place(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.999' });
    // fills: 0.5 @ 99 = 49.5 and 0.499 @ 98 = 48.902 ; fee = tax = 0.0495 and 0.048902 each (0.1 %, exact)
    const ts = await tradesOf(r.order.id);
    expect(ts.map((t) => [strip(t.quoteQty), strip(t.fee), strip(t.tax)])).toEqual([
      ['49.5', '0.0495', '0.0495'],
      ['48.902', '0.048902', '0.048902'],
    ]);
    expect(r.trades.map((t) => strip(t.tax))).toEqual(['0.0495', '0.048902']);
    // USDT: 9899.5 + 98.402 − fee 0.098402 − tax 0.098402 = 9997.705196
    expect(await balanceOf(env, u, 'USDT')).toEqual({ available: '9997.705196', locked: '0' });
    const lines = await env.database.db.select().from(ledgerEntries).where(and(eq(ledgerEntries.refType, 'ORDER'), eq(ledgerEntries.refId, String(r.order.id)))).orderBy(ledgerEntries.id);
    expect(lines.map((l) => [l.type, l.asset, strip(l.deltaAvailable)])).toEqual([
      ['TRADE_DEBIT', 'BTC', '-0.999'],
      ['TRADE_CREDIT', 'USDT', '98.402'],
      ['FEE', 'USDT', '-0.098402'],
      ['TAX_WITHHOLDING', 'USDT', '-0.098402'],
    ]);
    // records: VND gross floored, tax ceiled — 49.5 × 26350 = 1 304 325 ; 0.0495 × 26350 = 1 304.325 → 1 305
    //                                           48.902 × 26350 = 1 288 567.7 → 1 288 567 ; 0.048902 × 26350 = 1 288.5677 → 1 289
    const recs = await recordsOf(r.order.id);
    expect(recs.map((w) => [w.tradeId, w.userId, w.symbol, w.asset, strip(w.quantity), strip(w.price), strip(w.grossQuote), strip(w.taxRate), strip(w.taxAmount), w.category, strip(w.vndRate!), strip(w.grossVnd!), strip(w.taxVnd!)])).toEqual([
      [ts[0]!.id, u, 'BTCUSDT', 'USDT', '0.5', '99', '49.5', '0.001', '0.0495', 'INDIVIDUAL', '26350', '1304325', '1305'],
      [ts[1]!.id, u, 'BTCUSDT', 'USDT', '0.499', '98', '48.902', '0.001', '0.048902', 'INDIVIDUAL', '26350', '1288567', '1289'],
    ]);
    expect(recs.map((w) => w.createdAt.getTime())).toEqual(ts.map((t) => t.createdAt.getTime()));
    // realized = (quote − fee − tax) − qty × avg, avg = 100.5 / 0.999 = 100.600600600600600601 (18 dp)
    //   49.5 − 0.099 − 50.30030030030030030 = −0.89930030 ; 48.902 − 0.097804 − 50.19969969969969970 = −1.39550370
    expect(ts.map((t) => strip(t.realizedPnl!))).toEqual(['-0.8993003', '-1.3955037']);
    expect((await env.ex.portfolio.get(u)).totalRealizedPnl).toBe('-2.29480400');
    await expectBooksBalanced();
  });

  it('rounding: each fill rounds UP at 1e-8 on its own (two fills pay more than one rounding of the total)', async () => {
    const u = await userWithBtc();
    await setTax('WITHHOLD');
    setBook(env, 'BTCUSDT', [['99.01', '0.05053'], ['98.99', '0.05053']], [['100.00', '1.00000']]);
    const r = await place(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.10106' });
    // 0.05053 × 99.01 = 5.0029753 → × 0.001 = 0.0050029753 → 0.00500298
    // 0.05053 × 98.99 = 5.0019647 → × 0.001 = 0.0050019647 → 0.00500197   (one rounding of the total would be 0.01000494)
    expect((await tradesOf(r.order.id)).map((t) => strip(t.tax))).toEqual(['0.00500298', '0.00500197']);
    expect((await taxLedger(u)).map((l) => strip(l.deltaAvailable))).toEqual(['-0.01000495']);
    await expectBooksBalanced();
  });

  it('MARKET SELL sized in USDT (quoteOrderQty) is withheld the same way', async () => {
    const u = await userWithBtc();
    await setTax('WITHHOLD');
    const r = await place(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quoteOrderQty: '49.5' });
    // 0.5 @ 99 = 49.5 → tax 0.0495
    expect((await tradesOf(r.order.id)).map((t) => [strip(t.quantity), strip(t.tax)])).toEqual([['0.5', '0.0495']]);
    expect(await recordsOf(r.order.id)).toHaveLength(1);
    await expectBooksBalanced();
  });

  it('BUY is never withheld (any order type), even with tax on', async () => {
    await setTax('WITHHOLD', '0.01');
    const u = await createUser(env);
    await env.ex.faucet.claim(u);
    const m = await place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.6' });
    const l = await place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.1', price: '99.5' });
    await tradeAt('99.49');
    expect((await tradesOf(m.order.id)).every((t) => dec(t.tax).isZero())).toBe(true);
    expect((await tradesOf(l.order.id)).map((t) => strip(t.tax))).toEqual(['0']);
    expect(await taxLedger(u)).toEqual([]);
    expect(await env.database.db.select().from(taxWithholdings).where(eq(taxWithholdings.userId, u))).toEqual([]);
    await expectBooksBalanced();
  });

  it('taxMode OFF: nothing withheld; DOMESTIC_ORG seller: nothing withheld; FOREIGN_ORG: withheld and recorded as such', async () => {
    const off = await userWithBtc();
    const r1 = await place(off, { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.1' });
    expect((await tradesOf(r1.order.id)).map((t) => strip(t.tax))).toEqual(['0']);
    expect(await recordsOf(r1.order.id)).toEqual([]);

    await setTax('WITHHOLD');
    const tax = new TaxService(env.database.db, env.ex.config);
    const org = await userWithBtc();
    await tax.updateProfile(org, 'DOMESTIC_ORG');
    const r2 = await place(org, { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.1' });
    expect((await tradesOf(r2.order.id)).map((t) => strip(t.tax))).toEqual(['0']);
    expect(await recordsOf(r2.order.id)).toEqual([]);
    expect(await taxLedger(org)).toEqual([]);
    // switching back applies to the next fill
    await tax.updateProfile(org, 'FOREIGN_ORG');
    const r3 = await place(org, { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.1' });
    expect((await recordsOf(r3.order.id)).map((w) => [w.category, strip(w.taxAmount)])).toEqual([['FOREIGN_ORG', '0.0099']]); // 0.1 × 99 × 0.001
    expect((await recordsOf(r3.order.id))[0]!.vndRate).toBeNull(); // no reference rate set → VND null, never 0
    await expectBooksBalanced();
  });

  it('a bot account (is_bot) is withheld like any seller (T-D4)', async () => {
    const u = await userWithBtc();
    await env.database.db.update(users).set({ isBot: true }).where(eq(users.id, u));
    await setTax('WITHHOLD');
    const r = await place(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.2' });
    expect((await recordsOf(r.order.id)).map((w) => strip(w.taxAmount))).toEqual(['0.0198']);
    await expectBooksBalanced();
  });

  it('LIMIT SELL partly filled while OFF, rest filled after the admin turned it on: only the later fill is withheld', async () => {
    const u = await userWithBtc();
    setBook(env, 'BTCUSDT', [['99.00', '0.40000'], ['98.00', '2.00000']], [['100.00', '1.00000']]);
    const p = await place(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'LIMIT', quantity: '0.999', price: '99' });
    expect(p.order.status).toBe('PARTIALLY_FILLED'); // 0.4 taken at 99 while OFF
    await setTax('WITHHOLD', '0.002');
    await tradeAt('99.01'); // the rest (0.599) fills as maker at 99 → 59.301 × 0.002 = 0.118602
    const ts = await tradesOf(p.order.id);
    expect(ts.map((t) => [strip(t.quantity), strip(t.tax)])).toEqual([
      ['0.4', '0'],
      ['0.599', '0.118602'],
    ]);
    expect((await recordsOf(p.order.id)).map((w) => [w.tradeId, strip(w.taxRate)])).toEqual([[ts[1]!.id, '0.002']]);
    await expectBooksBalanced();
  });

  it('STOP_LIMIT SELL: the fill after the trigger is withheld', async () => {
    const u = await userWithBtc();
    await setTax('WITHHOLD');
    const r = await place(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'STOP_LIMIT', stopPrice: '95', price: '94', quantity: '0.5' });
    await tradeAt('95.00'); // triggers; takes the 99 bid (≥ 94) → 0.5 × 99 = 49.5 → tax 0.0495
    expect((await tradesOf(r.order.id)).map((t) => strip(t.tax))).toEqual(['0.0495']);
    expect(await recordsOf(r.order.id)).toHaveLength(1);
    await expectBooksBalanced();
  });

  it('OCO SELL: the limit leg (maker) and, in another list, the triggered stop leg are both withheld', async () => {
    const u = await userWithBtc();
    await setTax('WITHHOLD');
    const a = await oco(u, { symbol: 'BTCUSDT', side: 'SELL', quantity: '0.4', price: '110', stopPrice: '95' });
    await tradeAt('110.01'); // limit leg fills at 110: 0.4 × 110 = 44 → tax 0.044
    const [limit, stopA] = await legsOf(a.list.id);
    expect([limit!.status, stopA!.status]).toEqual(['FILLED', 'CANCELED']);
    expect((await recordsOf(limit!.id)).map((w) => strip(w.taxAmount))).toEqual(['0.044']);

    defaultBook();
    await tradeAt('100.00');
    const b = await oco(u, { symbol: 'BTCUSDT', side: 'SELL', quantity: '0.5', price: '110', stopPrice: '95' });
    await tradeAt('95.00'); // stop leg triggers, sells 0.5 @ 99 = 49.5 → tax 0.0495
    const [limitB, stop] = await legsOf(b.list.id);
    expect([limitB!.status, stop!.status]).toEqual(['CANCELED', 'FILLED']);
    expect((await recordsOf(stop!.id)).map((w) => strip(w.taxAmount))).toEqual(['0.0495']);
    expect((await taxLedger(u)).map((l) => strip(l.deltaAvailable))).toEqual(['-0.044', '-0.0495']);
    await expectBooksBalanced();
  });

  it('TP/SL child of a BUY: the take-profit SELL is withheld and its realized PnL is after tax', async () => {
    const u = await createUser(env);
    await env.ex.faucet.claim(u);
    await setTax('WITHHOLD');
    const r = await place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '1', tpsl: { takeProfitPrice: '110', stopLossPrice: '95' } });
    const parent = (await env.database.db.select().from(orders).where(eq(orders.id, r.order.id)))[0]!;
    await tradeAt('110.01');
    const [tp] = await legsOf(Number(parent.tpsl!.childOrderListId));
    // 0.999 × 110 = 109.89, fee 0.10989, tax 0.10989 → 109.67022 received; cost 100.5 → +9.17022 (9.28011 without tax)
    const [sell] = await tradesOf(tp!.id);
    expect([strip(sell!.tax), strip(sell!.realizedPnl!)]).toEqual(['0.10989', '9.17022']);
    expect(await balanceOf(env, u, 'USDT')).toEqual({ available: '10009.17022', locked: '0' }); // 9899.5 + 109.67022
    await expectBooksBalanced();
  });
});

describe('exactly once', () => {
  it('cancel racing fills + replayed price events: one winner, one record per trade, never a second withholding', async () => {
    const u = await userWithBtc();
    await setTax('WITHHOLD');
    for (let i = 0; i < 10; i++) {
      const r = await place(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'LIMIT', quantity: '0.05', price: '110' });
      const results = await Promise.allSettled([
        env.ex.orders.cancelOrder(u, String(r.order.id)),
        env.ex.orders.fillResting(r.order.id, env.clock.date()),
        env.ex.orders.fillResting(r.order.id, env.clock.date()),
      ]);
      const winners = results.filter((x) => x.status === 'fulfilled' && x.value !== null);
      expect(winners).toHaveLength(1);
      // a replay of the same event after the fact does nothing
      expect(await env.ex.orders.fillResting(r.order.id, env.clock.date())).toBeNull();
      const filled = (await env.database.db.select().from(orders).where(eq(orders.id, r.order.id)))[0]!.status === 'FILLED';
      expect(await recordsOf(r.order.id)).toHaveLength(filled ? 1 : 0);
    }
    // the matcher fills a resting SELL once; replaying the same price window (and the event) adds nothing
    const resting = await place(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'LIMIT', quantity: '0.05', price: '110' });
    const before = (await taxLedger(u)).length;
    await tradeAt('110.01');
    expect(await recordsOf(resting.order.id)).toHaveLength(1);
    await tradeAt('110.01');
    expect(await env.ex.orders.fillResting(resting.order.id, env.clock.date())).toBeNull();
    expect((await taxLedger(u)).length).toBe(before + 1);
    expect(await recordsOf(resting.order.id)).toHaveLength(1);
    const [counts] = (
      await env.database.db.execute<{ trades: number; records: number }>(sql`
        SELECT (SELECT count(*)::int FROM trades WHERE user_id = ${u} AND side = 'SELL' AND tax > 0) AS trades,
               (SELECT count(*)::int FROM tax_withholdings WHERE user_id = ${u}) AS records`)
    ).rows;
    expect(counts!.records).toBe(counts!.trades);
    expect((await balanceOf(env, u, 'BTC')).locked).toBe('0');
    await expectBooksBalanced();
  });

  it('records are append-only: UPDATE / DELETE are refused by the database', async () => {
    const u = await userWithBtc();
    await setTax('WITHHOLD');
    await place(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.1' });
    await expect(env.database.db.execute(sql`UPDATE tax_withholdings SET tax_amount = 0.00000001 WHERE user_id = ${u}`)).rejects.toThrow();
    await expect(env.database.db.execute(sql`DELETE FROM tax_withholdings WHERE user_id = ${u}`)).rejects.toThrow();
    expect(await env.database.db.select().from(taxWithholdings).where(eq(taxWithholdings.userId, u))).toHaveLength(1);
  });
});

describe('not withheld outside spot SELL', () => {
  it('futures open/close, wallet transfers and faucet never create tax', async () => {
    await setTax('WITHHOLD', '0.01');
    env.clock.ms = Date.now();
    defaultBook();
    setFuturesBook(env, 'BTCUSDT', [['80000.0', '1.000']], [['80010.0', '1.000']]);
    setMark(env, 'BTCUSDT', '80000');
    const u = await createUser(env);
    await env.ex.faucet.claim(u);
    await env.futures.service.transfer(u, 'SPOT_TO_FUTURES', '1000');
    await env.futures.service.placeOrder(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01' });
    await env.futures.service.closePosition(u, 'BTCUSDT');
    await env.futures.service.transfer(u, 'FUTURES_TO_SPOT', '100');
    expect(await taxLedger(u)).toEqual([]);
    expect(await env.database.db.select().from(taxWithholdings).where(eq(taxWithholdings.userId, u))).toEqual([]);
    await expectBooksBalanced();
  });

  it('recurring buys (DCA) only buy: unchanged with tax on', async () => {
    await setTax('WITHHOLD');
    env.clock.ms = Date.now();
    const u = await createUser(env);
    await env.ex.faucet.claim(u);
    const plan = await env.bots.dca.create(u, { symbol: 'BTCUSDT', quoteAmount: '50', interval: 'DAILY', hour: 9 });
    env.clock.ms = Date.parse(plan.nextRunAt!) + 1000;
    defaultBook();
    expect(await env.bots.dca.runDue()).toBe(1);
    const ts = await env.database.db.select().from(trades).where(eq(trades.userId, u));
    // 50 USDT at 100 → 0.5 BTC, fee 0.0005 BTC, no tax
    expect(ts.map((t) => [t.side, strip(t.quantity), strip(t.fee), strip(t.tax)])).toEqual([['BUY', '0.5', '0.0005', '0']]);
    expect(await taxLedger(u)).toEqual([]);
    expect(await balanceOf(env, u, 'BTC')).toEqual({ available: '0.4995', locked: '0' });
    await expectBooksBalanced();
  });
});

describe('grid bot with tax on', () => {
  const params = { symbol: 'BTCUSDT', lowerPrice: '90', upperPrice: '110', gridCount: 4, mode: 'ARITHMETIC' as const, investment: '1000' };
  const book = () => setBook(env, 'BTCUSDT', [['99.00', '100.00000']], [['100.00', '100.00000']]);
  const settle = async () => {
    await env.ex.matcher.idle('BTCUSDT');
    await env.bots.grid.idle();
  };
  async function walletValue(userId: string, outside: string, price: string): Promise<string> {
    const rows = await getBalances(env.database.db, userId, ['USDT', 'BTC']);
    const total = (a: string) => rows.filter((r) => r.asset === a).reduce((s, r) => s.add(dec(r.available)).add(dec(r.locked)), dec('0'));
    return total('USDT').sub(dec(outside)).add(total('BTC').mul(dec(price))).toFixed(8, 1);
  }

  it('"spacing smaller than fees" counts the tax of the SELL leg', async () => {
    env.clock.ms = Date.now();
    book();
    marketTrade(env, 'BTCUSDT', '99.50');
    const tight = { ...params, lowerPrice: '99', upperPrice: '99.8', gridCount: 2 };
    // 99.4 / 99 × 0.999 × 0.999 − 1 = +0.2 % : fine without tax ; × 0.999 × (0.999 − 0.01) − 1 < 0 with the max tax rate
    expect(env.bots.grid.preview(tight).levels).toEqual(['99', '99.4', '99.8']);
    await setTax('WITHHOLD', '0.01');
    expect(() => env.bots.grid.preview(tight)).toThrow(/fees \(and tax\)/);
    await setTax('WITHHOLD', '0.001');
    expect(env.bots.grid.preview(tight).levels).toHaveLength(3);
  });

  it('several rounds: SELL legs withheld, round profit after tax, the bot value always equals what the wallet gained', async () => {
    env.clock.ms = Date.now();
    book();
    marketTrade(env, 'BTCUSDT', '99.50');
    await setTax('WITHHOLD');
    const u = await createUser(env);
    await env.database.db.transaction((tx) => applyBalanceChanges(tx, [{ userId: u, asset: 'USDT', type: 'FAUCET', deltaAvailable: dec('10000'), refType: 'FAUCET', refId: 't' }]));
    const bot = await env.bots.grid.create(u, params);
    const id = Number(bot.id);
    expect(bot.totalValue).toBe(await walletValue(u, '9000', env.market.livePrice('BTCUSDT')!.toFixed()));

    for (let round = 1; round <= 2; round++) {
      setBook(env, 'BTCUSDT', [['89.98', '100.00000']], [['89.99', '100.00000']]);
      marketTrade(env, 'BTCUSDT', '89.99');
      await settle();
      expect((await env.bots.grid.get(u, id)).totalValue).toBe(await walletValue(u, '9000', '89.99'));
      setBook(env, 'BTCUSDT', [['95.00', '100.00000']], [['95.01', '100.00000']]);
      marketTrade(env, 'BTCUSDT', '95.01');
      await settle();
      expect((await env.bots.grid.get(u, id)).totalValue).toBe(await walletValue(u, '9000', '95.01'));
      await expectBooksBalanced();
    }
    const [b] = await env.database.db.select().from(gridBots).where(eq(gridBots.id, id));
    expect(b!.completedRounds).toBe(2);
    // every filled grid SELL was withheld once; gridProfit = Σ (sell − fee − tax − buy cost) of the two 90→95 rounds
    const sells = await env.database.db.select().from(orders).where(and(eq(orders.sourceId, id), eq(orders.side, 'SELL'), eq(orders.status, 'FILLED')));
    const sellTrades = (await env.database.db.select().from(trades).where(eq(trades.userId, u))).filter((t) => sells.some((s) => s.id === t.orderId));
    expect(sellTrades.length).toBeGreaterThan(0);
    expect(sellTrades.every((t) => dec(t.tax).gt(0))).toBe(true);
    const buys90 = await env.database.db.select().from(orders).where(and(eq(orders.sourceId, id), eq(orders.side, 'BUY'), eq(orders.status, 'FILLED'), eq(orders.price, '90')));
    const net = sells.reduce((s, o) => s.add(dec(o.cumulativeQuoteQty)), dec('0')).sub(sellTrades.reduce((s, t) => s.add(dec(t.fee)).add(dec(t.tax)), dec('0')));
    expect(dec(b!.gridProfit).toFixed()).toBe(net.sub(buys90.reduce((s, o) => s.add(dec(o.cumulativeQuoteQty)), dec('0'))).toFixed());

    // stop + sell the rest: the closing SELL is withheld too, and the result is still exactly the wallet's gain
    const stopped = await env.bots.grid.stop(u, id, true);
    const [close] = await env.database.db.select().from(orders).where(and(eq(orders.sourceId, id), eq(orders.clientOrderId, `g${id}-close`)));
    expect((await recordsOf(close!.id)).length).toBeGreaterThan(0);
    expect(stopped.totalValue).toBe(await walletValue(u, '9000', env.market.livePrice('BTCUSDT')!.toFixed()));
    await expectBooksBalanced();
  });
});

describe('reconciliation of the tax books', () => {
  it('an admin account reset keeps the records; the books stay reconciled', async () => {
    const u = await userWithBtc();
    await setTax('WITHHOLD');
    await place(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.5' });
    const ownerId = await createUser(env);
    await env.database.db.update(users).set({ role: 'owner' }).where(eq(users.id, ownerId));
    const [owner] = await env.database.db.select().from(users).where(eq(users.id, ownerId));
    const admin = new AdminService(env.database.db, env.ex, env.market, env.futures, env.bots);
    await admin.resetAccount({ user: owner! }, u, 'test reset with tax records');
    expect(await balanceOf(env, u, 'USDT')).toEqual({ available: '0', locked: '0' });
    expect((await env.database.db.select().from(taxWithholdings).where(eq(taxWithholdings.userId, u))).map((w) => strip(w.taxAmount))).toEqual(['0.0495']);
    await expectBooksBalanced();
  });

  it('detects a deliberate mismatch: ledger without a record, trade tax changed, tax on a BUY', async () => {
    const u = await userWithBtc();
    await setTax('WITHHOLD');
    const r = await place(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.5' }); // tax 0.0495
    await expectBooksBalanced();
    // 1. money taken as tax with no record
    await env.database.db.transaction((tx) => applyBalanceChanges(tx, [{ userId: u, asset: 'USDT', type: 'TAX_WITHHOLDING', deltaAvailable: dec('-0.01'), refType: 'ORDER', refId: 'x' }]));
    // 2. a trade's tax edited
    await env.database.db.update(trades).set({ tax: '0.0496' }).where(eq(trades.orderId, r.order.id));
    // 3. tax written on a BUY fill
    const [buy] = await env.database.db.select().from(trades).where(and(eq(trades.userId, u), eq(trades.side, 'BUY'))).limit(1);
    await env.database.db.update(trades).set({ tax: '0.00000001' }).where(eq(trades.id, buy!.id));
    const res = await reconcile(env.database.db, false);
    expect(res.ok).toBe(false);
    const tax = res.mismatches.filter((m) => m.kind.startsWith('TAX_'));
    expect(tax.map((m) => [m.kind, m.asset, strip(m.expected), strip(m.actual)]).sort()).toEqual(
      [
        ['TAX_LEDGER_VS_WITHHOLDINGS', 'USDT', '0.0495', '0.0595'],
        ['TAX_TRADES_VS_WITHHOLDINGS', 'USDT', '0.0495', '0.0496'],
        ['TAX_TRADES_VS_WITHHOLDINGS', 'BTC', '0', '0.00000001'],
      ].sort(),
    );
    expect(tax.every((m) => m.userId === u && m.account === 'SPOT' && m.field === 'available')).toBe(true);
  });
});

describe('an error after the withholding rolls everything back', () => {
  it('a failing record insert leaves no tax ledger line, no trade and an untouched balance', async () => {
    const u = await userWithBtc();
    await setTax('WITHHOLD');
    const before = await balanceOf(env, u, 'USDT');
    // a CHECK on the records table that this fill cannot satisfy (removed again below)
    await env.database.db.execute(sql`ALTER TABLE tax_withholdings ADD CONSTRAINT test_block CHECK (tax_amount > 1000)`);
    try {
      await expect(place(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.1' })).rejects.toSatisfy((e: unknown) => !(e instanceof AppError));
    } finally {
      await env.database.db.execute(sql`ALTER TABLE tax_withholdings DROP CONSTRAINT test_block`);
    }
    expect(await balanceOf(env, u, 'USDT')).toEqual(before);
    expect(await taxLedger(u)).toEqual([]);
    expect((await env.database.db.select().from(trades).where(and(eq(trades.userId, u), eq(trades.side, 'SELL'))))).toEqual([]);
    await expectBooksBalanced();
  });
});
