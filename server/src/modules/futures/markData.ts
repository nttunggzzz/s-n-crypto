import { EventEmitter } from 'node:events';
import type { DataStatus, MarkPrice } from '@cex/contracts';
import { dec, type Dec } from '@cex/core';
import type { MarkUpdate } from '../market/binance.ts';

interface MarkState extends MarkUpdate {
  mark: Dec;
  receivedAt: number;
}

export interface FundingDue {
  symbol: string;
  /** The settlement time that just passed (ms). */
  fundingTime: number;
  /** The rate announced for it (the last one received before it passed). */
  rate: string;
  /** Mark price at settlement (first update after it). */
  markPrice: string;
}

/**
 * Mark price, index price and funding of every futures contract (Binance markPrice@1s).
 * LIVE/STALE like the market data: liquidations, TP/SL and new orders need a LIVE mark.
 * Emits `funding` when Binance rolls `nextFundingTime` forward — that is the settlement moment.
 */
export class FuturesMarkService extends EventEmitter<{ mark: [symbol: string]; funding: [due: FundingDue] }> {
  private readonly state = new Map<string, MarkState>();

  constructor(
    private readonly staleThresholdMs: () => number,
    private readonly now: () => number = Date.now,
  ) {
    super();
  }

  ingest(symbol: string, m: MarkUpdate, receivedAt = this.now()): void {
    const prev = this.state.get(symbol);
    this.state.set(symbol, { ...m, mark: dec(m.markPrice), receivedAt });
    if (prev && m.nextFundingTime > prev.nextFundingTime && receivedAt >= prev.nextFundingTime) {
      this.emit('funding', { symbol, fundingTime: prev.nextFundingTime, rate: prev.fundingRate, markPrice: m.markPrice });
    }
    this.emit('mark', symbol);
  }

  status(symbol: string): DataStatus {
    const s = this.state.get(symbol);
    if (!s) return 'UNAVAILABLE';
    return this.now() - s.receivedAt > this.staleThresholdMs() ? 'STALE' : 'LIVE';
  }

  /** Mark price if LIVE, else null (never a stale or guessed price). */
  liveMark(symbol: string): Dec | null {
    return this.status(symbol) === 'LIVE' ? this.state.get(symbol)!.mark : null;
  }

  get(symbol: string): MarkPrice {
    const s = this.state.get(symbol);
    if (!s) return { symbol, markPrice: null, indexPrice: null, fundingRate: null, nextFundingTime: null, status: 'UNAVAILABLE', updatedAt: null };
    return {
      symbol,
      markPrice: s.markPrice,
      indexPrice: s.indexPrice,
      fundingRate: s.fundingRate,
      nextFundingTime: new Date(s.nextFundingTime).toISOString(),
      status: this.status(symbol),
      updatedAt: new Date(s.eventTime).toISOString(),
    };
  }
}
