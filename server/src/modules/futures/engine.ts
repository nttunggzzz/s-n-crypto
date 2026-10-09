import { dec, maxDec, minDec, type Dec } from '@cex/core';
import { logger } from '../../logger.ts';
import type { FuturesMarkService, FundingDue } from './markData.ts';
import type { FuturesService } from './service.ts';

const WINDOW_MS = 200;
const REFRESH_MS = 3000;

/**
 * Drives the futures engine from market events, one task at a time per symbol:
 *  - public trades are batched into [low, high] windows → resting limit fills;
 *  - every mark price update → liquidation and TP/SL checks;
 *  - a funding roll → funding settlement.
 * Only symbols with open positions / resting orders are processed (refreshed from the DB).
 */
export class FuturesEngine {
  private readonly windows = new Map<string, { low: Dec; high: Dec }>();
  private readonly queues = new Map<string, Promise<void>>();
  private readonly markPending = new Set<string>();
  private active = { positions: new Set<string>(), orders: new Set<string>() };
  private flushTimer: NodeJS.Timeout | undefined;
  private refreshTimer: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(
    private readonly service: FuturesService,
    private readonly marks: FuturesMarkService,
  ) {}

  async start(): Promise<void> {
    await this.refresh();
    this.service.market.on('trade', (symbol, t) => {
      if (!this.active.orders.has(symbol)) return;
      const p = dec(t.price);
      const w = this.windows.get(symbol);
      this.windows.set(symbol, w ? { low: minDec(w.low, p), high: maxDec(w.high, p) } : { low: p, high: p });
    });
    this.marks.on('mark', (symbol) => {
      if (!this.active.positions.has(symbol) || this.markPending.has(symbol)) return;
      this.markPending.add(symbol);
      this.enqueue(symbol, async () => {
        this.markPending.delete(symbol);
        await this.service.processMark(symbol);
      });
    });
    this.marks.on('funding', (due: FundingDue) => this.enqueue(due.symbol, () => this.funding(due)));
    // new positions / orders become active immediately
    this.service.events.on('position', (_u, p) => p.status === 'OPEN' && this.active.positions.add(p.symbol));
    this.service.events.on('order', (_u, o) => o.type === 'LIMIT' && (o.status === 'NEW' || o.status === 'PARTIALLY_FILLED') && this.active.orders.add(o.symbol));
    this.flushTimer = setInterval(() => this.flush(), WINDOW_MS);
    this.flushTimer.unref();
    this.refreshTimer = setInterval(() => void this.refresh().catch((err) => logger.warn({ err }, 'futures engine refresh failed')), REFRESH_MS);
    this.refreshTimer.unref();
  }

  stop(): void {
    this.stopped = true;
    clearInterval(this.flushTimer);
    clearInterval(this.refreshTimer);
  }

  /** Test hook: process everything pending now and wait for it. */
  async drain(): Promise<void> {
    this.flush();
    await Promise.all([...this.queues.values()]);
  }

  private async refresh(): Promise<void> {
    this.active = await this.service.activeSymbols();
  }

  private flush(): void {
    for (const [symbol, w] of this.windows) {
      this.windows.delete(symbol);
      this.enqueue(symbol, async () => {
        await this.service.fillResting(symbol, w.low, w.high);
      });
    }
  }

  private async funding(due: FundingDue): Promise<void> {
    const n = await this.service.settleFunding(due.symbol, new Date(due.fundingTime), due.rate, due.markPrice);
    if (n > 0) logger.info({ symbol: due.symbol, rate: due.rate, positions: n }, 'funding settled');
    await this.service.processMark(due.symbol); // funding may push a position to liquidation
  }

  private enqueue(symbol: string, task: () => Promise<void>): void {
    if (this.stopped) return;
    const prev = this.queues.get(symbol) ?? Promise.resolve();
    const next = prev
      .then(task)
      .catch((err) => logger.error({ err, symbol }, 'futures engine task failed'))
      .finally(() => {
        if (this.queues.get(symbol) === next) this.queues.delete(symbol);
      });
    this.queues.set(symbol, next);
  }
}
