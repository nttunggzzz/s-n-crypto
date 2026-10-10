import type { Candle, CandleInterval } from '@cex/contracts';
import { CandleInterval as CandleIntervalSchema } from '@cex/contracts';
import { sql } from 'drizzle-orm';
import type { DbOrTx } from '../../../db/client.ts';
import { futuresSymbols, symbols } from '../../../db/schema.ts';
import { logger } from '../../../logger.ts';
import { defaultMmr } from '../../futures/config.ts';
import type { MarkUpdate } from '../binance.ts';
import type { MarketDataService } from '../marketData.ts';
import { candle, depth, history, INTERVAL_SEC, makeSpec, markUpdate, ticker24h, trades, type SimSpec } from './model.ts';
import snapshot from './snapshot.json' with { type: 'json' };

const INTERVALS = CandleIntervalSchema.options;

interface SnapshotPair {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  tickSize: string;
  stepSize: string;
  minQty: string;
  maxQty: string;
  minNotional: string;
  sortOrder: number;
  price: string;
}
interface SnapshotContract extends SnapshotPair {
  underlyingAsset: string;
  multiplier: number;
}
const SNAP = snapshot as { generatedAt: string; spot: SnapshotPair[]; futures: SnapshotContract[] };

/**
 * MARKET_FEED=sim: writes the real Binance pair rules from the snapshot (spot pairs in `wanted` order,
 * one perpetual per listed coin), so a fresh database can trade without reaching Binance.
 */
export async function seedSimRules(db: DbOrTx, wanted: string[]): Promise<{ spot: number; futures: number }> {
  const pairs = wanted.map((w) => SNAP.spot.find((p) => p.symbol === w)).filter((p): p is SnapshotPair => !!p);
  const missing = wanted.filter((w) => !pairs.some((p) => p.symbol === w));
  if (missing.length) logger.warn({ missing }, 'sim: no snapshot rules for these symbols; skipped');
  for (const [i, p] of pairs.entries()) {
    const values = { symbol: p.symbol, baseAsset: p.baseAsset, quoteAsset: p.quoteAsset, tickSize: p.tickSize, stepSize: p.stepSize, minQty: p.minQty, maxQty: p.maxQty, minNotional: p.minNotional, sourceStatus: 'TRADING', sortOrder: i };
    await db.insert(symbols).values(values).onConflictDoUpdate({ target: symbols.symbol, set: { ...values, updatedAt: sql`now()` } });
  }
  const bases = pairs.map((p) => p.baseAsset);
  let n = 0;
  for (const c of SNAP.futures) {
    const i = bases.indexOf(c.underlyingAsset);
    if (i < 0) continue;
    const rules = { baseAsset: c.baseAsset, quoteAsset: c.quoteAsset, underlyingAsset: c.underlyingAsset, multiplier: c.multiplier, tickSize: c.tickSize, stepSize: c.stepSize, minQty: c.minQty, maxQty: c.maxQty, minNotional: c.minNotional, sourceStatus: 'TRADING', sortOrder: i };
    await db
      .insert(futuresSymbols)
      .values({ symbol: c.symbol, ...rules, maintenanceMarginRate: defaultMmr(c.underlyingAsset) })
      .onConflictDoUpdate({ target: futuresSymbols.symbol, set: { ...rules, updatedAt: sql`now()` } });
    n++;
  }
  return { spot: pairs.length, futures: n };
}

/** Specs for the listed symbols; reference prices come from the snapshot (rules from the database). */
export function simSpecs(kind: 'spot' | 'futures', listed: { symbol: string; tick: string; step: string }[]): SimSpec[] {
  return listed.flatMap((l) => {
    if (kind === 'spot') {
      const p = SNAP.spot.find((x) => x.symbol === l.symbol);
      return p ? [makeSpec(l.symbol, p.baseAsset, p.price, l.tick, l.step)] : [];
    }
    const c = SNAP.futures.find((x) => x.symbol === l.symbol);
    return c ? [makeSpec(l.symbol, c.underlyingAsset, c.price, l.tick, l.step, true)] : [];
  });
}

/**
 * Drives a MarketDataService (and the futures marks) from the synthetic model, once per second —
 * the same ingest calls the Binance stream makes, so matching, TP/SL, liquidation and funding run
 * exactly as in production.
 */
export class SimFeed {
  private timer: NodeJS.Timeout | undefined;
  private readonly specs = new Map<string, SimSpec>();
  private readonly tradeIds = new Map<string, number>();
  private lastSec = 0;

  constructor(
    private readonly market: MarketDataService,
    specs: SimSpec[],
    private readonly opts: { onMark?: (symbol: string, m: MarkUpdate) => void; now?: () => number; tickMs?: number } = {},
  ) {
    for (const s of specs) this.specs.set(s.symbol, s);
  }

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  start(): void {
    this.market.setConnection('CONNECTED');
    this.tick();
    this.timer = setInterval(() => this.tick(), this.opts.tickMs ?? 1000);
    this.timer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
    this.market.setConnection('DISCONNECTED');
  }

  /** One update of every symbol (book, trades, 24h ticker, forming candles, mark). */
  tick(): void {
    const nowMs = this.now();
    const sec = Math.floor(nowMs / 1000);
    const newSecond = sec !== this.lastSec;
    this.lastSec = sec;
    for (const s of this.specs.values()) {
      const d = depth(s, sec);
      this.market.ingestDepth(s.symbol, d.bids, d.asks);
      if (newSecond) {
        let id = this.tradeIds.get(s.symbol) ?? sec * 8;
        for (const tr of trades(s, sec)) this.market.ingestTrade(s.symbol, { id: ++id, price: tr.price, qty: tr.qty, time: nowMs, isBuyerMaker: tr.isBuyerMaker });
        this.tradeIds.set(s.symbol, id);
      }
      this.market.ingestTicker(s.symbol, ticker24h(s, nowMs));
      for (const i of INTERVALS) this.market.ingestCandle(s.symbol, i, candle(s, i, Math.floor(sec / INTERVAL_SEC[i]) * INTERVAL_SEC[i], sec));
      this.opts.onMark?.(s.symbol, markUpdate(s, nowMs));
    }
  }

  /** Candle history for CandleService (charts, sparklines). */
  history(symbol: string, interval: CandleInterval, limit: number, endTime?: number): Candle[] {
    const s = this.specs.get(symbol);
    return s ? history(s, interval, limit, this.now(), endTime) : [];
  }
}
