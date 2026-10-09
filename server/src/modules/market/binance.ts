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

/** `path`: /api/v3/klines (spot) or /fapi/v1/klines (USDⓈ-M futures) — same response format. */
export async function fetchKlines(restUrl: string, symbol: string, interval: CandleInterval, limit: number, endTime?: number, path = '/api/v3/klines'): Promise<Candle[]> {
  const qs = new URLSearchParams({ symbol, interval, limit: String(limit) });
  if (endTime !== undefined) qs.set('endTime', String(endTime - 1));
  const res = await fetch(`${restUrl}${path}?${qs}`);
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

/** Streams per connection: Binance allows 1024 (spot) and 200 (USDⓈ-M futures); we stay below. */
const STREAMS_PER_CONNECTION = { spot: 300, futures: 190 } as const;
export type StreamKind = keyof typeof STREAMS_PER_CONNECTION;

export interface MarkUpdate {
  markPrice: string;
  indexPrice: string;
  fundingRate: string;
  nextFundingTime: number;
  eventTime: number;
}
/** Params per SUBSCRIBE message; Binance accepts at most 5 incoming messages per second. */
const SUBSCRIBE_BATCH = 100;
const SUBSCRIBE_GAP_MS = 250;

export function streamsFor(symbol: string, kind: StreamKind = 'spot'): string[] {
  const l = symbol.toLowerCase();
  const base = [`${l}@ticker`, `${l}@depth20@100ms`, `${l}@aggTrade`, ...INTERVALS.map((i) => `${l}@kline_${i}`)];
  return kind === 'futures' ? [...base, `${l}@markPrice@1s`] : base;
}

/**
 * Endpoint of a stream. Spot: /stream. USDⓈ-M futures (Binance split them in 2026): order books on
 * /public/stream, everything else (trades, mark price, ticker, klines) on /market/stream — the old
 * /stream only serves order books any more.
 */
export function endpointFor(stream: string, kind: StreamKind): string {
  if (kind === 'spot') return '/stream';
  return stream.includes('@depth') ? '/public/stream' : '/market/stream';
}

export interface ConnectionPlan {
  path: string;
  symbols: string[];
  streams: string[];
}

/** Splits streams into connections per endpoint; within an endpoint a symbol's streams share one connection. */
export function planConnections(symbols: string[], kind: StreamKind = 'spot', perConnection: number = STREAMS_PER_CONNECTION[kind]): ConnectionPlan[] {
  const byPath = new Map<string, Map<string, string[]>>();
  for (const s of symbols) {
    for (const stream of streamsFor(s, kind)) {
      const path = endpointFor(stream, kind);
      const m = byPath.get(path) ?? new Map<string, string[]>();
      byPath.set(path, m);
      m.set(s, [...(m.get(s) ?? []), stream]);
    }
  }
  const plans: ConnectionPlan[] = [];
  for (const [path, bySymbol] of byPath) {
    let cur: ConnectionPlan = { path, symbols: [], streams: [] };
    for (const [s, streams] of bySymbol) {
      if (cur.symbols.length && cur.streams.length + streams.length > perConnection) {
        plans.push(cur);
        cur = { path, symbols: [], streams: [] };
      }
      cur.symbols.push(s);
      cur.streams.push(...streams);
    }
    if (cur.symbols.length) plans.push(cur);
  }
  return plans;
}

export interface StreamOptions {
  /** spot (default) or USDⓈ-M futures (adds markPrice@1s, smaller connections). */
  kind?: StreamKind;
  /** Closed candles are stored for spot only (the signal engine reads them); null = don't store. */
  db?: Db | null;
  onMark?: (symbol: string, m: MarkUpdate) => void;
}

/**
 * Binance market streams for all symbols (24h ticker, top-20 depth at 100ms, aggregated trades,
 * klines for every chart interval; futures also mark price + funding), over as many connections as
 * needed. Each connection subscribes with SUBSCRIBE messages, reconnects with exponential backoff,
 * and rotates every 23h (Binance closes at 24h). If one connection drops only its symbols go STALE.
 */
export class BinanceStream {
  private readonly conns: StreamConnection[];
  private readonly kind: StreamKind;

  constructor(
    wsUrl: string,
    private readonly market: MarketDataService,
    symbolList: string[],
    private readonly opts: StreamOptions = {},
  ) {
    this.kind = opts.kind ?? 'spot';
    const handle = (msg: StreamEnvelope) => this.handle(msg);
    this.conns = planConnections(symbolList, this.kind).map((plan, i) => new StreamConnection(`${this.kind}#${i}${plan.path}`, `${wsUrl}${plan.path}`, plan.streams, handle, () => this.refreshConnection()));
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

  private handle(msg: StreamEnvelope): void {
    const [sym, kind] = msg.stream.split('@') as [string, string];
    const symbol = sym.toUpperCase();
    const d = msg.data;
    if (kind === 'depth20') {
      // spot partial depth: bids/asks · futures: b/a
      this.market.ingestDepth(symbol, (d.bids ?? d.b) as [string, string][], (d.asks ?? d.a) as [string, string][]);
    } else if (kind === 'markPrice') {
      this.opts.onMark?.(symbol, { markPrice: d.p as string, indexPrice: d.i as string, fundingRate: d.r as string, nextFundingTime: d.T as number, eventTime: d.E as number });
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
      if (k.x && this.opts.db) void storeClosed(this.opts.db, symbol, k.i, candle, k.n);
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
    private readonly index: string,
    /** Full endpoint URL, e.g. wss://stream.binance.com:9443/stream */
    private readonly url: string,
    private readonly streams: string[],
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
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.on('open', () => {
      this.attempt = 0;
      const streams = this.streams;
      for (let i = 0; i * SUBSCRIBE_BATCH < streams.length; i++) {
        const params = streams.slice(i * SUBSCRIBE_BATCH, (i + 1) * SUBSCRIBE_BATCH);
        this.subTimers.push(setTimeout(() => ws.readyState === ws.OPEN && ws.send(JSON.stringify({ method: 'SUBSCRIBE', params, id: i + 1 })), i * SUBSCRIBE_GAP_MS));
      }
      this.setState('CONNECTED');
      logger.info({ connection: this.index, streams: streams.length }, 'binance stream connected');
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
