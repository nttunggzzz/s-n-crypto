import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { PlaceOcoRequest, PlaceOrderRequest } from '@cex/contracts';
import { dec } from '@cex/core';
import { notifications, orderLists, orders, positions, trades } from '../../db/schema.ts';
import { AppError } from '../../lib/errors.ts';
import { reconcile } from './reconciliation.ts';
import { MAX_ACTIVE_ALERTS } from './alertService.ts';
import { balanceOf, createTestEnv, createUser, marketTrade, setBook, strip, type TestEnv } from '../../../test/helpers.ts';

let env: TestEnv;

const place = (userId: string, o: Record<string, unknown>) => env.ex.orders.placeOrder(userId, PlaceOrderRequest.parse(o));
const oco = (userId: string, o: Record<string, unknown>) => env.ex.orders.placeOco(userId, PlaceOcoRequest.parse(o));
const order = async (id: number) => (await env.database.db.select().from(orders).where(eq(orders.id, id)))[0]!;
const legsOf = async (listId: number) => env.database.db.select().from(orders).where(eq(orders.orderListId, listId)).orderBy(orders.id);
const notifTypes = async (userId: string) => (await env.database.db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(notifications.id)).map((n) => n.type);

/** A Binance trade at `price` reaches the matcher; waits for the batch. */
async function tradeAt(price: string) {
  marketTrade(env, 'BTCUSDT', price);
  await env.ex.matcher.idle('BTCUSDT');
}

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

async function expectBooksBalanced() {
  expect((await reconcile(env.database.db, false)).mismatches).toEqual([]);
}

/** User with 10,000 USDT and 0.999 BTC (bought 1 BTC for 100.5). */
async function userWithBtc(): Promise<string> {
  const u = await createUser(env);
  await env.ex.faucet.claim(u);
  await place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '1' });
  setBook(env, 'BTCUSDT', [['99.00', '1.00000'], ['98.00', '2.00000']], [['100.00', '0.50000'], ['101.00', '1.00000']]);
  return u;
}

beforeEach(async () => {
  if (env) await env.close();
  env = await createTestEnv();
  setBook(env, 'BTCUSDT', [['99.00', '1.00000'], ['98.00', '2.00000']], [['100.00', '0.50000'], ['101.00', '1.00000']]);
  await tradeAt('100.00'); // last price = 100
});

afterAll(async () => {
  await env?.close();
});

describe('stop orders', () => {
  it('stop-market SELL waits, then triggers on touch and executes against the bids', async () => {
    const u = await userWithBtc();
    await expectCode(place(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'STOP_MARKET', stopPrice: '100', quantity: '0.5' }), 'INVALID_STOP_PRICE');
    const r = await place(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'STOP_MARKET', stopPrice: '95', quantity: '0.5' });
    expect(r.order).toMatchObject({ status: 'NEW', triggerState: 'WAITING', triggerDirection: 'DOWN' });
    expect(await balanceOf(env, u, 'BTC')).toEqual({ available: '0.499', locked: '0.5' });

    await tradeAt('95.50');
    expect((await order(r.order.id)).status).toBe('NEW');
    await tradeAt('95.00');
    const o = await order(r.order.id);
    expect(o).toMatchObject({ status: 'FILLED', triggerState: 'TRIGGERED' });
    // 0.5 sold at 99 = 49.5, fee 0.0495
    expect(await balanceOf(env, u, 'BTC')).toEqual({ available: '0.499', locked: '0' });
    expect(await balanceOf(env, u, 'USDT')).toEqual({ available: String(9899.5 + 49.5 - 0.0495), locked: '0' });
    expect(await notifTypes(u)).toEqual(['STOP_TRIGGERED', 'ORDER_FILLED']);
    await expectBooksBalanced();
  });

  it('stop-market BUY by quote amount reserves USDT and refunds the unspendable dust', async () => {
    const u = await createUser(env);
    await env.ex.faucet.claim(u);
    const r = await place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'STOP_MARKET', stopPrice: '105', quoteOrderQty: '60' });
    expect(r.order.triggerDirection).toBe('UP');
    expect(await balanceOf(env, u, 'USDT')).toEqual({ available: '9940', locked: '60' });
    await tradeAt('105.00');
    const o = await order(r.order.id);
    // 50 buys 0.5 @100, 10 buys 0.099 @101 (floored to the step) = 9.999 → 0.001 USDT refunded
    expect(o.status).toBe('FILLED');
    expect(strip(o.executedQty)).toBe('0.599');
    expect(await balanceOf(env, u, 'USDT')).toEqual({ available: '9940.001', locked: '0' });
    await expectBooksBalanced();
  });

  it('stop-limit BUY becomes a working limit: takes what it can, rests the rest', async () => {
    const u = await createUser(env);
    await env.ex.faucet.claim(u);
    const r = await place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'STOP_LIMIT', stopPrice: '105', price: '100.5', quantity: '1' });
    expect(await balanceOf(env, u, 'USDT')).toEqual({ available: '9899.5', locked: '100.5' });
    await tradeAt('105.00');
    let o = await order(r.order.id);
    expect(o).toMatchObject({ status: 'PARTIALLY_FILLED', triggerState: 'TRIGGERED' });
    // 0.5 @100 taken; remaining 0.5 reserved at 100.5 = 50.25; 0.25 refunded
    expect(await balanceOf(env, u, 'USDT')).toEqual({ available: '9899.75', locked: '50.25' });
    await tradeAt('100.40');
    o = await order(r.order.id);
    expect(o.status).toBe('FILLED');
    expect(await balanceOf(env, u, 'USDT')).toEqual({ available: '9899.75', locked: '0' });
    await expectBooksBalanced();
  });

  it('trailing stop SELL follows the high and triggers on the pullback', async () => {
    const u = await userWithBtc();
    const r = await place(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'TRAILING_STOP_MARKET', trailingDeltaBips: 100, quantity: '0.5' });
    expect(r.order).toMatchObject({ trailingReferencePrice: '100.000000000000000000', stopPrice: '99.000000000000000000' });
    await tradeAt('110.00');
    let o = await order(r.order.id);
    expect(strip(o.trailingReferencePrice!)).toBe('110');
    expect(strip(o.stopPrice!)).toBe('108.9');
    await tradeAt('109.00');
    expect((await order(r.order.id)).status).toBe('NEW');
    await tradeAt('108.90');
    o = await order(r.order.id);
    expect(o).toMatchObject({ status: 'FILLED', triggerState: 'TRIGGERED' });
    await expectBooksBalanced();
  });

  it('trailing stop with an activation price stays inactive until reached', async () => {
    const u = await userWithBtc();
    await expectCode(place(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'TRAILING_STOP_MARKET', trailingDeltaBips: 100, activationPrice: '95', quantity: '0.5' }), 'INVALID_STOP_PRICE');
    const r = await place(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'TRAILING_STOP_MARKET', trailingDeltaBips: 100, activationPrice: '105', quantity: '0.5' });
    expect(r.order.stopPrice).toBeNull();
    await tradeAt('103.00');
    expect((await order(r.order.id)).trailingReferencePrice).toBeNull();
    await tradeAt('106.00');
    expect(strip((await order(r.order.id)).stopPrice!)).toBe('104.94');
    await tradeAt('104.94');
    expect((await order(r.order.id)).status).toBe('FILLED');
    await expectBooksBalanced();
  });
});

describe('OCO', () => {
  it('rejects prices on the wrong side of the market', async () => {
    const u = await userWithBtc();
    await expectCode(oco(u, { symbol: 'BTCUSDT', side: 'SELL', quantity: '0.5', price: '99', stopPrice: '95' }), 'INVALID_OCO_PRICES');
  });

  it('take-profit fill cancels the stop leg; funds are reserved once', async () => {
    const u = await userWithBtc();
    const { list, legs } = await oco(u, { symbol: 'BTCUSDT', side: 'SELL', quantity: '0.5', price: '110', stopPrice: '95' });
    expect(legs.map((l) => strip(l.lockedAmount))).toEqual(['0.5', '0']);
    expect(await balanceOf(env, u, 'BTC')).toEqual({ available: '0.499', locked: '0.5' });
    await tradeAt('110.01');
    const [limit, stop] = await legsOf(list.id);
    expect([limit!.status, stop!.status, stop!.closeReason]).toEqual(['FILLED', 'CANCELED', 'OCO_SIBLING']);
    expect((await env.database.db.select().from(orderLists).where(eq(orderLists.id, list.id)))[0]!.listStatus).toBe('ALL_DONE');
    expect(await balanceOf(env, u, 'BTC')).toEqual({ available: '0.499', locked: '0' });
    await expectBooksBalanced();
  });

  it('stop trigger cancels the limit leg and takes over its reservation', async () => {
    const u = await userWithBtc();
    const { list } = await oco(u, { symbol: 'BTCUSDT', side: 'SELL', quantity: '0.5', price: '110', stopPrice: '95' });
    await tradeAt('95.00');
    const [limit, stop] = await legsOf(list.id);
    expect([limit!.status, limit!.closeReason, stop!.status]).toEqual(['CANCELED', 'OCO_SIBLING', 'FILLED']);
    expect(await balanceOf(env, u, 'BTC')).toEqual({ available: '0.499', locked: '0' });
    await expectBooksBalanced();
  });

  it('canceling one leg cancels the list and unlocks once', async () => {
    const u = await userWithBtc();
    const { legs } = await oco(u, { symbol: 'BTCUSDT', side: 'SELL', quantity: '0.5', price: '110', stopPrice: '95' });
    await env.ex.orders.cancelOrder(u, String(legs[1]!.id));
    expect((await legsOf(legs[0]!.orderListId!)).map((l) => l.status)).toEqual(['CANCELED', 'CANCELED']);
    expect(await balanceOf(env, u, 'BTC')).toEqual({ available: '0.999', locked: '0' });
    await expectCode(env.ex.orders.cancelOrderList(u, String(legs[0]!.orderListId)), 'ORDER_NOT_CANCELABLE');
    await expectBooksBalanced();
  });

  it('BUY OCO reserves for the higher of both prices and refunds on fill', async () => {
    const u = await createUser(env);
    await env.ex.faucet.claim(u);
    await oco(u, { symbol: 'BTCUSDT', side: 'BUY', quantity: '0.1', price: '95', stopPrice: '105', stopLimitPrice: '106' });
    expect(await balanceOf(env, u, 'USDT')).toEqual({ available: '9989.4', locked: '10.6' });
    await tradeAt('94.99');
    // filled 0.1 @95 = 9.5; 1.1 back
    expect(await balanceOf(env, u, 'USDT')).toEqual({ available: '9990.5', locked: '0' });
    await expectBooksBalanced();
  });

  it('a leg filling and the other triggering at the same time: exactly one wins', async () => {
    const u = await userWithBtc();
    for (let i = 0; i < 10; i++) {
      const { legs } = await oco(u, { symbol: 'BTCUSDT', side: 'SELL', quantity: '0.06', price: '110', stopPrice: '95' });
      const [a, b] = await Promise.allSettled([env.ex.orders.fillResting(legs[0]!.id, env.clock.date()), env.ex.orders.triggerStop(legs[1]!.id, dec('95'), env.clock.date())]);
      const won = [a, b].filter((x) => x.status === 'fulfilled' && x.value !== null);
      expect(won).toHaveLength(1);
      const after = await legsOf(legs[0]!.orderListId!);
      expect(after.filter((l) => l.status === 'FILLED')).toHaveLength(1);
      expect(after.every((l) => strip(l.lockedAmount) === '0')).toBe(true);
    }
    expect((await balanceOf(env, u, 'BTC')).locked).toBe('0');
    await expectBooksBalanced();
  });
});

describe('TP/SL attached to a BUY', () => {
  it('roadmap M2: buy with TP/SL → TP hit → SL canceled → average cost and realized PnL correct', async () => {
    const u = await createUser(env);
    await env.ex.faucet.claim(u);
    await expectCode(place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '1', tpsl: { takeProfitPrice: '99', stopLossPrice: '95' } }), 'INVALID_TPSL');

    const r = await place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '1', tpsl: { takeProfitPrice: '110', stopLossPrice: '95' } });
    const parent = await order(r.order.id);
    expect(parent.tpsl).toMatchObject({ state: 'PLACED', childOrderIds: expect.any(Array) });
    const legs = await legsOf(Number(parent.tpsl!.childOrderListId));
    // 1 BTC bought, 0.001 BTC fee → 0.999 protected
    expect(legs.map((l) => [l.type, strip(l.quantity!), l.parentOrderId])).toEqual([
      ['LIMIT', '0.999', parent.id],
      ['STOP_MARKET', '0.999', parent.id],
    ]);
    const [pos] = await env.database.db.select().from(positions).where(and(eq(positions.userId, u), eq(positions.asset, 'BTC')));
    expect(dec(pos!.avgCost!).toDecimalPlaces(6).toString()).toBe('100.600601'); // 100.5 USDT / 0.999 BTC

    await tradeAt('110.01');
    const [tp, sl] = await legsOf(legs[0]!.orderListId!);
    expect([tp!.status, sl!.status, sl!.closeReason]).toEqual(['FILLED', 'CANCELED', 'OCO_SIBLING']);
    // 0.999 × 110 = 109.89, fee 0.10989 → 109.78011 received; cost 100.5 → +9.28011
    const [sell] = await env.database.db.select().from(trades).where(eq(trades.orderId, tp!.id));
    expect(strip(sell!.realizedPnl!)).toBe('9.28011');
    const p = await env.ex.portfolio.get(u);
    expect(p.totalRealizedPnl).toBe('9.28011000');
    expect(p.positions.find((x) => x.asset === 'BTC')).toMatchObject({ quantity: '0.00000000', avgCost: null, realizedPnl: '9.28011000' });
    expect(await balanceOf(env, u, 'USDT')).toEqual({ available: String(9899.5 + 109.78011), locked: '0' });
    expect(await notifTypes(u)).toEqual(['TPSL_PLACED', 'ORDER_FILLED']);
    await expectBooksBalanced();
  });

  it('limit BUY partially filled then canceled protects only the filled part', async () => {
    const u = await createUser(env);
    await env.ex.faucet.claim(u);
    const r = await place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '1', price: '100.5', tpsl: { takeProfitPrice: '120' } });
    expect(r.order.status).toBe('PARTIALLY_FILLED');
    expect((await order(r.order.id)).tpsl?.state).toBe('PENDING');
    await env.ex.orders.cancelOrder(u, String(r.order.id));
    const parent = await order(r.order.id);
    expect(parent.tpsl).toMatchObject({ state: 'PLACED', childOrderListId: null });
    const child = await order(Number(parent.tpsl!.childOrderIds[0]));
    expect([child.type, child.side, strip(child.quantity!), strip(child.price!)]).toEqual(['LIMIT', 'SELL', '0.4995', '120']);
    expect(await balanceOf(env, u, 'BTC')).toEqual({ available: '0', locked: '0.4995' });
    await expectBooksBalanced();
  });

  it('a BUY canceled before any fill skips TP/SL silently', async () => {
    const u = await createUser(env);
    await env.ex.faucet.claim(u);
    const r = await place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.1', price: '90', tpsl: { stopLossPrice: '80' } });
    await env.ex.orders.cancelOrder(u, String(r.order.id));
    expect((await order(r.order.id)).tpsl).toMatchObject({ state: 'SKIPPED', skippedReason: 'PARENT_NOT_FILLED' });
    expect(await notifTypes(u)).toEqual([]);
  });
});

describe('price alerts', () => {
  it('fire once when reached; replays do nothing; target already reached is rejected', async () => {
    const u = await createUser(env);
    await expectCode(env.ex.alerts.create(u, { symbol: 'BTCUSDT', condition: 'ABOVE', targetPrice: '99' }), 'INVALID_PRICE');
    const a = await env.ex.alerts.create(u, { symbol: 'BTCUSDT', condition: 'ABOVE', targetPrice: '105', note: 'breakout' });
    await tradeAt('104.99');
    expect((await env.ex.alerts.list(u, 'ACTIVE')).map((x) => x.id)).toEqual([a.id]);
    await tradeAt('105.00');
    const [fired] = await env.ex.alerts.list(u, 'TRIGGERED');
    expect(fired).toMatchObject({ id: a.id, triggeredPrice: '105.00000000' });
    expect(await env.ex.alerts.processWindow('BTCUSDT', dec('106'), dec('106'), env.clock.date())).toBe(0);
    expect(await notifTypes(u)).toEqual(['PRICE_ALERT']);
  });

  it(`at most ${MAX_ACTIVE_ALERTS} active alerts`, async () => {
    const u = await createUser(env);
    for (let i = 0; i < MAX_ACTIVE_ALERTS; i++) await env.ex.alerts.create(u, { symbol: 'BTCUSDT', condition: 'BELOW', targetPrice: String(50 + i) });
    await expectCode(env.ex.alerts.create(u, { symbol: 'BTCUSDT', condition: 'BELOW', targetPrice: '10' }), 'LIMIT_EXCEEDED');
  });
});

describe('portfolio', () => {
  it('values positions at the live price and records hourly snapshots without inventing prices', async () => {
    const u = await userWithBtc();
    await tradeAt('100.00');
    const p = await env.ex.portfolio.get(u);
    const btc = p.positions.find((x) => x.asset === 'BTC')!;
    // 0.999 BTC × 100 = 99.9 vs cost 100.5 → −0.6
    expect(btc).toMatchObject({ quantity: '0.99900000', marketValue: '99.90000000', costBasis: '100.50000000', unrealizedPnl: '-0.60000000' });
    expect(p.totalFeesUsdt).toBe('0.10050000'); // 0.0005 @100 + 0.0005 @101

    await env.ex.portfolio.snapshotAll(env.clock.date());
    await env.ex.portfolio.snapshotAll(env.clock.date()); // idempotent per hour
    env.clock.advance(3_600_000 + 11_000); // next hour, BTC price now stale
    await env.ex.portfolio.snapshotAll(env.clock.date());
    const h = await env.ex.portfolio.history(u, '24h');
    expect(h.points).toHaveLength(2);
    expect(h.points[0]!.totalValueUsdt).toBe(String(dec('9899.5').add('99.9').toFixed(8)));
    expect(h.points[1]!.totalValueUsdt).toBeNull();
  });
});

describe('limits and randomized consistency', () => {
  it('caps open orders per user', async () => {
    const u = await createUser(env);
    await env.ex.faucet.claim(u);
    await env.database.db.execute(sql`
      INSERT INTO orders (user_id, client_order_id, symbol, side, type, status, quantity, price)
      SELECT ${u}, 'bulk-' || g, 'BTCUSDT', 'BUY', 'LIMIT', 'NEW', '0.1', '1' FROM generate_series(1, 200) g`);
    await expectCode(place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.1', price: '90' }), 'LIMIT_EXCEEDED');
  });

  it('random mix of every order type keeps balances non-negative and the books reconciled', async () => {
    const users = [await userWithBtc(), await userWithBtc(), await userWithBtc()];
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
    let mid = 100;
    for (let step = 0; step < 200; step++) {
      mid = Math.max(60, mid + (rnd() - 0.5) * 4);
      setBook(env, 'BTCUSDT', [[(mid - 0.5).toFixed(2), '3'], [(mid - 1).toFixed(2), '5']], [[(mid + 0.5).toFixed(2), '3'], [(mid + 1).toFixed(2), '5']]);
      const u = pick(users);
      const a = rnd();
      const q = (0.01 + rnd() * 0.3).toFixed(5);
      try {
        if (a < 0.15) await place(u, { symbol: 'BTCUSDT', side: pick(['BUY', 'SELL']), type: 'MARKET', quantity: q });
        else if (a < 0.3) await place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: q, price: (mid - rnd() * 2).toFixed(2), tpsl: { takeProfitPrice: (mid + 5).toFixed(2), stopLossPrice: (mid - 5).toFixed(2) } });
        else if (a < 0.4) await place(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'STOP_MARKET', stopPrice: (mid - 1 - rnd() * 3).toFixed(2), quantity: q });
        else if (a < 0.48) await place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'STOP_LIMIT', stopPrice: (mid + 1 + rnd() * 3).toFixed(2), price: (mid + 3).toFixed(2), quantity: q });
        else if (a < 0.56) await place(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'TRAILING_STOP_MARKET', trailingDeltaBips: 150, quantity: q });
        else if (a < 0.66) await oco(u, { symbol: 'BTCUSDT', side: 'SELL', quantity: q, price: (mid + 2 + rnd() * 3).toFixed(2), stopPrice: (mid - 2 - rnd() * 3).toFixed(2) });
        else if (a < 0.72) await oco(u, { symbol: 'BTCUSDT', side: 'BUY', quantity: q, price: (mid - 2).toFixed(2), stopPrice: (mid + 2).toFixed(2), stopLimitPrice: (mid + 3).toFixed(2) });
        else if (a < 0.8) await env.ex.orders.cancelAll(u, 'BTCUSDT');
        else await tradeAt(mid.toFixed(2));
      } catch (e) {
        if (!(e instanceof AppError)) throw e;
      }
    }
    const neg = await env.database.db.execute(sql`SELECT count(*)::int AS n FROM balances WHERE available < 0 OR locked < 0`);
    expect(neg.rows[0]).toEqual({ n: 0 });
    const r = await reconcile(env.database.db);
    expect(r.mismatches).toEqual([]);
    const types = await env.database.db.execute(sql`SELECT DISTINCT type FROM orders WHERE status = 'FILLED' ORDER BY 1`);
    expect(types.rows.length).toBeGreaterThanOrEqual(3); // the random walk really exercised several types
  });
});
