import { and, desc, eq, lt } from 'drizzle-orm';
import type { Candle, CandleInterval } from '@cex/contracts';
import { dec } from '@cex/core';
import { candles } from '../../db/schema.ts';
import type { Db } from '../../db/client.ts';
import { logger } from '../../logger.ts';
import { fetchKlines } from './binance.ts';

const CACHE_MS = 2000;

export type CandleHistory = (symbol: string, interval: CandleInterval, limit: number, endTime?: number) => Candle[];

/**
 * Candle history for charts: Binance REST (short cache), falling back to the closed candles
 * we stored ourselves if Binance is unreachable.
 */
export class CandleService {
  private readonly cache = new Map<string, { at: number; items: Candle[] }>();

  constructor(
    private readonly db: Db,
    private readonly restUrl: string | null,
    /**
     * Futures: { path: '/fapi/v1/klines', storedFallback: false } (we only store spot candles).
     * `history`: MARKET_FEED=sim — candles come from the synthetic model instead.
     */
    private readonly opts: { path?: string; storedFallback?: boolean; history?: CandleHistory } = {},
  ) {}

  async get(symbol: string, interval: CandleInterval, limit: number, endTime?: number): Promise<Candle[]> {
    if (this.opts.history) return this.opts.history(symbol, interval, limit, endTime);
    if (this.restUrl) {
      const key = `${symbol}|${interval}|${limit}|${endTime ?? ''}`;
      const hit = this.cache.get(key);
      if (hit && Date.now() - hit.at < CACHE_MS) return hit.items;
      try {
        const items = await fetchKlines(this.restUrl, symbol, interval, limit, endTime, this.opts.path);
        this.cache.set(key, { at: Date.now(), items });
        if (this.cache.size > 500) this.cache.clear();
        return items;
      } catch (err) {
        logger.warn({ err, symbol, interval }, 'binance klines failed; serving stored candles');
      }
    }
    if (this.opts.storedFallback === false) return [];
    return this.fromDb(symbol, interval, limit, endTime);
  }

  private async fromDb(symbol: string, interval: CandleInterval, limit: number, endTime?: number): Promise<Candle[]> {
    const where = [eq(candles.symbol, symbol), eq(candles.interval, interval)];
    if (endTime !== undefined) where.push(lt(candles.openTime, new Date(endTime)));
    const rows = await this.db
      .select()
      .from(candles)
      .where(and(...where))
      .orderBy(desc(candles.openTime))
      .limit(limit);
    const f = (s: string) => dec(s).toFixed();
    return rows.reverse().map((r) => ({
      openTime: r.openTime.getTime(),
      closeTime: r.closeTime.getTime(),
      open: f(r.open),
      high: f(r.high),
      low: f(r.low),
      close: f(r.close),
      volume: f(r.volume),
      quoteVolume: f(r.quoteVolume),
      closed: true,
    }));
  }
}
