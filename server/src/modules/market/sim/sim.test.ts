import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dec, isMultipleOfStep } from '@cex/core';
import { futuresSymbols, symbols } from '../../../db/schema.ts';
import { applyBalanceChanges } from '../../exchange/ledger.ts';
import { reconcile } from '../../exchange/reconciliation.ts';
import { createTestEnv, createUser, type TestEnv } from '../../../../test/helpers.ts';
import { loadConfig } from '../../../config.ts';
import { createEmailSender } from '../../auth/email.ts';
import { candle, depth, history, makeSpec, markUpdate, onTick, price, ticker24h, trades } from './model.ts';
import { seedSimRules, SimFeed, simSpecs } from './feed.ts';
import snapshot from './snapshot.json' with { type: 'json' };

const T0 = Date.UTC(2026, 9, 10, 7, 13, 21); // ms
const btc = makeSpec('BTCUSDT', 'BTC', '82640.3', '0.01', '0.00001');
const pepe = makeSpec('PEPEUSDT', 'PEPE', '0.000004', '0.00000001', '1');
const pepeFut = makeSpec('1000PEPEUSDT', 'PEPE', '0.0040356', '0.0000001', '1', true);
const decs = (s: string) => dec(s).decimalPlaces();

describe('sim model (pure)', () => {
  it('is deterministic, stays near the reference and always on the tick grid', () => {
    expect(price(btc, T0 / 1000)).toBe(price(btc, T0 / 1000));
    for (let t = T0 / 1000; t < T0 / 1000 + 7 * 86_400; t += 3_607) {
      const p = price(btc, t);
      expect(p / 82640.3).toBeGreaterThan(0.85);
      expect(p / 82640.3).toBeLessThan(1.15);
      expect(isMultipleOfStep(onTick(btc, p), btc.tick)).toBe(true);
    }
    // it moves within minutes (resting orders near the price fill in end-to-end tests)
    const window = Array.from({ length: 300 }, (_, i) => price(btc, T0 / 1000 + i));
    expect((Math.max(...window) - Math.min(...window)) / 82640.3).toBeGreaterThan(0.0005);
  });

  it('order book: best bid < best ask by one tick, 20 sorted levels, quantities on the step', () => {
    for (const s of [btc, pepe]) {
      const d = depth(s, T0 / 1000);
      expect([d.bids.length, d.asks.length]).toEqual([20, 20]);
      expect(dec(d.asks[0]![0]).sub(dec(d.bids[0]![0])).eq(s.tick)).toBe(true);
      for (let i = 1; i < 20; i++) {
        expect(dec(d.bids[i]![0]).lt(dec(d.bids[i - 1]![0]))).toBe(true);
        expect(dec(d.asks[i]![0]).gt(dec(d.asks[i - 1]![0]))).toBe(true);
      }
      for (const [p, q] of [...d.bids, ...d.asks]) {
        expect(isMultipleOfStep(dec(p), s.tick) && isMultipleOfStep(dec(q), s.step) && dec(q).gt(0)).toBe(true);
      }
      for (const tr of trades(s, T0 / 1000)) expect([d.bids[0]![0], d.asks[0]![0]]).toContain(tr.price);
    }
  });

  it('candles: high/low contain open/close, history is contiguous and ends with the forming candle', () => {
    const items = history(btc, '15m', 50, T0);
    expect(items).toHaveLength(50);
    for (const [i, c] of items.entries()) {
      expect(dec(c.high).gte(dec(c.open)) && dec(c.high).gte(dec(c.close)) && dec(c.low).lte(dec(c.open)) && dec(c.low).lte(dec(c.close))).toBe(true);
      if (i > 0) expect(c.openTime).toBe(items[i - 1]!.openTime + 900_000);
    }
    expect(items.slice(0, -1).every((c) => c.closed)).toBe(true);
    expect(items.at(-1)!.closed).toBe(false);
    expect(items.at(-1)!.close).toBe(onTick(btc, price(btc, T0 / 1000)).toFixed(2));
    // endTime: only candles that open before it
    const older = history(btc, '1h', 10, T0, items[0]!.openTime);
    expect(older.at(-1)!.openTime).toBeLessThan(items[0]!.openTime);
    // a closed candle never changes later
    const c = candle(btc, '1m', 1_791_600_000, 1_791_600_060);
    expect(candle(btc, '1m', 1_791_600_000, 1_791_700_000)).toEqual(c);
  });

  it('24h ticker and futures mark agree with the price; the futures contract follows the coin', () => {
    const tk = ticker24h(btc, T0);
    expect(tk.lastPrice).toBe(onTick(btc, price(btc, T0 / 1000)).toFixed(2));
    expect(dec(tk.highPrice).gte(dec(tk.lastPrice)) && dec(tk.lowPrice).lte(dec(tk.lastPrice))).toBe(true);
    const m = markUpdate(pepeFut, T0);
    expect(m.nextFundingTime % (8 * 3_600_000)).toBe(0);
    expect(m.nextFundingTime).toBeGreaterThan(T0);
    expect(Math.abs(Number(m.fundingRate))).toBeLessThan(0.001);
    // 1000PEPE ≈ 1000 × PEPE (same coin seed; only the small futures premium differs)
    const ratio = price(pepeFut, T0 / 1000) / (price(pepe, T0 / 1000) * 1000);
    expect(Math.abs(ratio - 0.0040356 / 0.004)).toBeLessThan(0.01);
  });

  it('snapshot: 50 spot pairs + 50 contracts, every one passes the 8-decimal rule (invariant 3)', () => {
    const cfg = loadConfig({});
    expect(snapshot.spot.map((p) => p.symbol)).toEqual(cfg.symbols);
    expect(snapshot.futures).toHaveLength(50);
    for (const p of [...snapshot.spot, ...snapshot.futures]) expect(decs(p.tickSize) + decs(p.stepSize)).toBeLessThanOrEqual(8);
  });

  it('file email transport (end-to-end tests read the links from it)', async () => {
    const path = join(tmpdir(), `outbox-${process.pid}-${Date.now()}.jsonl`);
    const sender = createEmailSender(loadConfig({ EMAIL_TRANSPORT: 'file', EMAIL_OUTBOX: path }));
    await sender.send({ to: 'a@example.test', subject: 'S1', text: 'link 1' });
    await sender.send({ to: 'b@example.test', subject: 'S2', text: 'link 2' });
    const lines = readFileSync(path, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { to: string; text: string });
    expect(lines.map((l) => [l.to, l.text])).toEqual([['a@example.test', 'link 1'], ['b@example.test', 'link 2']]);
    rmSync(path);
  });

  it('production refuses synthetic prices and non-Resend email', () => {
    const prod = { NODE_ENV: 'production', DATA_ENCRYPTION_KEY: 'x', EMAIL_TRANSPORT: 'resend' };
    expect(() => loadConfig({ ...prod, MARKET_FEED: 'sim' })).toThrow(/sim/);
    expect(() => loadConfig({ ...prod, EMAIL_TRANSPORT: 'file' })).toThrow(/file/);
  });
});

// ───────────────────────────── the feed drives the real engines

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => {
  await env.close();
});

describe('sim feed + engines', () => {
  it('seeds the snapshot rules (spot + one perpetual per coin) in a transaction', async () => {
    await env.database.db
      .transaction(async (tx) => {
        const n = await seedSimRules(tx, ['BTCUSDT', 'PEPEUSDT', 'NOPEUSDT']);
        expect(n).toEqual({ spot: 2, futures: 2 });
        const fut = await tx.select().from(futuresSymbols);
        expect(fut.find((f) => f.symbol === '1000PEPEUSDT')).toMatchObject({ underlyingAsset: 'PEPE', multiplier: 1000 });
        expect((await tx.select().from(symbols)).some((s) => s.symbol === 'PEPEUSDT')).toBe(true);
        throw new Error('rollback');
      })
      .catch((e: Error) => expect(e.message).toBe('rollback'));
  });

  it('spot: the market goes LIVE and a market order fills at the synthetic ask; balances reconcile', async () => {
    const feed = new SimFeed(env.market, simSpecs('spot', [{ symbol: 'BTCUSDT', tick: '0.01', step: '0.00001' }]), { now: env.clock.now });
    feed.tick();
    expect(env.market.getStatus('BTCUSDT')).toBe('LIVE');
    const ask = env.market.getDepth('BTCUSDT', 1).asks[0]![0];
    const u = await createUser(env);
    await env.database.db.transaction((tx) => applyBalanceChanges(tx, [{ userId: u, asset: 'USDT', type: 'FAUCET', deltaAvailable: dec('10000'), refType: 'FAUCET', refId: 't' }]));
    const r = await env.ex.orders.placeOrder(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quoteOrderQty: '100' });
    expect(r.order.status).toBe('FILLED');
    expect(dec(r.trades[0]!.price).eq(dec(ask))).toBe(true);
    expect(feed.history('BTCUSDT', '1h', 24)).toHaveLength(24);
    expect((await reconcile(env.database.db, false)).mismatches).toEqual([]);
  });

  it('futures: marks go LIVE through onMark and a position opens at the synthetic book', async () => {
    const feed = new SimFeed(env.futures.market, simSpecs('futures', [{ symbol: 'BTCUSDT', tick: '0.1', step: '0.001' }]), { now: env.clock.now, onMark: (s, m) => env.futures.marks.ingest(s, m) });
    feed.tick();
    expect(env.futures.marks.status('BTCUSDT')).toBe('LIVE');
    const u = await createUser(env);
    await env.database.db.transaction((tx) => applyBalanceChanges(tx, [{ userId: u, asset: 'USDT', type: 'FAUCET', deltaAvailable: dec('1000'), refType: 'FAUCET', refId: 't' }]));
    await env.futures.service.transfer(u, 'SPOT_TO_FUTURES', '500');
    const o = await env.futures.service.placeOrder(u, { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.002' });
    expect(o.status).toBe('FILLED');
    expect((await reconcile(env.database.db, false)).mismatches).toEqual([]);
  });
});
