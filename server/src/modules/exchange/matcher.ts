import { dec, maxDec, minDec, type Dec } from '@cex/core';
import type { MarketTrade } from '@cex/contracts';
import { logger } from '../../logger.ts';
import type { MarketDataService } from '../market/marketData.ts';
import type { ExchangeConfig } from './exchangeConfig.ts';
import type { OpenOrderIndex } from './openOrderIndex.ts';
import type { OrderService } from './orderService.ts';

interface Window {
  low: Dec;
  high: Dec;
  lastTime: number;
}

/**
 * Fills resting LIMIT orders when Binance trades cross their price.
 *
 * Exactly one Matcher runs (single server instance). Work is serialized per symbol, and
 * market trades arriving while a batch runs are merged into a [low, high] window, so no
 * crossing is missed and the DB is not hit once per Binance trade.
 */
export class Matcher {
  private readonly pending = new Map<string, Window>();
  private readonly running = new Map<string, Promise<void>>();
  private stopped = false;

  constructor(
    private readonly orders: OrderService,
    private readonly index: OpenOrderIndex,
    private readonly market: MarketDataService,
    private readonly config: ExchangeConfig,
  ) {}

  /** Wire to MarketDataService 'trade' events. */
  attach(): void {
    this.market.on('trade', (symbol, trade) => this.onTrade(symbol, trade));
  }

  stop(): void {
    this.stopped = true;
  }

  onTrade(symbol: string, trade: MarketTrade): void {
    if (this.stopped || this.index.size(symbol) === 0) return;
    const p = dec(trade.price);
    const w = this.pending.get(symbol);
    this.pending.set(symbol, w ? { low: minDec(w.low, p), high: maxDec(w.high, p), lastTime: Math.max(w.lastTime, trade.time) } : { low: p, high: p, lastTime: trade.time });
    if (!this.running.has(symbol)) this.drain(symbol);
  }

  /** Resolves when all pending work for the symbol is done (tests). */
  async idle(symbol: string): Promise<void> {
    while (this.running.has(symbol)) await this.running.get(symbol);
  }

  private drain(symbol: string): void {
    const run = (async () => {
      while (!this.stopped) {
        const w = this.pending.get(symbol);
        if (!w) break;
        this.pending.delete(symbol);
        await this.processWindow(symbol, w.low, w.high, new Date(w.lastTime));
      }
    })()
      .catch((err) => logger.error({ err, symbol }, 'matcher batch failed'))
      .finally(() => this.running.delete(symbol));
    this.running.set(symbol, run);
  }

  /** Fills every open order crossed by prices in [low, high]. Returns the number of filled orders. */
  async processWindow(symbol: string, low: Dec, high: Dec, eventAt: Date): Promise<number> {
    if (this.config.tradingHalted) return 0;
    const sym = this.config.findSymbol(symbol);
    if (!sym || !sym.row.enabled) return 0;
    if (!this.market.isLive(symbol)) return 0;
    let filled = 0;
    for (const id of this.index.crossing(symbol, low, high)) {
      try {
        const r = await this.orders.fillResting(id, eventAt);
        if (r) filled++;
        else this.index.remove(symbol, id); // no longer open
      } catch (err) {
        // Keep it in the index: it will be retried on the next crossing trade.
        logger.error({ err, orderId: id, symbol }, 'failed to fill resting order');
      }
    }
    return filled;
  }
}
