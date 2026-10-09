import { dec, maxDec, minDec, type Dec } from '@cex/core';
import type { MarketTrade } from '@cex/contracts';
import { logger } from '../../logger.ts';
import type { MarketDataService } from '../market/marketData.ts';
import type { ExchangeConfig } from './exchangeConfig.ts';
import type { OpenOrderIndex } from './openOrderIndex.ts';
import { trailingStopPrice, type OrderService } from './orderService.ts';
import type { AlertService } from './alertService.ts';

interface Window {
  low: Dec;
  high: Dec;
  lastTime: number;
}

export interface WindowResult {
  triggered: number;
  filled: number;
  alerts: number;
}

/**
 * Reacts to Binance trades: moves trailing stops, triggers stops, fills crossed limits, fires alerts.
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
    private readonly alerts: AlertService,
  ) {}

  /** Wire to MarketDataService 'trade' events. */
  attach(): void {
    this.market.on('trade', (symbol, trade) => this.onTrade(symbol, trade));
  }

  stop(): void {
    this.stopped = true;
  }

  onTrade(symbol: string, trade: MarketTrade): void {
    if (this.stopped || (this.index.size(symbol) === 0 && this.alerts.size(symbol) === 0)) return;
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

  /**
   * One batch for trades whose prices spanned [low, high]:
   *  1. trailing stops: trigger against the level in force at the window start, then move it
   *     (the order of prices inside a window is unknown, so a level raised by this window's high
   *     is only checked from the next window on);
   *  2. stops reached; 3. limits crossed (strictly); 4. price alerts.
   */
  async processWindow(symbol: string, low: Dec, high: Dec, eventAt: Date): Promise<WindowResult> {
    const result: WindowResult = { triggered: 0, filled: 0, alerts: 0 };
    if (!this.market.isLive(symbol)) return result;
    result.alerts = await this.alerts.processWindow(symbol, low, high, eventAt).catch((err) => {
      logger.error({ err, symbol }, 'alert batch failed');
      return 0;
    });
    if (this.config.tradingHalted) return result;
    const sym = this.config.findSymbol(symbol);
    if (!sym || !sym.row.enabled) return result;

    const guard = async (id: number, what: string, fn: () => Promise<unknown>) => {
      try {
        return await fn();
      } catch (err) {
        // Stays in the index and is retried on the next window.
        logger.error({ err, orderId: id, symbol }, `failed to ${what}`);
        return null;
      }
    };

    for (const t of this.index.trailing(symbol)) {
      const crossed = t.stopPrice && (t.side === 'SELL' ? low.lte(t.stopPrice) : high.gte(t.stopPrice));
      if (crossed) {
        if (await guard(t.id, 'trigger trailing stop', () => this.orders.triggerStop(t.id, t.side === 'SELL' ? low : high, eventAt))) result.triggered++;
        continue;
      }
      let reference = t.reference;
      if (reference === null) {
        // Not active yet: SELL activates when the price rises to activationPrice, BUY when it falls to it.
        const reached = t.activationPrice && (t.side === 'SELL' ? high.gte(t.activationPrice) : low.lte(t.activationPrice));
        if (!reached) continue;
        reference = t.side === 'SELL' ? high : low;
      } else {
        reference = t.side === 'SELL' ? maxDec(reference, high) : minDec(reference, low);
      }
      if (t.reference && reference.eq(t.reference)) continue;
      const stop = trailingStopPrice(t.side, reference, t.deltaBips, sym.tick);
      await guard(t.id, 'move trailing stop', () => this.orders.updateTrailing(t.id, reference, stop));
    }

    for (const s of this.index.reachedStops(symbol, low, high)) {
      if (await guard(s.id, 'trigger stop', () => this.orders.triggerStop(s.id, s.direction === 'UP' ? high : low, eventAt))) result.triggered++;
    }

    for (const id of this.index.crossingLimits(symbol, low, high)) {
      const r = await guard(id, 'fill resting order', () => this.orders.fillResting(id, eventAt));
      if (r) result.filled++;
    }
    return result;
  }
}
