import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { PlaceOrderRequest } from '@cex/contracts';
import { dec } from '@cex/core';
import { orders, exchangeSettings, trades } from '../../db/schema.ts';
import { AppError } from '../../lib/errors.ts';
import { reconcile } from './reconciliation.ts';
import { balanceOf, createTestEnv, createUser, marketTrade, setBook, type TestEnv } from '../../../test/helpers.ts';

let env: TestEnv;

const place = (userId: string, o: Record<string, unknown>) => env.ex.orders.placeOrder(userId, PlaceOrderRequest.parse(o));

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

async function fundedUser(usdt = true): Promise<string> {
  const id = await createUser(env);
  if (usdt) await env.ex.faucet.claim(id);
  return id;
}

async function expectBooksBalanced() {
  const r = await reconcile(env.database.db, false);
  expect(r.mismatches).toEqual([]);
}

beforeEach(async () => {
  if (env) await env.close();
  env = await createTestEnv();
  setBook(env, 'BTCUSDT', [['99.00', '1.00000'], ['98.00', '2.00000']], [['100.00', '0.50000'], ['101.00', '1.00000']]);
});

afterAll(async () => {
  await env?.close();
});

describe('faucet', () => {
  it('credits 10,000 USDT, enforces the 24h cooldown and the lifetime cap', async () => {
    const u = await createUser(env);
    const r = await env.ex.faucet.claim(u);
    expect(r.claimed.toString()).toBe('10000');
    expect(await balanceOf(env, u, 'USDT')).toEqual({ available: '10000', locked: '0' });

    await expectCode(env.ex.faucet.claim(u), 'FAUCET_COOLDOWN');
    env.clock.advance(24 * 3600_000);
    await env.ex.faucet.claim(u);

    await env.database.db.update(exchangeSettings).set({ faucetLifetimeCap: '25000' });
    await env.ex.config.reload();
    env.clock.advance(24 * 3600_000);
    const third = await env.ex.faucet.claim(u);
    expect(third.claimed.toString()).toBe('5000'); // only up to the cap
    env.clock.advance(24 * 3600_000);
    await expectCode(env.ex.faucet.claim(u), 'FAUCET_CAP_REACHED');
    expect((await env.ex.faucet.status(u)).totalClaimed).toBe('25000.00000000');
    await expectBooksBalanced();
  });

  it('concurrent claims by the same user credit only once', async () => {
    const u = await createUser(env);
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => env.ex.faucet.claim(u)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await balanceOf(env, u, 'USDT')).toEqual({ available: '10000', locked: '0' });
  });
});

describe('market orders', () => {
  it('buy walks the ask side with slippage and takes the fee from the received BTC', async () => {
    const u = await fundedUser();
    const r = await place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '1' });
    expect(r.order.status).toBe('FILLED');
    expect(r.trades.map((t) => [t.price, t.quantity])).toEqual([
      ['100.000000000000000000', '0.500000000000000000'],
      ['101.000000000000000000', '0.500000000000000000'],
    ]);
    // cost = 0.5*100 + 0.5*101 = 100.5 ; fee = 0.1% of 1 BTC = 0.001
    expect(await balanceOf(env, u, 'USDT')).toEqual({ available: '9899.5', locked: '0' });
    expect(await balanceOf(env, u, 'BTC')).toEqual({ available: '0.999', locked: '0' });
    await expectBooksBalanced();
  });

  it('buy by quoteOrderQty never spends more than requested', async () => {
    const u = await fundedUser();
    const r = await place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quoteOrderQty: '75' });
    // 50 USDT buys 0.5 @100, the other 25 USDT buys 0.24752 @101 (floored to the 0.00001 step)
    expect(r.order.executedQty).toBe('0.747520000000000000');
    expect(r.order.cumulativeQuoteQty).toBe('74.999520000000000000');
    expect(dec(r.order.cumulativeQuoteQty).lte(75)).toBe(true);
    await expectBooksBalanced();
  });

  it('sell walks the bid side, fee is taken in USDT', async () => {
    const u = await fundedUser();
    await place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '1' });
    await place(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.999' });
    // proceeds = 0.999*99 = 98.901 ; fee = 0.098901 -> rounded up to 8dp = 0.098901
    expect(await balanceOf(env, u, 'BTC')).toEqual({ available: '0', locked: '0' });
    expect(await balanceOf(env, u, 'USDT')).toEqual({ available: '9998.302099', locked: '0' });
    await expectBooksBalanced();
  });

  it('rejects without side effects when the balance is insufficient', async () => {
    const u = await createUser(env);
    await expectCode(place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.1' }), 'INSUFFICIENT_BALANCE');
    const rows = await env.database.db.select().from(orders).where(eq(orders.userId, u));
    expect(rows).toHaveLength(0);
    await expectBooksBalanced();
  });

  it('rejects orders larger than the visible book', async () => {
    const u = await fundedUser();
    await expectCode(place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '5' }), 'INSUFFICIENT_LIQUIDITY');
  });

  it('concurrent orders cannot double-spend the same USDT', async () => {
    const u = await createUser(env);
    await env.ex.faucet.claim(u);
    // each order costs 6,000 USDT; 10,000 USDT covers only one of them
    setBook(env, 'BTCUSDT', [['99.00', '100']], [['6000.00', '100']]);
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '1' })));
    const ok = results.filter((r) => r.status === 'fulfilled');
    expect(ok).toHaveLength(1); // 6000 + 6000 > 10000
    expect(await balanceOf(env, u, 'USDT')).toEqual({ available: '4000', locked: '0' });
    await expectBooksBalanced();
  });
});

describe('validation and exchange state', () => {
  it('enforces Binance lot rules', async () => {
    const u = await fundedUser();
    await expectCode(place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.1', price: '90.001' }), 'PRICE_TICK_SIZE');
    await expectCode(place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.000001', price: '90' }), 'QUANTITY_STEP_SIZE');
    await expectCode(place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.01', price: '90' }), 'NOTIONAL_TOO_SMALL');
  });

  it('pauses trading when market data is stale', async () => {
    const u = await fundedUser();
    env.clock.advance(11_000);
    await expectCode(place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.1' }), 'MARKET_DATA_STALE');
    expect(env.market.getStatus('BTCUSDT')).toBe('STALE');
    expect(env.market.getStatus('ETHUSDT')).toBe('UNAVAILABLE');
  });

  it('emergency halt blocks new orders and matching', async () => {
    const u = await fundedUser();
    const r = await place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.1', price: '90' });
    await env.database.db.update(exchangeSettings).set({ tradingHalted: true });
    await env.ex.config.reload();
    await expectCode(place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.1' }), 'TRADING_HALTED');
    expect(await env.ex.matcher.processWindow('BTCUSDT', dec('80'), dec('80'), env.clock.date())).toBe(0);
    const [o] = await env.database.db.select().from(orders).where(eq(orders.id, r.order.id));
    expect(o!.status).toBe('NEW');
  });

  it('duplicate clientOrderId is rejected', async () => {
    const u = await fundedUser();
    await place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.1', price: '90', clientOrderId: 'abc' });
    await expectCode(place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.1', price: '90', clientOrderId: 'abc' }), 'DUPLICATE_CLIENT_ORDER_ID');
    await expectBooksBalanced();
  });

  it('ledger rows cannot be updated or deleted', async () => {
    const u = await fundedUser();
    await expect(env.database.db.execute(sql`UPDATE ledger_entries SET delta_available = 1 WHERE user_id = ${u}`)).rejects.toThrow();
    await expect(env.database.db.execute(sql`DELETE FROM ledger_entries WHERE user_id = ${u}`)).rejects.toThrow();
  });
});

describe('limit orders', () => {
  it('locks funds, fills only when the market trades THROUGH the price, at the limit price', async () => {
    const u = await fundedUser();
    const r = await place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.1', price: '90' });
    expect(r.order.status).toBe('NEW');
    expect(await balanceOf(env, u, 'USDT')).toEqual({ available: '9991', locked: '9' });

    marketTrade(env, 'BTCUSDT', '90.00'); // touch only
    await env.ex.matcher.idle('BTCUSDT');
    expect((await env.database.db.select().from(orders).where(eq(orders.id, r.order.id)))[0]!.status).toBe('NEW');

    marketTrade(env, 'BTCUSDT', '89.99'); // crossed
    await env.ex.matcher.idle('BTCUSDT');
    const [o] = await env.database.db.select().from(orders).where(eq(orders.id, r.order.id));
    expect(o!.status).toBe('FILLED');
    const [t] = await env.database.db.select().from(trades).where(eq(trades.orderId, r.order.id));
    expect(t!.price).toBe('90.000000000000000000');
    expect(t!.liquidity).toBe('MAKER');
    expect(await balanceOf(env, u, 'USDT')).toEqual({ available: '9991', locked: '0' });
    expect(await balanceOf(env, u, 'BTC')).toEqual({ available: '0.0999', locked: '0' });
    await expectBooksBalanced();
  });

  it('sell limit fills when the market trades above it', async () => {
    const u = await fundedUser();
    await place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.5' });
    const r = await place(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'LIMIT', quantity: '0.4', price: '110' });
    expect(await balanceOf(env, u, 'BTC')).toEqual({ available: '0.0995', locked: '0.4' });
    marketTrade(env, 'BTCUSDT', '110.01');
    await env.ex.matcher.idle('BTCUSDT');
    // 0.4*110 = 44 ; fee 0.044
    expect(await balanceOf(env, u, 'BTC')).toEqual({ available: '0.0995', locked: '0' });
    expect(await balanceOf(env, u, 'USDT')).toEqual({ available: '9993.956', locked: '0' });
    expect((await env.database.db.select().from(orders).where(eq(orders.id, r.order.id)))[0]!.status).toBe('FILLED');
    await expectBooksBalanced();
  });

  it('a marketable limit takes liquidity up to its price and rests the remainder', async () => {
    const u = await fundedUser();
    const r = await place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '2', price: '100.50' });
    expect(r.order.status).toBe('PARTIALLY_FILLED');
    expect(r.trades).toHaveLength(1); // 0.5 @ 100 (101 is above the limit)
    // locked: 1.5 * 100.5 = 150.75 ; paid 50 ; available = 10000 - 150.75 - 50
    expect(await balanceOf(env, u, 'USDT')).toEqual({ available: '9799.25', locked: '150.75' });
    expect(await balanceOf(env, u, 'BTC')).toEqual({ available: '0.4995', locked: '0' });
    await env.ex.orders.cancelOrder(u, String(r.order.id));
    expect(await balanceOf(env, u, 'USDT')).toEqual({ available: '9950', locked: '0' });
    await expectBooksBalanced();
  });

  it('IOC expires the unfilled remainder', async () => {
    const u = await fundedUser();
    const r = await place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '2', price: '100.50', timeInForce: 'IOC' });
    expect(r.order.status).toBe('EXPIRED');
    expect(await balanceOf(env, u, 'USDT')).toEqual({ available: '9950', locked: '0' });
    expect(env.ex.index.size()).toBe(0);
    await expectBooksBalanced();
  });

  it('cancel unlocks exactly once', async () => {
    const u = await fundedUser();
    const r = await place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.1', price: '90' });
    await env.ex.orders.cancelOrder(u, String(r.order.id));
    await expectCode(env.ex.orders.cancelOrder(u, String(r.order.id)), 'ORDER_NOT_CANCELABLE');
    expect(await balanceOf(env, u, 'USDT')).toEqual({ available: '10000', locked: '0' });
    await expectBooksBalanced();
  });

  it("users cannot see or cancel other users' orders", async () => {
    const a = await fundedUser();
    const b = await fundedUser();
    const r = await place(a, { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.1', price: '90' });
    await expectCode(env.ex.orders.cancelOrder(b, String(r.order.id)), 'NOT_FOUND');
  });

  it('replaying the same market event does not fill twice', async () => {
    const u = await fundedUser();
    await place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.1', price: '90' });
    const at = env.clock.date();
    expect(await env.ex.matcher.processWindow('BTCUSDT', dec('89'), dec('89'), at)).toBe(1);
    expect(await env.ex.matcher.processWindow('BTCUSDT', dec('89'), dec('89'), at)).toBe(0);
    // even if the index were stale, fillResting is idempotent
    const [o] = await env.database.db.select().from(orders);
    expect(await env.ex.orders.fillResting(o!.id, at)).toBeNull();
    expect(await balanceOf(env, u, 'BTC')).toEqual({ available: '0.0999', locked: '0' });
    await expectBooksBalanced();
  });

  it('cancel racing a fill: exactly one wins, money is never counted twice', async () => {
    const u = await createUser(env);
    await env.ex.faucet.claim(u);
    for (let i = 0; i < 25; i++) {
      const r = await place(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.1', price: '90' });
      const [c, f] = await Promise.allSettled([env.ex.orders.cancelOrder(u, String(r.order.id)), env.ex.orders.fillResting(r.order.id, env.clock.date())]);
      const canceled = c.status === 'fulfilled';
      const filled = f.status === 'fulfilled' && f.value !== null;
      expect(canceled !== filled).toBe(true);
      const [o] = await env.database.db.select().from(orders).where(eq(orders.id, r.order.id));
      expect(o!.status).toBe(canceled ? 'CANCELED' : 'FILLED');
      expect(o!.lockedAmount).toBe('0.000000000000000000');
    }
    expect((await balanceOf(env, u, 'USDT')).locked).toBe('0');
    await expectBooksBalanced();
  });
});

describe('randomized sequence', () => {
  it('balances never go negative and the books always reconcile', async () => {
    const users = [await fundedUser(), await fundedUser(), await fundedUser()];
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]!;
    let mid = 100;
    for (let step = 0; step < 150; step++) {
      mid = Math.max(50, mid + (rnd() - 0.5) * 4);
      const m = mid.toFixed(2);
      setBook(env, 'BTCUSDT', [[(mid - 0.5).toFixed(2), '3'], [(mid - 1).toFixed(2), '5']], [[(mid + 0.5).toFixed(2), '3'], [(mid + 1).toFixed(2), '5']]);
      const u = pick(users);
      const action = rnd();
      try {
        if (action < 0.3) {
          await place(u, { symbol: 'BTCUSDT', side: pick(['BUY', 'SELL']), type: 'MARKET', quantity: (0.05 + rnd()).toFixed(5) });
        } else if (action < 0.7) {
          const side = pick(['BUY', 'SELL'] as const);
          const price = (side === 'BUY' ? mid - rnd() * 3 : mid + rnd() * 3).toFixed(2);
          await place(u, { symbol: 'BTCUSDT', side, type: 'LIMIT', quantity: (0.05 + rnd()).toFixed(5), price });
        } else if (action < 0.85) {
          await env.ex.orders.cancelAll(u, 'BTCUSDT');
        } else {
          marketTrade(env, 'BTCUSDT', m);
          await env.ex.matcher.idle('BTCUSDT');
        }
      } catch (e) {
        if (!(e instanceof AppError)) throw e; // business rejections are fine
      }
    }
    const neg = await env.database.db.execute(sql`SELECT count(*)::int AS n FROM balances WHERE available < 0 OR locked < 0`);
    expect(neg.rows[0]).toEqual({ n: 0 });
    const r = await reconcile(env.database.db);
    expect(r.mismatches).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

