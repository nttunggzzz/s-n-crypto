import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { ApiError } from '@cex/contracts';
import { dec } from '@cex/core';
import { dcaPlans, dcaRuns, gridBotCells, gridBots, loginEvents, notifications, orders, trades, users } from '../../db/schema.ts';
import { AppError } from '../../lib/errors.ts';
import { applyBalanceChanges, getBalances } from '../exchange/ledger.ts';
import { reconcile } from '../exchange/reconciliation.ts';
import { createTestEnv, createUser, futuresBalance, marketTrade, setBook, setFuturesBook, setMark, type TestEnv } from '../../../test/helpers.ts';
import { ApiHarness } from '../../../test/apiHarness.ts';
import { nextRunAt } from './dcaService.ts';

const code = (c: string) => (e: unknown) => (e instanceof AppError || e instanceof ApiError) && (e as { code: string }).code === c;

// ───────────────────────────── DCA schedule (pure)

describe('recurring buy schedule (GMT+7)', () => {
  const at = (s: string) => new Date(s);
  it('daily / weekly / monthly at the hour in Vietnam time, strictly in the future', () => {
    // 2026-10-09 is a Friday; 01:00 UTC = 08:00 GMT+7
    expect(nextRunAt({ interval: 'DAILY', hour: 9, dayOfWeek: null, dayOfMonth: null }, at('2026-10-09T01:00:00Z')).toISOString()).toBe('2026-10-09T02:00:00.000Z');
    expect(nextRunAt({ interval: 'DAILY', hour: 9, dayOfWeek: null, dayOfMonth: null }, at('2026-10-09T02:00:00Z')).toISOString()).toBe('2026-10-10T02:00:00.000Z');
    expect(nextRunAt({ interval: 'DAILY', hour: 23, dayOfWeek: null, dayOfMonth: null }, at('2026-10-09T17:30:00Z')).toISOString()).toBe('2026-10-10T16:00:00.000Z');
    expect(nextRunAt({ interval: 'WEEKLY', hour: 9, dayOfWeek: 1, dayOfMonth: null }, at('2026-10-09T01:00:00Z')).toISOString()).toBe('2026-10-12T02:00:00.000Z');
    expect(nextRunAt({ interval: 'WEEKLY', hour: 9, dayOfWeek: 5, dayOfMonth: null }, at('2026-10-09T03:00:00Z')).toISOString()).toBe('2026-10-16T02:00:00.000Z');
    expect(nextRunAt({ interval: 'MONTHLY', hour: 9, dayOfWeek: null, dayOfMonth: 28 }, at('2026-10-09T01:00:00Z')).toISOString()).toBe('2026-10-28T02:00:00.000Z');
    expect(nextRunAt({ interval: 'MONTHLY', hour: 9, dayOfWeek: null, dayOfMonth: 5 }, at('2026-12-09T01:00:00Z')).toISOString()).toBe('2027-01-05T02:00:00.000Z');
  });
});

// ───────────────────────────── services on a real database

let env: TestEnv;
const book = () => {
  setBook(env, 'BTCUSDT', [['99.00', '100.00000']], [['100.00', '100.00000']]);
  marketTrade(env, 'BTCUSDT', '99.50');
};
const reconciled = async () => expect((await reconcile(env.database.db, false)).mismatches).toEqual([]);
async function fundedUser(usdt = '10000'): Promise<string> {
  const id = await createUser(env);
  await env.database.db.transaction((tx) => applyBalanceChanges(tx, [{ userId: id, asset: 'USDT', type: 'FAUCET', deltaAvailable: dec(usdt), refType: 'FAUCET', refId: 't' }]));
  return id;
}
/** The user's gain from the bot, valued like the bot does: (USDT − what stayed outside the bot) + BTC · price. */
async function walletValue(userId: string, outside: string, price: string): Promise<string> {
  const rows = await getBalances(env.database.db, userId, ['USDT', 'BTC']);
  const total = (a: string) => rows.filter((r) => r.asset === a).reduce((s, r) => s.add(dec(r.available)).add(dec(r.locked)), dec('0'));
  return total('USDT').sub(dec(outside)).add(total('BTC').mul(dec(price))).toFixed(8, 1); // rounded down, like the bot
}
const settle = async () => {
  await env.ex.matcher.idle('BTCUSDT');
  await env.bots.grid.idle();
};

beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => {
  await env.close();
});
beforeEach(() => {
  env.clock.ms = Date.now();
  book();
});

describe('recurring buys (DCA)', () => {
  it('runs once per scheduled time through the spot engine; never twice, even when called concurrently', async () => {
    const u = await fundedUser('1000');
    const plan = await env.bots.dca.create(u, { symbol: 'BTCUSDT', quoteAmount: '100', interval: 'DAILY', hour: 9 });
    expect(plan.status).toBe('ACTIVE');
    env.clock.ms = Date.parse(plan.nextRunAt!) + 1000;
    book();
    const results = await Promise.all([env.bots.dca.runDue(), env.bots.dca.runDue(), env.bots.dca.runDue()]);
    expect(results.reduce((a, b) => a + b, 0)).toBe(1);
    const runs = await env.database.db.select().from(dcaRuns).where(eq(dcaRuns.planId, Number(plan.id)));
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe('FILLED');
    const [o] = await env.database.db.select().from(orders).where(eq(orders.id, runs[0]!.orderId!));
    expect([o!.source, o!.sourceId, o!.type, dec(o!.cumulativeQuoteQty).toFixed()]).toEqual(['DCA', Number(plan.id), 'MARKET', '100']);
    const [p] = await env.database.db.select().from(dcaPlans).where(eq(dcaPlans.id, Number(plan.id)));
    // 100 USDT at 100 → 1 BTC minus 0.1 % fee
    expect([p!.runs, dec(p!.totalSpent).toFixed(), dec(p!.totalBought).toFixed()]).toEqual([1, '100', '0.999']);
    expect(p!.nextRunAt!.getTime()).toBeGreaterThan(env.clock.ms);
    expect(await env.bots.dca.runDue()).toBe(0);
    const [n] = await env.database.db.select().from(notifications).where(and(eq(notifications.userId, u), eq(notifications.type, 'DCA_EXECUTED')));
    expect(n!.payload).toMatchObject({ quoteSpent: '100.00000000', baseBought: '0.99900000' });
    await reconciled();
  });

  it('not enough USDT → the run is skipped with the reason; paused plans do not run', async () => {
    const u = await fundedUser('50');
    const plan = await env.bots.dca.create(u, { symbol: 'BTCUSDT', quoteAmount: '100', interval: 'DAILY', hour: 9 });
    const paused = await env.bots.dca.create(u, { symbol: 'BTCUSDT', quoteAmount: '10', interval: 'DAILY', hour: 9 });
    await env.bots.dca.update(u, paused.id, { status: 'PAUSED' });
    env.clock.ms = Date.parse(plan.nextRunAt!) + 1000;
    book();
    expect(await env.bots.dca.runDue()).toBe(1);
    const [r] = await env.database.db.select().from(dcaRuns).where(eq(dcaRuns.planId, Number(plan.id)));
    expect([r!.status, r!.reason]).toEqual(['SKIPPED', 'INSUFFICIENT_BALANCE']);
    expect(await env.database.db.select().from(dcaRuns).where(eq(dcaRuns.planId, Number(paused.id)))).toHaveLength(0);
    await expect(env.bots.dca.create(u, { symbol: 'BTCUSDT', quoteAmount: '1', interval: 'DAILY', hour: 9 })).rejects.toSatisfy(code('NOTIONAL_TOO_SMALL'));
    const resumed = await env.bots.dca.update(u, paused.id, { status: 'ACTIVE' });
    expect(Date.parse(resumed.nextRunAt!)).toBeGreaterThan(env.clock.ms);
  });
});

describe('spot grid bot', () => {
  const params = { symbol: 'BTCUSDT', lowerPrice: '90', upperPrice: '110', gridCount: 4, mode: 'ARITHMETIC' as const, investment: '1000' };

  it('rejects impossible grids', async () => {
    const u = await fundedUser();
    await expect(env.bots.grid.create(u, { ...params, lowerPrice: '101', upperPrice: '110' })).rejects.toSatisfy(code('INVALID_GRID'));
    await expect(env.bots.grid.create(u, { ...params, investment: '10' })).rejects.toSatisfy((e: unknown) => code('INVALID_GRID')(e) && 'minInvestment' in ((e as AppError).details ?? {}));
    await expect(env.bots.grid.create(u, { ...params, lowerPrice: '99.40', upperPrice: '99.60', gridCount: 10 })).rejects.toSatisfy(code('INVALID_GRID'));
    expect(env.bots.grid.preview(params)).toMatchObject({ levels: ['90', '95', '100', '105', '110'], buyOrders: 2, sellOrders: 2 });
  });

  it('start → BUY fills become SELLs one step up → a SELL fill books the round profit → stop sells the rest', async () => {
    const u = await fundedUser();
    const bot = await env.bots.grid.create(u, params);
    const id = Number(bot.id);
    const q = dec(bot.quantityPerGrid);
    expect(bot).toMatchObject({ status: 'RUNNING', openOrders: 4 });
    const open = await env.database.db.select().from(orders).where(and(eq(orders.source, 'GRID'), eq(orders.sourceId, id), eq(orders.status, 'NEW')));
    expect(open.map((o) => `${o.side}@${dec(o.price!).toFixed()}`).sort()).toEqual(['BUY@90', 'BUY@95', 'SELL@105', 'SELL@110']);
    // the whole investment is accounted for: reserved + spare quote = investment − cost of the initial buy
    const [init] = await env.database.db.select().from(orders).where(and(eq(orders.sourceId, id), eq(orders.clientOrderId, `g${id}-init`)));
    expect(dec(bot.quoteHeld).toFixed()).toBe(dec(params.investment).sub(dec(init!.cumulativeQuoteQty)).toFixed());
    expect(bot.totalValue).toBe(await walletValue(u, '9000', env.market.livePrice('BTCUSDT')!.toFixed()));
    await reconciled();

    // the user cannot cancel bot orders, and "cancel all" leaves them alone
    await expect(env.ex.orders.cancelOrder(u, String(open[0]!.id))).rejects.toSatisfy(code('ORDER_NOT_CANCELABLE'));
    expect(await env.ex.orders.cancelAll(u)).toHaveLength(0);

    // the market falls through 95 and 90 (the book moves with it): both BUY cells fill and turn into SELLs at 95 and 100
    setBook(env, 'BTCUSDT', [['89.98', '100.00000']], [['89.99', '100.00000']]);
    marketTrade(env, 'BTCUSDT', '89.99');
    await settle();
    let cells = await env.database.db.select().from(gridBotCells).where(eq(gridBotCells.botId, id));
    expect(cells.filter((c) => c.idx < 2).map((c) => c.side)).toEqual(['SELL', 'SELL']);
    const sells = await env.database.db.select().from(orders).where(and(eq(orders.source, 'GRID'), eq(orders.sourceId, id), eq(orders.status, 'NEW'), eq(orders.side, 'SELL')));
    expect(sells.map((o) => dec(o.price!).toFixed()).sort()).toEqual(['100', '105', '110', '95']);
    expect((await env.bots.grid.get(u, id)).totalValue).toBe(await walletValue(u, '9000', '89.99'));
    await reconciled();

    // the market comes back above 95: cell 0 sells, books the profit and goes back to BUY at 90
    setBook(env, 'BTCUSDT', [['95.00', '100.00000']], [['95.01', '100.00000']]);
    marketTrade(env, 'BTCUSDT', '95.01');
    await settle();
    cells = await env.database.db.select().from(gridBotCells).where(eq(gridBotCells.botId, id));
    const c0 = cells.find((c) => c.idx === 0)!;
    expect([c0.side, c0.rounds]).toEqual(['BUY', 1]);
    const filledSell = (await env.database.db.select().from(orders).where(and(eq(orders.sourceId, id), eq(orders.side, 'SELL'), eq(orders.status, 'FILLED'))))[0]!;
    const filledBuy90 = (await env.database.db.select().from(orders).where(and(eq(orders.sourceId, id), eq(orders.side, 'BUY'), eq(orders.status, 'FILLED'), eq(orders.price, '90'))))[0]!;
    const sellFee = (await env.database.db.select().from(trades).where(eq(trades.orderId, filledSell.id))).reduce((a, t) => a.add(dec(t.fee)), dec('0'));
    const expectedProfit = dec(filledSell.cumulativeQuoteQty).sub(sellFee).sub(dec(filledBuy90.cumulativeQuoteQty));
    const [b] = await env.database.db.select().from(gridBots).where(eq(gridBots.id, id));
    expect([dec(b!.gridProfit).toFixed(), b!.completedRounds]).toEqual([expectedProfit.toFixed(), 1]);
    expect(expectedProfit.gt(10)).toBe(true); // one 90→95 round on ~2.6 BTC
    expect(dec(filledSell.quantity!).lte(q)).toBe(true);
    await reconciled();

    // idempotent sync: forgetting a live order id re-links the same order (no duplicate)
    const linked = cells.find((c) => c.idx === 3)!;
    await env.database.db.update(gridBotCells).set({ orderId: null }).where(and(eq(gridBotCells.botId, id), eq(gridBotCells.idx, 3)));
    await env.bots.grid.sync(id);
    const [relinked] = await env.database.db.select().from(gridBotCells).where(and(eq(gridBotCells.botId, id), eq(gridBotCells.idx, 3)));
    expect(relinked!.orderId).toBe(linked.orderId);

    // stop + sell: every open bot order canceled, the base it holds sold at market
    const stopped = await env.bots.grid.stop(u, id, true);
    expect([stopped.status, stopped.stopReason, stopped.openOrders]).toEqual(['STOPPED', 'USER', 0]);
    const canceled = await env.database.db.select().from(orders).where(and(eq(orders.sourceId, id), eq(orders.status, 'CANCELED')));
    expect(canceled.every((o) => o.closeReason === 'BOT_STOPPED')).toBe(true);
    const [close] = await env.database.db.select().from(orders).where(and(eq(orders.sourceId, id), eq(orders.clientOrderId, `g${id}-close`)));
    expect([close!.side, close!.status]).toEqual(['SELL', 'FILLED']);
    // the result stays visible after the stop and is exactly what the user's wallet gained
    expect([stopped.baseHeld, stopped.quoteHeld]).toEqual(['0.00000000', '0.00000000']);
    expect(stopped.totalValue).toBe(await walletValue(u, '9000', env.market.livePrice('BTCUSDT')!.toFixed()));
    expect(stopped.totalPnl).toBe(dec(stopped.totalValue!).sub(1000).toFixed(8));
    await reconciled();
  });

  it('partial fills count in what the bot holds; stopping without selling values the base at the live price', async () => {
    const u = await fundedUser();
    const bot = await env.bots.grid.create(u, params);
    const id = Number(bot.id);
    // only 0.5 BTC offered at 94.95: the BUY at 95 fills partly (below its limit)
    setBook(env, 'BTCUSDT', [['94.90', '100.00000']], [['94.95', '0.50000']]);
    marketTrade(env, 'BTCUSDT', '94.95');
    await settle();
    const [buy95] = await env.database.db.select().from(orders).where(and(eq(orders.sourceId, id), eq(orders.side, 'BUY'), eq(orders.price, '95')));
    expect(dec(buy95!.executedQty).gt(0)).toBe(true);
    const running = await env.bots.grid.get(u, id);
    expect(running.totalValue).toBe(await walletValue(u, '9000', '94.95'));
    const stopped = await env.bots.grid.stop(u, id, false);
    expect(stopped.totalValue).toBe(await walletValue(u, '9000', '94.95'));
    expect(stopped.totalPnl).toBe(dec(stopped.totalValue!).sub(1000).toFixed(8)); // a real loss: the price fell while it held BTC
    await reconciled();
  });

  it('an admin cancel of a bot order stops the bot with an error', async () => {
    const u = await fundedUser();
    const bot = await env.bots.grid.create(u, params);
    await env.ex.orders.cancelAll(u, undefined, 'ADMIN');
    await settle();
    const [b] = await env.database.db.select().from(gridBots).where(eq(gridBots.id, Number(bot.id)));
    expect([b!.status, b!.stopReason]).toEqual(['ERROR', 'ADMIN']);
    await reconciled();
  });
});

describe('PnL analysis', () => {
  it('spot realized PnL by day and per closed order, win rate, by symbol', async () => {
    const u = await fundedUser();
    await env.ex.orders.placeOrder(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '10' });
    setBook(env, 'BTCUSDT', [['110.00', '100.00000']], [['111.00', '100.00000']]);
    await env.ex.orders.placeOrder(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '4' });
    setBook(env, 'BTCUSDT', [['90.00', '100.00000']], [['91.00', '100.00000']]);
    await env.ex.orders.placeOrder(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '3' });
    const realized = (await env.database.db.select().from(trades).where(eq(trades.userId, u))).filter((t) => t.realizedPnl !== null).map((t) => dec(t.realizedPnl!));
    const total = realized.reduce((a, v) => a.add(v), dec('0'));
    const p = await env.ex.pnl.analyze(u, '7d');
    expect(p.daily).toHaveLength(7);
    expect(p.spotRealized).toBe(total.toFixed(8));
    expect(p.daily.at(-1)!.cumulative).toBe(total.toFixed(8));
    expect(p.trades).toMatchObject({ count: 2, wins: 1, losses: 1, winRate: '0.5' });
    expect(p.bySymbol).toEqual([{ market: 'SPOT', symbol: 'BTCUSDT', realized: total.toFixed(8), trades: 2, wins: 1 }]);
  });

  it('futures: closing PnL − fees + funding = what the futures wallet gained; a closed position is one trade', async () => {
    const fx = env.futures.service;
    const u = await fundedUser();
    await fx.transfer(u, 'SPOT_TO_FUTURES', '1000');
    const t0 = env.clock.ms;
    setFuturesBook(env, 'BTCUSDT', [['80000.0', '1.000']], [['80010.0', '1.000']]);
    setMark(env, 'BTCUSDT', '80000', { rate: '0.0001', nextFundingTime: t0 + 1000 });
    await fx.placeOrder(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01' }); // LONG at 80010
    env.clock.advance(1500);
    setMark(env, 'BTCUSDT', '80000', { rate: '0.0002', nextFundingTime: t0 + 1000 + 8 * 3_600_000 }); // roll → LONG pays 0.08
    await env.futures.engine.drain();
    setFuturesBook(env, 'BTCUSDT', [['81000.0', '1.000']], [['81010.0', '1.000']]);
    setMark(env, 'BTCUSDT', '81000', { rate: '0.0002', nextFundingTime: t0 + 1000 + 8 * 3_600_000 });
    await env.futures.engine.drain();
    await fx.closePosition(u, 'BTCUSDT'); // sold at 81000
    const p = await env.ex.pnl.analyze(u, 'all');
    const bal = await futuresBalance(env, u);
    const gained = dec(bal.available).add(dec(bal.locked)).sub(1000);
    // (81000 − 80010)·0.01 = 9.9; fees 0.0005·(800.1 + 810) = 0.80505; funding −0.08
    expect([p.futuresRealized, p.futuresFees, p.futuresFunding]).toEqual(['9.01495000', '-0.80505000', '-0.08000000']);
    expect(p.futuresRealized).toBe(gained.toFixed(8));
    expect(p.totalRealized).toBe(p.futuresRealized);
    expect(p.trades).toMatchObject({ count: 1, wins: 1, losses: 0, winRate: '1' });
    expect(p.bySymbol).toEqual([{ market: 'FUTURES', symbol: 'BTCUSDT', realized: '9.01495000', trades: 1, wins: 1 }]);
  });
});

// ───────────────────────────── profile + security over HTTP

describe('profile and account security', () => {
  const h = new ApiHarness();
  beforeAll(async () => {
    await h.start();
  });
  afterAll(async () => {
    await h.stop();
  });
  const rawLogin = (email: string, password: string, ua: string) =>
    fetch(`${h.base}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': ua }, body: JSON.stringify({ email, password }) });
  const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
  const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

  it('UID and avatar on the profile', async () => {
    const { b } = await h.user();
    const me = await b.me();
    expect(Number(me.uid)).toBeGreaterThanOrEqual(10000001);
    expect(me.avatar).toBeNull();
    expect(await b.updateProfile({ body: { avatar: 'whale', name: 'Trader Việt' } })).toMatchObject({ avatar: 'whale', name: 'Trader Việt', uid: me.uid });
    await expect(b.updateProfile({ body: { avatar: 'dragon' as never } })).rejects.toSatisfy(code('VALIDATION_ERROR'));
  });

  it('login history, new-device alert (email + notification), anti-phishing code in emails', async () => {
    const u = await h.user();
    expect((await rawLogin(u.email, 'wrong password!', CHROME_WIN)).status).toBe(401);
    expect((await rawLogin(u.email, u.password, CHROME_WIN)).status).toBe(200); // first time on this browser → new device
    const mailsBefore = h.mail.sent.length;
    expect((await rawLogin(u.email, u.password, CHROME_WIN)).status).toBe(200); // known now
    expect(h.mail.sent.length).toBe(mailsBefore);

    const events = await h.env.database.db.select().from(loginEvents).where(eq(loginEvents.userId, u.id));
    expect(events.map((e) => `${e.result}:${e.newDevice}`)).toEqual(['OK:false', 'BAD_PASSWORD:false', 'OK:true', 'OK:false']);
    const alert = h.mail.sent.findLast((m) => m.to === u.email && m.subject.includes('thiết bị mới'))!;
    expect(alert.text).toContain('Chrome · Windows');
    const hist = await u.b.loginHistory();
    expect(hist.items[0]).toMatchObject({ device: 'Chrome · Windows', success: true, newDevice: false });
    expect((await u.b.listNotifications()).items.some((n) => n.type === 'NEW_DEVICE_LOGIN')).toBe(true);

    await expect(u.b.setAntiPhishingCode({ body: { code: 'Cex2026', currentPassword: 'nope' } })).rejects.toSatisfy(code('VALIDATION_ERROR'));
    const sec = await u.b.setAntiPhishingCode({ body: { code: 'Cex2026', currentPassword: u.password } });
    expect(sec.antiPhishingCode).toBe('Ce*****');
    expect((await rawLogin(u.email, u.password, SAFARI_IOS)).status).toBe(200);
    const alert2 = h.mail.sent.findLast((m) => m.to === u.email)!;
    expect(alert2.text.startsWith('Mã chống lừa đảo của bạn: Cex2026')).toBe(true);
    await h.browser().forgotPassword({ body: { email: u.email } });
    expect(h.mail.sent.findLast((m) => m.to === u.email)!.text).toContain('Mã chống lừa đảo của bạn: Cex2026');

    await u.b.changePassword({ body: { currentPassword: u.password, newPassword: 'another long password' } });
    const overview = await u.b.securityOverview();
    expect(overview.passwordChangedAt).not.toBeNull();
    expect(overview.lastLogin).toMatchObject({ device: 'Safari · iOS' });
  });

  it('with 2FA on, setting the anti-phishing code needs a 2FA code', async () => {
    const s = await h.staff('admin');
    await expect(s.b.setAntiPhishingCode({ body: { code: 'Safe1234', currentPassword: s.password } })).rejects.toSatisfy(code('INVALID_TWO_FACTOR_CODE'));
    expect((await s.b.setAntiPhishingCode({ body: { code: 'Safe1234', currentPassword: s.password, twoFactorCode: s.totp.next() } })).antiPhishingCode).toBe('Sa******');
    const [row] = await h.env.database.db.select().from(users).where(eq(users.id, s.id));
    expect(row!.antiPhishingCode).toBe('Safe1234');
  });
});

