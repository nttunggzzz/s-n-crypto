import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import WebSocket from 'ws';
import type { ServerMessage } from '@cex/contracts';
import { dec } from '@cex/core';
import { futuresFundingPayments, futuresOrders, futuresPositions, ledgerEntries, notifications } from '../../db/schema.ts';
import { AppError } from '../../lib/errors.ts';
import { applyBalanceChanges } from '../exchange/ledger.ts';
import { reconcile } from '../exchange/reconciliation.ts';
import { createTestEnv, createUser, futuresBalance, futuresTrade, setFuturesBook, setMark, balanceOf, type TestEnv } from '../../../test/helpers.ts';
import { ApiHarness } from '../../../test/apiHarness.ts';

let env: TestEnv;
const svc = () => env.futures.service;
const code = (c: string) => (e: unknown) => e instanceof AppError && e.code === c;
const books = () => {
  setFuturesBook(env, 'BTCUSDT', [['80000.0', '1.000'], ['79990.0', '2.000']], [['80010.0', '1.000'], ['80020.0', '2.000']]);
  setFuturesBook(env, 'ETHUSDT', [['2500.00', '10.000']], [['2501.00', '10.000']]);
  setMark(env, 'BTCUSDT', '80000');
  setMark(env, 'ETHUSDT', '2500');
};
const reconciled = async () => {
  const r = await reconcile(env.database.db, false);
  expect(r.mismatches).toEqual([]);
};
const openPos = async (userId: string, symbol = 'BTCUSDT') =>
  (await env.database.db.select().from(futuresPositions).where(and(eq(futuresPositions.userId, userId), eq(futuresPositions.symbol, symbol), eq(futuresPositions.status, 'OPEN'))))[0];

async function fundedUser(futures = '1000', spot = '10000'): Promise<string> {
  const id = await createUser(env);
  await env.database.db.transaction((tx) => applyBalanceChanges(tx, [{ userId: id, asset: 'USDT', type: 'FAUCET', deltaAvailable: dec(spot), refType: 'FAUCET', refId: 't' }]));
  if (futures !== '0') await svc().transfer(id, 'SPOT_TO_FUTURES', futures);
  return id;
}

beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => {
  await env.close();
});
beforeEach(() => {
  env.clock.ms = Date.now();
  books();
});

describe('futures wallet', () => {
  it('transfers move USDT between the two wallets in one transaction; overdrafts fail', async () => {
    const u = await fundedUser('1000', '1500');
    expect(await balanceOf(env, u, 'USDT')).toMatchObject({ available: '500' });
    expect(await futuresBalance(env, u)).toMatchObject({ available: '1000.000000000000000000', locked: '0.000000000000000000' });
    await expect(svc().transfer(u, 'SPOT_TO_FUTURES', '501')).rejects.toSatisfy(code('INSUFFICIENT_BALANCE'));
    await svc().transfer(u, 'FUTURES_TO_SPOT', '250.5');
    expect((await balanceOf(env, u, 'USDT')).available).toBe('750.5');
    const rows = await env.database.db.select().from(ledgerEntries).where(and(eq(ledgerEntries.userId, u), eq(ledgerEntries.type, 'TRANSFER')));
    expect(rows.map((r) => `${r.account}:${dec(r.deltaAvailable).toFixed()}`).sort()).toEqual(['FUTURES:-250.5', 'FUTURES:1000', 'SPOT:-1000', 'SPOT:250.5']);
    await reconciled();
  });

  it('leverage: default 10x, ≤ maxLeverage, locked while a position or order is open', async () => {
    const u = await fundedUser();
    expect((await svc().settings(u)).find((s) => s.symbol === 'BTCUSDT')!.leverage).toBe(10);
    await expect(svc().setLeverage(u, 'BTCUSDT', 25)).rejects.toSatisfy(code('INVALID_LEVERAGE'));
    expect((await svc().setLeverage(u, 'BTCUSDT', 20)).leverage).toBe(20);
    await svc().placeOrder(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', price: '70000.0', quantity: '0.001' });
    await expect(svc().setLeverage(u, 'BTCUSDT', 5)).rejects.toSatisfy(code('LEVERAGE_LOCKED'));
  });
});

describe('orders and positions (isolated, one-way)', () => {
  it('market LONG: margin = notional / leverage (rounded up), taker fee; partial close realizes PnL', async () => {
    const u = await fundedUser();
    const o = await svc().placeOrder(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01' });
    expect(o.status).toBe('FILLED');
    let p = (await openPos(u))!;
    expect([p.side, dec(p.entryPrice).toFixed(), dec(p.margin).toFixed(), dec(p.fees).toFixed(), p.leverage]).toEqual(['LONG', '80010', '80.01', '0.40005', 10]);
    expect(await futuresBalance(env, u)).toEqual({ available: '919.589950000000000000', locked: '80.010000000000000000' });

    await svc().closePosition(u, 'BTCUSDT', '0.005');
    p = (await openPos(u))!;
    // pnl (80000 − 80010)·0.005 = −0.05; released 40.005; close fee 0.2 → +39.755
    expect([dec(p.quantity).toFixed(), dec(p.margin).toFixed(), dec(p.realizedPnl).toFixed(), dec(p.fees).toFixed()]).toEqual(['0.005', '40.005', '-0.05', '0.60005']);
    expect(await futuresBalance(env, u)).toEqual({ available: '959.344950000000000000', locked: '40.005000000000000000' });
    await reconciled();
  });

  it('an opposite order larger than the position closes it and opens the other side (flip)', async () => {
    const u = await fundedUser();
    await svc().placeOrder(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01' });
    await svc().placeOrder(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.03' });
    const p = (await openPos(u))!;
    expect([p.side, dec(p.quantity).toFixed(), dec(p.entryPrice).toFixed(), dec(p.margin).toFixed()]).toEqual(['SHORT', '0.02', '80000', '160']);
    const closed = await env.database.db.select().from(futuresPositions).where(and(eq(futuresPositions.userId, u), eq(futuresPositions.status, 'CLOSED')));
    expect(closed).toHaveLength(1);
    expect(closed[0]!.closeReason).toBe('USER');
    // 919.58995 + (80.01 − 0.1 − 0.4) − 160 − 0.8
    expect(await futuresBalance(env, u)).toEqual({ available: '838.299950000000000000', locked: '160.000000000000000000' });
    await reconciled();
  });

  it('resting limit: reserves margin + taker fee, fills as maker only when traded through, refunds the fee difference', async () => {
    const u = await fundedUser();
    const o = await svc().placeOrder(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', price: '79950.0', quantity: '0.01' });
    expect([dec(o.marginLocked).toFixed(), dec(o.feeLocked).toFixed()]).toEqual(['79.95', '0.39975']);
    expect(await futuresBalance(env, u)).toEqual({ available: '919.650250000000000000', locked: '80.349750000000000000' });
    futuresTrade(env, 'BTCUSDT', '79950.0'); // touching is not enough
    await env.futures.engine.drain();
    expect(await openPos(u)).toBeUndefined();
    futuresTrade(env, 'BTCUSDT', '79940.0');
    await env.futures.engine.drain();
    const p = (await openPos(u))!;
    expect([dec(p.entryPrice).toFixed(), dec(p.margin).toFixed(), dec(p.fees).toFixed()]).toEqual(['79950', '79.95', '0.1599']);
    expect(await futuresBalance(env, u)).toEqual({ available: '919.890100000000000000', locked: '79.950000000000000000' });
    const [n] = await env.database.db.select().from(notifications).where(eq(notifications.userId, u));
    expect(n!.type).toBe('FUTURES_ORDER_FILLED');
    await reconciled();
  });

  it('reduce-only: needs an opposite position; resting reduce-only orders end when the position closes', async () => {
    const u = await fundedUser();
    await expect(svc().placeOrder(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.01', reduceOnly: true })).rejects.toSatisfy(code('REDUCE_ONLY_REJECTED'));
    await svc().placeOrder(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01' });
    const ro = await svc().placeOrder(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'LIMIT', price: '90000.0', quantity: '0.01', reduceOnly: true });
    expect(dec(ro.marginLocked).isZero()).toBe(true); // reduce-only reserves only the fee
    await svc().closePosition(u, 'BTCUSDT');
    const [after] = await env.database.db.select().from(futuresOrders).where(eq(futuresOrders.id, ro.id));
    expect([after!.status, after!.closeReason]).toEqual(['CANCELED', 'REDUCE_ONLY']);
    expect((await futuresBalance(env, u)).locked).toBe('0.000000000000000000');
    await reconciled();
  });

  it('closing a position larger than the visible book fills what the book holds, step by step; opening orders still need the full book', async () => {
    const u = await fundedUser('20000', '20000');
    await svc().placeOrder(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '1.2' }); // asks hold 3 BTC
    setFuturesBook(env, 'BTCUSDT', [['80000.0', '0.400']], [['80010.0', '3.000']]); // bids: 0.4 BTC only

    // a non-reduce-only SELL of the same size is rejected as before (it would not fill in full)
    await expect(svc().placeOrder(u, { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.5' })).rejects.toSatisfy(code('INSUFFICIENT_LIQUIDITY'));

    // close: takes the 0.4 BTC the book has, the rest of the order ends EXPIRED/INSUFFICIENT_LIQUIDITY, the position keeps 0.8
    const first = await svc().closePosition(u, 'BTCUSDT');
    expect([first.status, first.closeReason, dec(first.executedQty).toFixed(), dec(first.quantity).toFixed()]).toEqual(['EXPIRED', 'INSUFFICIENT_LIQUIDITY', '0.4', '1.2']);
    expect(dec((await openPos(u))!.quantity).toFixed()).toBe('0.8');
    expect((await futuresBalance(env, u)).locked).toBe(dec((await openPos(u))!.margin).toFixed(18));

    // nothing at all on the bid side: rejected, the position is untouched
    setFuturesBook(env, 'BTCUSDT', [], [['80010.0', '3.000']]);
    await expect(svc().closePosition(u, 'BTCUSDT')).rejects.toSatisfy(code('INSUFFICIENT_LIQUIDITY'));
    expect(dec((await openPos(u))!.quantity).toFixed()).toBe('0.8');

    // the book comes back: the rest closes in one go and the position is gone
    setFuturesBook(env, 'BTCUSDT', [['80000.0', '5.000']], [['80010.0', '3.000']]);
    const last = await svc().closePosition(u, 'BTCUSDT');
    expect([last.status, dec(last.executedQty).toFixed()]).toEqual(['FILLED', '0.8']);
    expect(await openPos(u)).toBeUndefined();
    expect((await futuresBalance(env, u)).locked).toBe('0.000000000000000000');
    await reconciled();
  });

  it('TP/SL validation and trigger: TP hit by the mark closes at market', async () => {
    const u = await fundedUser();
    await expect(svc().placeOrder(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01', tpsl: { takeProfitPrice: '79000.0' } })).rejects.toSatisfy(code('INVALID_TPSL'));
    await svc().placeOrder(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01', tpsl: { takeProfitPrice: '80500.0', stopLossPrice: '79000.0' } });
    setFuturesBook(env, 'BTCUSDT', [['80590.0', '1.000']], [['80600.0', '1.000']]);
    setMark(env, 'BTCUSDT', '80600');
    await env.futures.engine.drain();
    expect(await openPos(u)).toBeUndefined();
    const [closed] = await env.database.db.select().from(futuresPositions).where(eq(futuresPositions.userId, u));
    expect([closed!.closeReason, dec(closed!.realizedPnl).toFixed()]).toEqual(['TAKE_PROFIT', '5.8']);
    const [n] = await env.database.db.select().from(notifications).where(and(eq(notifications.userId, u), eq(notifications.type, 'POSITION_TPSL')));
    expect(n!.payload).toMatchObject({ reason: 'TAKE_PROFIT', realizedPnl: '5.80000000' });
    await reconciled();
  });

  it('adjust margin: add any amount, remove only down to the initial margin at the mark', async () => {
    const u = await fundedUser();
    await svc().placeOrder(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01' });
    let p = await svc().adjustMargin(u, 'BTCUSDT', '20');
    expect(dec(p.margin).toFixed()).toBe('100.01');
    // keep ≥ 80000·0.01/10 − (80000 − 80010)·0.01 = 80.1 → at most 19.91 removable
    await expect(svc().adjustMargin(u, 'BTCUSDT', '-19.92')).rejects.toSatisfy(code('MARGIN_TOO_LOW'));
    p = await svc().adjustMargin(u, 'BTCUSDT', '-19.91');
    expect(dec(p.margin).toFixed()).toBe('80.1');
    await reconciled();
  });

  it('stale market data: no new orders, no liquidation', async () => {
    const u = await fundedUser();
    await svc().setLeverage(u, 'BTCUSDT', 20);
    await svc().placeOrder(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01' });
    env.clock.advance(11_000); // > stale threshold (10 s)
    await expect(svc().placeOrder(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01' })).rejects.toSatisfy(code('MARKET_DATA_STALE'));
    await svc().processMark('BTCUSDT');
    expect(await openPos(u)).toBeDefined();
  });
});

describe('liquidation', () => {
  it('20x LONG: mark below the liquidation price → closed, margin lost, never a negative balance', async () => {
    const u = await fundedUser();
    await svc().setLeverage(u, 'BTCUSDT', 20);
    await svc().placeOrder(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01' });
    const resting = await svc().placeOrder(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', price: '70000.0', quantity: '0.001' });
    expect(dec((await openPos(u))!.margin).toFixed()).toBe('40.005');
    setMark(env, 'BTCUSDT', '76400'); // above liq ≈ 76314.76
    await env.futures.engine.drain();
    expect(await openPos(u)).toBeDefined();
    setMark(env, 'BTCUSDT', '76300');
    await env.futures.engine.drain();
    expect(await openPos(u)).toBeUndefined();
    const [closed] = await env.database.db.select().from(futuresPositions).where(eq(futuresPositions.userId, u));
    expect([closed!.closeReason, dec(closed!.margin).toFixed()]).toEqual(['LIQUIDATION', '0']);
    const [o] = await env.database.db.select().from(futuresOrders).where(eq(futuresOrders.id, resting.id));
    expect(o!.closeReason).toBe('LIQUIDATED'); // open orders on the symbol are canceled
    // 1000 − 40.005 − 0.40005; nothing paid back (remaining 2.905 < liquidation fee)
    expect(await futuresBalance(env, u)).toEqual({ available: '959.594950000000000000', locked: '0.000000000000000000' });
    const [n] = await env.database.db.select().from(notifications).where(and(eq(notifications.userId, u), eq(notifications.type, 'POSITION_LIQUIDATED')));
    expect(n!.payload).toMatchObject({ lostMargin: '40.00500000' });
    await reconciled();
  });

  it('a gap far beyond bankruptcy loses only the margin', async () => {
    const u = await fundedUser();
    await svc().setLeverage(u, 'BTCUSDT', 20);
    await svc().placeOrder(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01' });
    setMark(env, 'BTCUSDT', '60000');
    await env.futures.engine.drain();
    expect(await futuresBalance(env, u)).toEqual({ available: '959.594950000000000000', locked: '0.000000000000000000' });
    await reconciled();
  });

  it('race: user close vs liquidation — exactly one wins, books stay balanced', async () => {
    for (let i = 0; i < 5; i++) {
      const u = await fundedUser();
      await svc().setLeverage(u, 'BTCUSDT', 20);
      await svc().placeOrder(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01' });
      const pos = (await openPos(u))!;
      env.futures.marks.ingest('BTCUSDT', { markPrice: '76300', indexPrice: '76300', fundingRate: '0.0001', nextFundingTime: env.clock.now() + 3_600_000, eventTime: env.clock.now() }, env.clock.now());
      const results = await Promise.allSettled([svc().closePosition(u, 'BTCUSDT'), svc().liquidate(pos.id, env.futures.config.get('BTCUSDT')), env.futures.engine.drain()]);
      const closed = await env.database.db.select().from(futuresPositions).where(eq(futuresPositions.userId, u));
      expect(closed).toHaveLength(1);
      expect(closed[0]!.status).toBe('CLOSED');
      expect(['USER', 'LIQUIDATION']).toContain(closed[0]!.closeReason);
      expect(results.filter((r) => r.status === 'rejected').every((r) => code('NOT_FOUND')((r as PromiseRejectedResult).reason))).toBe(true);
      setMark(env, 'BTCUSDT', '80000');
    }
    await reconciled();
  });

  it('race: concurrent orders can never spend more than the wallet', async () => {
    const u = await fundedUser('200');
    const tries = await Promise.allSettled(Array.from({ length: 6 }, () => svc().placeOrder(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01' })));
    const ok = tries.filter((t) => t.status === 'fulfilled').length;
    expect(ok).toBe(2); // each needs 80.41005
    expect(tries.filter((t) => t.status === 'rejected').every((t) => code('INSUFFICIENT_BALANCE')((t as PromiseRejectedResult).reason))).toBe(true);
    expect(dec((await futuresBalance(env, u)).available).gte(0)).toBe(true);
    await reconciled();
  });
});

describe('funding', () => {
  it('settles at the funding roll: LONG pays, once per position and time; later positions are not charged', async () => {
    const t0 = env.clock.ms;
    setMark(env, 'BTCUSDT', '80000', { rate: '0.0001', nextFundingTime: t0 + 1000 });
    const u = await fundedUser();
    await svc().placeOrder(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01' });
    env.clock.advance(1500);
    const late = await fundedUser();
    await svc().placeOrder(late, { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.01' });
    books();
    setMark(env, 'BTCUSDT', '80000', { rate: '0.0002', nextFundingTime: t0 + 1000 + 8 * 3_600_000 }); // roll → settle t0+1000 at 0.0001
    await env.futures.engine.drain();
    const p = (await openPos(u))!;
    expect([dec(p.margin).toFixed(), dec(p.funding).toFixed()]).toEqual(['79.93', '-0.08']);
    expect(dec((await openPos(late))!.funding).isZero()).toBe(true);
    expect(await svc().settleFunding('BTCUSDT', new Date(t0 + 1000), '0.0001', '80000')).toBe(0); // idempotent
    const pays = await env.database.db.select().from(futuresFundingPayments).where(eq(futuresFundingPayments.positionId, p.id));
    expect(pays).toHaveLength(1);
    await reconciled();
  });
});

describe('admin reset', () => {
  it('closes futures positions and orders, then empties both wallets', async () => {
    const u = await fundedUser();
    await svc().placeOrder(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01' });
    await svc().placeOrder(u, { symbol: 'ETHUSDT', side: 'BUY', type: 'LIMIT', price: '2000.00', quantity: '0.1' });
    await svc().resetUser(u);
    expect(await openPos(u)).toBeUndefined();
    expect((await futuresBalance(env, u)).locked).toBe('0.000000000000000000');
    await reconciled();
  });
});

// ───────────────────────────── API + realtime

describe('futures API', () => {
  const h = new ApiHarness();
  beforeAll(async () => {
    await h.start();
  });
  afterAll(async () => {
    await h.stop();
  });

  it('end to end: info → transfer → order → position over HTTP and WebSocket', async () => {
    h.env.clock.ms = Date.now();
    setFuturesBook(h.env, 'BTCUSDT', [['80000.0', '1.000']], [['80010.0', '1.000']]);
    setMark(h.env, 'BTCUSDT', '80000');
    const { b } = await h.user();
    const info = await b.futuresExchangeInfo();
    expect(info.symbols.map((s) => s.symbol)).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(info.fees).toEqual({ makerFee: '0.0002', takerFee: '0.0005', liquidationFee: '0.005' });
    await b.faucetClaim();
    const t = await b.futuresTransfer({ body: { direction: 'SPOT_TO_FUTURES', amount: '1000' } });
    expect([t.spot.available, t.futures.available]).toEqual(['9000.00000000', '1000.00000000']);

    const ws = new WebSocket(h.base.replace('http', 'ws') + '/ws', { headers: { cookie: b.cookie() } });
    const msgs: ServerMessage[] = [];
    ws.on('message', (d) => msgs.push(JSON.parse(String(d))));
    await new Promise((r) => ws.once('open', r));
    ws.send(JSON.stringify({ type: 'subscribe', channel: 'user' }));
    ws.send(JSON.stringify({ type: 'subscribe', channel: 'futures:mark:BTCUSDT' }));
    await new Promise((r) => setTimeout(r, 100));

    await b.futuresSetLeverage({ params: { symbol: 'BTCUSDT' }, body: { leverage: 20 } });
    const o = await b.futuresPlaceOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01', tpsl: { stopLossPrice: '78000.0' } } });
    expect(o).toMatchObject({ status: 'FILLED', avgPrice: '80010', leverage: 20, fee: '0.40005000' });
    const [pos] = (await b.futuresPositions()).items;
    expect(pos).toMatchObject({ side: 'LONG', quantity: '0.01', margin: '40.00500000', markPrice: '80000', unrealizedPnl: '-0.10000000', stopLossPrice: '78000', liquidationPrice: '76314.8' });
    const acc = await b.futuresAccount();
    expect(acc).toMatchObject({ walletBalance: '999.59995000', positionMargin: '40.00500000', unrealizedPnl: '-0.10000000', equity: '999.49995000', openPositions: 1 });
    await expect(b.futuresSetLeverage({ params: { symbol: 'BTCUSDT' }, body: { leverage: 21 } })).rejects.toBeTruthy(); // 21 > 20 fails validation
    await b.futuresClosePosition({ params: { symbol: 'BTCUSDT' }, body: {} });
    expect((await b.futuresPositionHistory()).items[0]).toMatchObject({ status: 'CLOSED', closeReason: 'USER', realizedPnl: '-0.10000000' });
    expect((await b.futuresLedger()).items.every((e) => e.account === 'FUTURES')).toBe(true);
    await b.futuresTransfer({ body: { direction: 'FUTURES_TO_SPOT', amount: '1' } }); // spot `balance` + `futuresAccount` events
    await new Promise((r) => setTimeout(r, 150));
    ws.close();

    const kinds = msgs.filter((m) => m.type === 'event' && m.channel === 'user').map((m) => (m as { data: { kind: string } }).data.kind);
    expect(kinds, JSON.stringify(kinds)).toEqual(expect.arrayContaining(['futuresOrder', 'futuresTrade', 'futuresPosition', 'futuresAccount', 'balance']));
    expect(msgs.some((m) => m.type === 'event' && m.channel === 'futures:mark:BTCUSDT')).toBe(true);
    expect((await reconcile(h.env.database.db, false)).ok).toBe(true);
  });
});
