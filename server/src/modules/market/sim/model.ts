import type { Candle, CandleInterval } from '@cex/contracts';
import { dec, floorToStep, type Dec } from '@cex/core';
import type { TickerInput } from '../marketData.ts';

/**
 * Synthetic market for MARKET_FEED=sim (offline dev, end-to-end tests, CI — Binance blocks US cloud IPs).
 * The price is a deterministic function of time per symbol: weekly, daily, hourly, 5-minute and ~40-second
 * waves + per-second noise around a reference price. Candles (history and forming), the 24h ticker, the
 * order book and trades are all derived from that one function, so they always agree with each other —
 * and nothing has to be stored. Only the pair rules (tick, step, min/max) are real (snapshot.json).
 */

export const INTERVAL_SEC: Record<CandleInterval, number> = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14_400, '1d': 86_400 };
const DAY = 86_400;
const TAU = Math.PI * 2;
const DEPTH_LEVELS = 20;

/** Deterministic hash of two integers → [0, 1). */
export function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4_294_967_296;
}

/** FNV-1a of a name (the coin), so a spot pair and its futures contract move together. */
export function seedOf(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export interface SimSpec {
  symbol: string;
  /** Seed of the underlying coin. */
  seed: number;
  /** Reference price (the price oscillates around it, about ±7 % at most). */
  ref: number;
  tick: Dec;
  step: Dec;
  /** Futures: small premium over the index that comes and goes. */
  basis: boolean;
  /** Typical 24h quote volume in USDT (sizes depth, trades and candle volumes). */
  dailyQuoteVolume: number;
}

export function makeSpec(symbol: string, coin: string, ref: string, tick: string, step: string, basis = false): SimSpec {
  const seed = seedOf(coin);
  const dailyQuoteVolume = coin === 'BTC' ? 1.2e9 : coin === 'ETH' ? 6e8 : 2e7 + 1.5e8 * hash01(seed, 7);
  return { symbol, seed, ref: Number(ref), tick: dec(tick), step: dec(step), basis, dailyQuoteVolume };
}

const phase = (s: SimSpec, k: number) => hash01(s.seed, 1000 + k) * TAU;
/** BTC/ETH move less than small coins. */
const volScale = (s: SimSpec) => (s.dailyQuoteVolume >= 1e9 ? 0.6 : s.dailyQuoteVolume >= 5e8 ? 0.8 : 0.8 + 1.0 * hash01(s.seed, 3));

/** Index (spot) log-offset from the reference at time t (seconds). */
function wave(s: SimSpec, t: number): number {
  const v = volScale(s);
  return (
    v *
      (0.03 * Math.sin((TAU * t) / (7 * DAY) + phase(s, 1)) +
        0.012 * Math.sin((TAU * t) / DAY + phase(s, 2)) +
        0.003 * Math.sin((TAU * t) / 3600 + phase(s, 3)) +
        0.0012 * Math.sin((TAU * t) / 300 + phase(s, 4)) +
        0.0004 * Math.sin((TAU * t) / 41 + phase(s, 5))) +
    0.0003 * v * (hash01(s.seed, Math.floor(t)) - 0.5)
  );
}

/** Index price (no futures premium). */
export function indexPrice(s: SimSpec, t: number): number {
  return s.ref * Math.exp(wave(s, t));
}

/** Traded price at time t (seconds). Constant within a second. */
export function price(s: SimSpec, t: number): number {
  const sec = Math.floor(t);
  const premium = s.basis ? 0.0004 * Math.sin((TAU * sec) / (6 * 3600) + phase(s, 6)) : 0;
  return s.ref * Math.exp(wave(s, sec) + premium);
}

const decimals = (d: Dec) => Math.max(0, d.decimalPlaces());
/** A float price on the tick grid (never below one tick). */
export function onTick(s: SimSpec, p: number): Dec {
  const v = dec(p.toPrecision(15)).toNearest(s.tick);
  return v.lt(s.tick) ? s.tick : v;
}
const fmt = (s: SimSpec, p: number) => onTick(s, p).toFixed(decimals(s.tick));
const qtyStr = (s: SimSpec, q: number) => {
  const v = floorToStep(dec(q.toPrecision(15)), s.step);
  return (v.lt(s.step) ? s.step : v).toFixed(decimals(s.step));
};

// ───────────────────────────── order book + trades

export function bestBidAsk(s: SimSpec, t: number): { bid: Dec; ask: Dec } {
  const bid = onTick(s, price(s, t) - s.tick.toNumber() / 2);
  return { bid, ask: bid.add(s.tick) };
}

export function depth(s: SimSpec, t: number): { bids: [string, string][]; asks: [string, string][] } {
  const sec = Math.floor(t);
  const mid = price(s, sec);
  const { bid, ask } = bestBidAsk(s, sec);
  // 20 levels spanning about 0.1 % of the price
  const gap = s.tick.mul(Math.max(1, Math.floor((mid * 0.00005) / s.tick.toNumber())));
  const levelUsd = s.dailyQuoteVolume / 20_000;
  const qty = (i: number, side: number) => qtyStr(s, (levelUsd * (0.2 + 1.6 * hash01(s.seed, sec * 64 + i * 2 + side)) * (1 + i * 0.15)) / mid);
  const d = decimals(s.tick);
  const bids: [string, string][] = [];
  const asks: [string, string][] = [];
  for (let i = 0; i < DEPTH_LEVELS; i++) {
    const b = bid.sub(gap.mul(i));
    if (b.gt(0)) bids.push([b.toFixed(d), qty(i, 0)]);
    asks.push([ask.add(gap.mul(i)).toFixed(d), qty(i, 1)]);
  }
  return { bids, asks };
}

export interface SimTrade {
  price: string;
  qty: string;
  isBuyerMaker: boolean;
}

/** 1–3 trades in second `sec`, at the best bid (seller took it) or the best ask (buyer took it). */
export function trades(s: SimSpec, sec: number): SimTrade[] {
  const { bid, ask } = bestBidAsk(s, sec);
  const mid = price(s, sec);
  const n = 1 + Math.floor(hash01(s.seed ^ 0x5bd1e995, sec) * 3);
  const d = decimals(s.tick);
  return Array.from({ length: n }, (_, i) => {
    const sellerTook = hash01(s.seed, sec * 8 + i + 11) < 0.5;
    const usd = (s.dailyQuoteVolume / 400_000) * (0.1 + 2 * hash01(s.seed, sec * 8 + i + 23));
    return { price: (sellerTook ? bid : ask).toFixed(d), qty: qtyStr(s, usd / mid), isBuyerMaker: sellerTook };
  });
}

// ───────────────────────────── candles + 24h ticker

/** The candle that opens at `openSec`, as seen at `nowSec` (forming if it has not closed yet). */
export function candle(s: SimSpec, interval: CandleInterval, openSec: number, nowSec: number): Candle {
  const len = INTERVAL_SEC[interval];
  const closed = openSec + len <= nowSec;
  const end = closed ? openSec + len - 1 : Math.max(openSec, Math.floor(nowSec));
  const n = Math.min(60, end - openSec);
  let hi = Math.max(price(s, openSec), price(s, end));
  let lo = Math.min(price(s, openSec), price(s, end));
  for (let i = 1; i < n; i++) {
    const p = price(s, openSec + Math.floor(((end - openSec) * i) / n));
    if (p > hi) hi = p;
    if (p < lo) lo = p;
  }
  const elapsed = (end - openSec + 1) / len;
  const quoteVolume = ((s.dailyQuoteVolume * len) / DAY) * (0.6 + 0.8 * hash01(s.seed, openSec + len)) * elapsed;
  const avg = (hi + lo) / 2;
  return {
    openTime: openSec * 1000,
    closeTime: (openSec + len) * 1000 - 1,
    open: fmt(s, price(s, openSec)),
    high: fmt(s, hi),
    low: fmt(s, lo),
    close: fmt(s, price(s, end)),
    volume: (quoteVolume / avg).toFixed(8),
    quoteVolume: quoteVolume.toFixed(8),
    closed,
  };
}

/** Candle history like Binance klines: the last `limit` candles opening before `endTime` (ms), forming one included. */
export function history(s: SimSpec, interval: CandleInterval, limit: number, nowMs: number, endTime?: number): Candle[] {
  const len = INTERVAL_SEC[interval];
  const nowSec = Math.floor(nowMs / 1000);
  const lastOpen = Math.floor(Math.min(nowSec, endTime !== undefined ? Math.floor((endTime - 1) / 1000) : nowSec) / len) * len;
  const out: Candle[] = [];
  for (let i = limit - 1; i >= 0; i--) out.push(candle(s, interval, lastOpen - i * len, nowSec));
  return out;
}

export function ticker24h(s: SimSpec, nowMs: number): TickerInput {
  const now = Math.floor(nowMs / 1000);
  const open = price(s, now - DAY);
  const last = price(s, now);
  let hi = Math.max(open, last);
  let lo = Math.min(open, last);
  for (let t = now - DAY; t < now; t += 600) {
    const p = price(s, t);
    if (p > hi) hi = p;
    if (p < lo) lo = p;
  }
  const o = onTick(s, open);
  const c = onTick(s, last);
  const quoteVolume = s.dailyQuoteVolume * (0.8 + 0.4 * hash01(s.seed, Math.floor(now / DAY)));
  const { bid, ask } = bestBidAsk(s, now);
  const d = decimals(s.tick);
  return {
    lastPrice: c.toFixed(d),
    openPrice: o.toFixed(d),
    highPrice: fmt(s, hi),
    lowPrice: fmt(s, lo),
    priceChange: c.sub(o).toFixed(d),
    priceChangePercent: c.sub(o).div(o).mul(100).toFixed(2),
    volume: (quoteVolume / ((hi + lo) / 2)).toFixed(8),
    quoteVolume: quoteVolume.toFixed(8),
    bestBid: bid.toFixed(d),
    bestAsk: ask.toFixed(d),
    eventTime: nowMs,
  };
}

// ───────────────────────────── futures mark / funding

const FUNDING_SEC = 8 * 3600;

export function markUpdate(s: SimSpec, nowMs: number) {
  const now = Math.floor(nowMs / 1000);
  const rate = 0.0001 + 0.00008 * Math.sin((TAU * now) / (3 * DAY) + phase(s, 7));
  return {
    markPrice: fmt(s, price(s, now)),
    indexPrice: fmt(s, indexPrice(s, now)),
    fundingRate: rate.toFixed(8),
    nextFundingTime: (Math.floor(now / FUNDING_SEC) + 1) * FUNDING_SEC * 1000,
    eventTime: nowMs,
  };
}
