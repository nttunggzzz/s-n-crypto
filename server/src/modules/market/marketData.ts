import { EventEmitter } from 'node:events';
import type { Candle, CandleInterval, DataStatus, Depth, MarketStatus, MarketTrade, Ticker } from '@cex/contracts';
import { dec, type BookLevel, type Dec } from '@cex/core';

type RawLevel = [string, string];

export interface TickerInput {
  lastPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  priceChange: string;
  priceChangePercent: string;
  volume: string;
  quoteVolume: string;
  bestBid: string | null;
  bestAsk: string | null;
  eventTime: number;
}

interface SymbolState {
  bids: RawLevel[];
  asks: RawLevel[];
  bidLevels: BookLevel[];
  askLevels: BookLevel[];
  depthAt: number | null;
  ticker: TickerInput | null;
  lastTrade: { price: Dec; raw: string; time: number } | null;
  trades: MarketTrade[];
  candles: Map<CandleInterval, Candle>;
  status: DataStatus;
}

export type Connection = MarketStatus['connection'];

export interface MarketDataEvents {
  trade: [symbol: string, trade: MarketTrade];
  depth: [symbol: string];
  ticker: [symbol: string];
  candle: [symbol: string, interval: CandleInterval, candle: Candle];
  status: [];
}

const MAX_TRADES = 100;

/**
 * In-memory view of the external market (Binance), fed by a data source adapter.
 * Matching and order validation read from here; nothing here is ever invented —
 * a value we have not received is null and the symbol is UNAVAILABLE/STALE.
 */
export class MarketDataService extends EventEmitter<MarketDataEvents> {
  private readonly state = new Map<string, SymbolState>();
  private timer: NodeJS.Timeout | undefined;
  connection: Connection = 'DISCONNECTED';

  constructor(
    symbols: string[],
    private readonly staleThresholdMs: () => number,
    private readonly now: () => number = Date.now,
  ) {
    super();
    for (const s of symbols) this.ensure(s);
  }

  get symbols(): string[] {
    return [...this.state.keys()];
  }

  private ensure(symbol: string): SymbolState {
    let s = this.state.get(symbol);
    if (!s) {
      s = { bids: [], asks: [], bidLevels: [], askLevels: [], depthAt: null, ticker: null, lastTrade: null, trades: [], candles: new Map(), status: 'UNAVAILABLE' };
      this.state.set(symbol, s);
    }
    return s;
  }

  // ───────── ingestion (called by the data source adapter)

  setConnection(c: Connection): void {
    if (this.connection !== c) {
      this.connection = c;
      this.emit('status');
    }
  }

  ingestDepth(symbol: string, bids: RawLevel[], asks: RawLevel[], receivedAt = this.now()): void {
    const s = this.ensure(symbol);
    s.bids = bids;
    s.asks = asks;
    s.bidLevels = bids.map(([p, q]) => ({ price: dec(p), qty: dec(q) }));
    s.askLevels = asks.map(([p, q]) => ({ price: dec(p), qty: dec(q) }));
    s.depthAt = receivedAt;
    this.refreshStatus(symbol);
    this.emit('depth', symbol);
  }

  ingestTicker(symbol: string, t: TickerInput): void {
    this.ensure(symbol).ticker = t;
    this.emit('ticker', symbol);
  }

  ingestTrade(symbol: string, trade: MarketTrade): void {
    const s = this.ensure(symbol);
    s.lastTrade = { price: dec(trade.price), raw: trade.price, time: trade.time };
    s.trades.unshift(trade);
    if (s.trades.length > MAX_TRADES) s.trades.length = MAX_TRADES;
    this.emit('trade', symbol, trade);
  }

  ingestCandle(symbol: string, interval: CandleInterval, candle: Candle): void {
    this.ensure(symbol).candles.set(interval, candle);
    this.emit('candle', symbol, interval, candle);
  }

  // ───────── freshness

  /** Re-evaluates LIVE/STALE for every symbol; emits `status` when anything changed. */
  checkStaleness(): void {
    let changed = false;
    for (const symbol of this.state.keys()) changed = this.refreshStatus(symbol, false) || changed;
    if (changed) this.emit('status');
  }

  private refreshStatus(symbol: string, emit = true): boolean {
    const s = this.ensure(symbol);
    const next: DataStatus = s.depthAt === null ? 'UNAVAILABLE' : this.now() - s.depthAt > this.staleThresholdMs() ? 'STALE' : 'LIVE';
    if (next === s.status) return false;
    s.status = next;
    if (emit) this.emit('status');
    return true;
  }

  startStalenessTimer(intervalMs = 1000): void {
    this.stopStalenessTimer();
    this.timer = setInterval(() => this.checkStaleness(), intervalMs);
    this.timer.unref();
  }

  stopStalenessTimer(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Status as of now (re-evaluated, not cached). */
  getStatus(symbol: string): DataStatus {
    const s = this.state.get(symbol);
    if (!s) return 'UNAVAILABLE';
    this.refreshStatus(symbol);
    return s.status;
  }

  isLive(symbol: string): boolean {
    return this.getStatus(symbol) === 'LIVE';
  }

  // ───────── reads used by the exchange

  bookSide(symbol: string, side: 'BUY' | 'SELL'): readonly BookLevel[] {
    const s = this.state.get(symbol);
    if (!s) return [];
    return side === 'BUY' ? s.askLevels : s.bidLevels;
  }

  bestBid(symbol: string): Dec | null {
    return this.state.get(symbol)?.bidLevels[0]?.price ?? null;
  }

  bestAsk(symbol: string): Dec | null {
    return this.state.get(symbol)?.askLevels[0]?.price ?? null;
  }

  /** Last trade price if LIVE, else null (used for valuation). */
  livePrice(symbol: string): Dec | null {
    if (!this.isLive(symbol)) return null;
    return this.state.get(symbol)?.lastTrade?.price ?? null;
  }

  // ───────── reads for the API (contract shapes)

  getTicker(symbol: string): Ticker {
    const s = this.ensure(symbol);
    const t = s.ticker;
    return {
      symbol,
      lastPrice: s.lastTrade?.raw ?? t?.lastPrice ?? null,
      openPrice: t?.openPrice ?? null,
      highPrice: t?.highPrice ?? null,
      lowPrice: t?.lowPrice ?? null,
      priceChange: t?.priceChange ?? null,
      priceChangePercent: t?.priceChangePercent ?? null,
      volume: t?.volume ?? null,
      quoteVolume: t?.quoteVolume ?? null,
      bestBid: s.bids[0]?.[0] ?? t?.bestBid ?? null,
      bestAsk: s.asks[0]?.[0] ?? t?.bestAsk ?? null,
      status: this.getStatus(symbol),
      updatedAt: t ? new Date(t.eventTime).toISOString() : null,
    };
  }

  getDepth(symbol: string, limit = 20): Depth {
    const s = this.ensure(symbol);
    return {
      symbol,
      bids: s.bids.slice(0, limit),
      asks: s.asks.slice(0, limit),
      status: this.getStatus(symbol),
      updatedAt: s.depthAt ? new Date(s.depthAt).toISOString() : null,
    };
  }

  getTrades(symbol: string, limit = 50): MarketTrade[] {
    return this.ensure(symbol).trades.slice(0, limit);
  }

  getFormingCandle(symbol: string, interval: CandleInterval): Candle | null {
    return this.state.get(symbol)?.candles.get(interval) ?? null;
  }

  getMarketStatus(): MarketStatus {
    return {
      connection: this.connection,
      staleThresholdMs: this.staleThresholdMs(),
      symbols: this.symbols.map((symbol) => {
        const s = this.ensure(symbol);
        return { symbol, status: this.getStatus(symbol), lastUpdateAt: s.depthAt ? new Date(s.depthAt).toISOString() : null };
      }),
    };
  }
}
