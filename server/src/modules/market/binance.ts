import WebSocket from 'ws';
import type { Candle, CandleInterval } from '@cex/contracts';
import { CandleInterval as CandleIntervalSchema } from '@cex/contracts';
import { sql } from 'drizzle-orm';
import { candles, symbols } from '../../db/schema.ts';
import type { Db } from '../../db/client.ts';
import { logger } from '../../logger.ts';
import type { MarketDataService } from './marketData.ts';

const INTERVALS = CandleIntervalSchema.options;

// ───────────────────────────── REST

interface BinanceFilter {
  filterType: string;
  tickSize?: string;
  stepSize?: string;
  minQty?: string;
  maxQty?: string;
  minNotional?: string;
}

interface BinanceSymbol {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  filters: BinanceFilter[];
}

/** Upserts trading rules from Binance exchangeInfo. Never touches the admin `enabled` flag. */
export async function syncSymbolsFromBinance(db: Db, restUrl: string, wanted: string[]): Promise<number> {
  const url = `${restUrl}/api/v3/exchangeInfo?symbols=${encodeURIComponent(JSON.stringify(wanted))}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`exchangeInfo HTTP ${res.status}`);
  const data = (await res.json()) as { symbols: BinanceSymbol[] };
  let n = 0;
  for (const s of data.symbols) {
    const f = (t: string) => s.filters.find((x) => x.filterType === t);
    const price = f('PRICE_FILTER');
    const lot = f('LOT_SIZE');
    const notional = f('NOTIONAL') ?? f('MIN_NOTIONAL');
    if (!price?.tickSize || !lot?.stepSize || !lot.minQty || !lot.maxQty || !notional?.minNotional) {
      logger.warn({ symbol: s.symbol }, 'exchangeInfo missing filters; symbol skipped');
      continue;
    }
    const values = {
      symbol: s.symbol,
      baseAsset: s.baseAsset,
      quoteAsset: s.quoteAsset,
      tickSize: price.tickSize,
      stepSize: lot.stepSize,
      minQty: lot.minQty,
      maxQty: lot.maxQty,
      minNotional: notional.minNotional,
      sourceStatus: s.status,
      sortOrder: wanted.indexOf(s.symbol),
    };
    await db
      .insert(symbols)
      .values(values)
      .onConflictDoUpdate({ target: symbols.symbol, set: { ...values, updatedAt: sql`now()` } });
    n++;
  }
  return n;
}

type RawKline = [number, string, string, string, string, string, number, string, number, ...unknown[]];

export function klineToCandle(k: RawKline, now: number): Candle {
  return {
    openTime: k[0],
    open: k[1],
    high: k[2],
    low: k[3],
    close: k[4],
    volume: k[5],
    closeTime: k[6],
    quoteVolume: k[7],
    closed: k[6] < now,
  };
}

export async function fetchKlines(restUrl: string, symbol: string, interval: CandleInterval, limit: number, endTime?: number): Promise<Candle[]> {
  const qs = new URLSearchParams({ symbol, interval, limit: String(limit) });
  if (endTime !== undefined) qs.set('endTime', String(endTime - 1));
  const res = await fetch(`${restUrl}/api/v3/klines?${qs}`);
  if (!res.ok) throw new Error(`klines HTTP ${res.status}`);
  const rows = (await res.json()) as RawKline[];
  const now = Date.now();
  return rows.map((k) => klineToCandle(k, now));
}

// ───────────────────────────── WebSocket stream

interface StreamEnvelope {
  stream: string;
  data: Record<string, unknown>;
}

/**
 * One combined Binance stream for all symbols: 24h ticker, top-20 depth (100ms),
 * aggregated trades and klines for every chart interval.
 * Reconnects with exponential backoff, and proactively every 23h (Binance closes at 24h).
 */
export class BinanceStream {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private stopped = false;
  private rotateTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly wsUrl: string,
    private readonly market: MarketDataService,
    private readonly db: Db,
    private readonly symbolList: string[],
  ) {}

  private url(): string {
    const streams = this.symbolList.flatMap((s) => {
      const l = s.toLowerCase();
      return [`${l}@ticker`, `${l}@depth20@100ms`, `${l}@aggTrade`, ...INTERVALS.map((i) => `${l}@kline_${i}`)];
    });
    return `${this.wsUrl}/stream?streams=${streams.join('/')}`;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.rotateTimer);
    this.ws?.close();
    this.market.setConnection('DISCONNECTED');
  }

  private connect(): void {
    this.market.setConnection('CONNECTING');
    const ws = new WebSocket(this.url());
    this.ws = ws;
    ws.on('open', () => {
      this.attempt = 0;
      this.market.setConnection('CONNECTED');
      logger.info({ symbols: this.symbolList.length }, 'binance stream connected');
      clearTimeout(this.rotateTimer);
      this.rotateTimer = setTimeout(() => ws.close(), 23 * 3600_000);
    });
    ws.on('message', (buf) => {
      try {
        this.handle(JSON.parse(buf.toString()) as StreamEnvelope);
      } catch (err) {
        logger.warn({ err }, 'bad binance message');
      }
    });
    ws.on('error', (err) => logger.warn({ err: err.message }, 'binance stream error'));
    ws.on('close', () => {
      clearTimeout(this.rotateTimer);
      if (this.stopped) return;
      this.market.setConnection('CONNECTING');
      const delay = Math.min(30_000, 1000 * 2 ** this.attempt++);
      logger.warn({ delay }, 'binance stream closed; reconnecting');
      setTimeout(() => this.connect(), delay);
    });
  }

  private handle(msg: StreamEnvelope): void {
    const [sym, kind] = msg.stream.split('@') as [string, string];
    const symbol = sym.toUpperCase();
    const d = msg.data;
    if (kind === 'depth20') {
      this.market.ingestDepth(symbol, d.bids as [string, string][], d.asks as [string, string][]);
    } else if (kind === 'aggTrade') {
      this.market.ingestTrade(symbol, { id: d.a as number, price: d.p as string, qty: d.q as string, time: d.T as number, isBuyerMaker: d.m as boolean });
    } else if (kind === 'ticker') {
      this.market.ingestTicker(symbol, {
        lastPrice: d.c as string,
        openPrice: d.o as string,
        highPrice: d.h as string,
        lowPrice: d.l as string,
        priceChange: d.p as string,
        priceChangePercent: d.P as string,
        volume: d.v as string,
        quoteVolume: d.q as string,
        bestBid: (d.b as string) ?? null,
        bestAsk: (d.a as string) ?? null,
        eventTime: d.E as number,
      });
    } else if (kind.startsWith('kline_')) {
      const k = d.k as { t: number; T: number; i: CandleInterval; o: string; h: string; l: string; c: string; v: string; q: string; n: number; x: boolean };
      const candle: Candle = { openTime: k.t, closeTime: k.T, open: k.o, high: k.h, low: k.l, close: k.c, volume: k.v, quoteVolume: k.q, closed: k.x };
      this.market.ingestCandle(symbol, k.i, candle);
      if (k.x) void this.storeClosed(symbol, k.i, candle, k.n);
    }
  }

  /** Only closed candles are stored; idempotent (PK symbol+interval+openTime). */
  private async storeClosed(symbol: string, interval: CandleInterval, c: Candle, tradeCount: number): Promise<void> {
    try {
      await this.db
        .insert(candles)
        .values({
          symbol,
          interval,
          openTime: new Date(c.openTime),
          closeTime: new Date(c.closeTime),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          quoteVolume: c.quoteVolume,
          tradeCount,
        })
        .onConflictDoNothing();
    } catch (err) {
      logger.error({ err, symbol, interval }, 'failed to store candle');
    }
  }
}
