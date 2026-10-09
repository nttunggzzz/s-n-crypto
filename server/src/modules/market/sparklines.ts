import type { CandleInterval, Sparkline, SparklineRange, Sparklines } from '@cex/contracts';
import { dec } from '@cex/core';
import type { CandleService } from './candleService.ts';
import type { MarketDataService } from './marketData.ts';

const SPEC: Record<SparklineRange, { interval: CandleInterval; points: number }> = {
  '24h': { interval: '1h', points: 25 },
  '7d': { interval: '4h', points: 43 },
};
const CACHE_MS = 60_000;
const CONCURRENCY = 8;

/**
 * Mini charts for market lists: the close of the last N candles per symbol (the last one is the
 * forming candle). Built from CandleService (Binance REST, falling back to stored candles) and
 * cached for a minute, so the cost is one klines call per symbol per minute per range.
 */
export class SparklineService {
  private readonly cache = new Map<SparklineRange, { at: number; data: Sparklines }>();
  private readonly inflight = new Map<SparklineRange, Promise<Sparklines>>();

  constructor(
    private readonly candles: CandleService,
    private readonly market: MarketDataService,
    private readonly symbols: () => string[],
    private readonly now: () => number = Date.now,
  ) {}

  async get(range: SparklineRange): Promise<Sparklines> {
    const hit = this.cache.get(range);
    if (hit && this.now() - hit.at < CACHE_MS) return hit.data;
    let p = this.inflight.get(range);
    if (!p) {
      p = this.build(range).finally(() => this.inflight.delete(range));
      this.inflight.set(range, p);
    }
    return p;
  }

  private async build(range: SparklineRange): Promise<Sparklines> {
    const { interval, points } = SPEC[range];
    const list = this.symbols();
    const items: Sparkline[] = new Array(list.length);
    let next = 0;
    const worker = async () => {
      while (next < list.length) {
        const i = next++;
        items[i] = await this.one(list[i]!, interval, points);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
    const data: Sparklines = { range, interval, items, updatedAt: new Date(this.now()).toISOString() };
    this.cache.set(range, { at: this.now(), data });
    return data;
  }

  private async one(symbol: string, interval: CandleInterval, n: number): Promise<Sparkline> {
    try {
      const rows = await this.candles.get(symbol, interval, n);
      if (rows.length === 0) return { symbol, points: [], status: 'UNAVAILABLE' };
      // Points exist but the live feed is down → the last point may be old: STALE, not LIVE.
      return { symbol, points: rows.map((c) => dec(c.close).toFixed()), status: this.market.isLive(symbol) ? 'LIVE' : 'STALE' };
    } catch {
      return { symbol, points: [], status: 'UNAVAILABLE' };
    }
  }
}
