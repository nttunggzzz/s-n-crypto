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

async function fetchExchangeInfo(restUrl: string, wanted: string[]): Promise<BinanceSymbol[]> {
  const res = await fetch(`${restUrl}/api/v3/exchangeInfo?symbols=${encodeURIComponent(JSON.stringify(wanted))}`);
  if (res.ok) return ((await res.json()) as { symbols: BinanceSymbol[] }).symbols;
  // One unknown symbol (delisted / renamed) fails the whole filtered request: load all and pick.
  if (res.status !== 400) throw new Error(`exchangeInfo HTTP ${res.status}`);
  const all = await fetch(`${restUrl}/api/v3/exchangeInfo?permissions=SPOT`);
  if (!all.ok) throw new Error(`exchangeInfo HTTP ${all.status}`);
  const set = new Set(wanted);
  return ((await all.json()) as { symbols: BinanceSymbol[] }).symbols.filter((x) => set.has(x.symbol));
}

/** Upserts trading rules from Binance exchangeInfo. Never touches the admin `enabled` flag. */
export async function syncSymbolsFromBinance(db: Db, restUrl: string, wanted: string[]): Promise<number> {
  const found = await fetchExchangeInfo(restUrl, wanted);
  const missing = wanted.filter((w) => !found.some((f) => f.symbol === w));
  if (missing.length) logger.warn({ missing }, 'symbols not found on Binance; skipped');
  let n = 0;
  for (const s of found) {
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

/** Binance allows 1024 streams per connection; we stay well below to spread the load. */
const STREAMS_PER_CONNECTION = 300;
/** Params per SUBSCRIBE message; Binance accepts at most 5 incoming messages per second. */
const SUBSCRIBE_BATCH = 100;
const SUBSCRIBE_GAP_MS = 250;

export function streamsFor(symbol: string): string[] {
  const l = symbol.toLowerCase();
  return [`${l}@ticker`, `${l}@depth20@100ms`, `${l}@aggTrade`, ...INTERVALS.map((i) => `${l}@kline_${i}`)];
}

/** Splits symbols into connections; a symbol's streams always share one connection. */
export function planConnections(symbols: string[], perConnection = STREAMS_PER_CONNECTION): string[][] {
  const groups: string[][] = [];
  let cur: string[] = [];
  let count = 0;
  for (const s of symbols) {
    const n = streamsFor(s).length;
    if (cur.length && count + n > perConnection) {
      groups.push(cur);
      cur = [];
      count = 0;
    }
    cur.push(s);
    count += n;
  }
  if (cur.length) groups.push(cur);
  return groups;
}

/**
 * Binance market streams for all symbols (24h ticker, top-20 depth at 100ms, aggregated trades,
 * klines for every chart interval), over as many connections as needed. Each connection
 * subscribes with SUBSCRIBE messages, reconnects with exponential backoff, and rotates every
 * 23h (Binance closes at 24h). If one connection drops only its symbols go STALE.
 */
export class BinanceStream {
  private readonly conns: StreamConnection[];

  constructor(
    wsUrl: string,
    private readonly market: MarketDataService,
    db: Db,
    symbolList: string[],
  ) {
    const handle = (msg: StreamEnvelope) => this.handle(msg, db);
    this.conns = planConnections(symbolList).map((group, i) => new StreamConnection(i, wsUrl, group, handle, () => this.refreshConnection()));
  }

  start(): void {
    for (const c of this.conns) c.start();
  }

  stop(): void {
    for (const c of this.conns) c.stop();
    this.market.setConnection('DISCONNECTED');
  }

  private refreshConnection(): void {
    const states = this.conns.map((c) => c.state);
    this.market.setConnection(states.every((s) => s === 'CONNECTED') ? 'CONNECTED' : states.every((s) => s === 'DISCONNECTED') ? 'DISCONNECTED' : 'CONNECTING');
  }

  private handle(msg: StreamEnvelope, db: Db): void {
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
      if (k.x) void storeClosed(db, symbol, k.i, candle, k.n);
    }
  }
}

/** Only closed candles are stored; idempotent (PK symbol+interval+openTime). */
async function storeClosed(db: Db, symbol: string, interval: CandleInterval, c: Candle, tradeCount: number): Promise<void> {
  try {
    await db
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

type ConnState = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED';

class StreamConnection {
  state: ConnState = 'DISCONNECTED';
  private ws: WebSocket | null = null;
  private attempt = 0;
  private stopped = false;
  private rotateTimer: NodeJS.Timeout | undefined;
  private subTimers: NodeJS.Timeout[] = [];

  constructor(
    private readonly index: number,
    private readonly wsUrl: string,
    private readonly symbols: string[],
    private readonly onMessage: (msg: StreamEnvelope) => void,
    private readonly onState: () => void,
  ) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    this.ws?.close();
    this.setState('DISCONNECTED');
  }

  private setState(s: ConnState): void {
    this.state = s;
    this.onState();
  }

  private clearTimers(): void {
    clearTimeout(this.rotateTimer);
    for (const t of this.subTimers) clearTimeout(t);
    this.subTimers = [];
  }

  private connect(): void {
    this.setState('CONNECTING');
    const ws = new WebSocket(`${this.wsUrl}/stream`);
    this.ws = ws;
    ws.on('open', () => {
      this.attempt = 0;
      const streams = this.symbols.flatMap(streamsFor);
      for (let i = 0; i * SUBSCRIBE_BATCH < streams.length; i++) {
        const params = streams.slice(i * SUBSCRIBE_BATCH, (i + 1) * SUBSCRIBE_BATCH);
        this.subTimers.push(setTimeout(() => ws.readyState === ws.OPEN && ws.send(JSON.stringify({ method: 'SUBSCRIBE', params, id: i + 1 })), i * SUBSCRIBE_GAP_MS));
      }
      this.setState('CONNECTED');
      logger.info({ connection: this.index, symbols: this.symbols.length, streams: streams.length }, 'binance stream connected');
      clearTimeout(this.rotateTimer);
      this.rotateTimer = setTimeout(() => ws.close(), 23 * 3600_000);
    });
    ws.on('message', (buf) => {
      try {
        const msg = JSON.parse(buf.toString()) as StreamEnvelope & { result?: unknown; error?: unknown };
        if (msg.stream) this.onMessage(msg);
        else if (msg.error) logger.error({ connection: this.index, error: msg.error }, 'binance subscribe failed');
      } catch (err) {
        logger.warn({ err }, 'bad binance message');
      }
    });
    ws.on('error', (err) => logger.warn({ connection: this.index, err: err.message }, 'binance stream error'));
    ws.on('close', () => {
      this.clearTimers();
      if (this.stopped) return;
      this.setState('CONNECTING');
      const delay = Math.min(30_000, 1000 * 2 ** this.attempt++);
      logger.warn({ connection: this.index, delay }, 'binance stream closed; reconnecting');
      setTimeout(() => this.connect(), delay);
    });
  }
}
