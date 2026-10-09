import type { Depth } from '@cex/contracts';
import { dec } from '@cex/core';
import { logger } from '../../logger.ts';

type Level = [string, string];
export interface BookSnapshot {
  bids: Level[];
  asks: Level[];
}

/** Loads a deep order book (Binance REST). `limit` is 100 or 500. */
export type DepthFetcher = (symbol: string, limit: number) => Promise<BookSnapshot>;

export function binanceDepthFetcher(restUrl: string): DepthFetcher {
  return async (symbol, limit) => {
    const res = await fetch(`${restUrl}/api/v3/depth?symbol=${symbol}&limit=${limit}`);
    if (!res.ok) throw new Error(`depth HTTP ${res.status}`);
    const d = (await res.json()) as BookSnapshot;
    return { bids: d.bids, asks: d.asks };
  };
}

/** Binance request weight of /api/v3/depth for each size we use. */
const WEIGHT: Record<number, number> = { 100: 5, 500: 25 };
const TTL_MS: Record<number, number> = { 100: 1000, 500: 3000 };
/** Our share of Binance's 6000 weight/minute IP budget for deep books (klines and the rest keep the remainder). */
const WEIGHT_BUDGET_PER_MIN = 1200;

/**
 * Deep order books for price grouping / depth charts, fetched on demand and cached per symbol.
 * Never on the matching path: matching only uses the live top-20 stream.
 */
export class DepthSnapshots {
  private readonly cache = new Map<string, { at: number; snap: BookSnapshot }>();
  private readonly inflight = new Map<string, Promise<BookSnapshot | null>>();
  private spent: { at: number; w: number }[] = [];

  constructor(
    private readonly fetcher: DepthFetcher | null,
    private readonly now: () => number = Date.now,
  ) {}

  /** Snapshot with at least `limit` levels per side when available; null if none can be had. */
  async get(symbol: string, limit: number): Promise<BookSnapshot | null> {
    if (!this.fetcher) return null;
    const size = limit <= 100 ? 100 : 500;
    const key = `${symbol}|${size}`;
    const hit = this.cache.get(key) ?? (size === 100 ? this.cache.get(`${symbol}|500`) : undefined);
    if (hit && this.now() - hit.at < TTL_MS[size]!) return hit.snap;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    if (!this.reserve(WEIGHT[size]!)) return hit?.snap ?? null; // over budget: serve stale rather than hammer Binance
    const p = this.fetcher(symbol, size)
      .then((snap) => {
        this.cache.set(key, { at: this.now(), snap });
        return snap;
      })
      .catch((err: unknown) => {
        logger.warn({ err, symbol }, 'depth snapshot failed');
        return hit?.snap ?? null;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private reserve(w: number): boolean {
    const t = this.now();
    this.spent = this.spent.filter((s) => t - s.at < 60_000);
    const used = this.spent.reduce((a, s) => a + s.w, 0);
    if (used + w > WEIGHT_BUDGET_PER_MIN) return false;
    this.spent.push({ at: t, w });
    return true;
  }
}

/**
 * Live levels first, then snapshot levels strictly beyond the deepest live level on each side,
 * so the top of the book is always the live stream and the tail fills in from the snapshot.
 * A side with no live levels gets no snapshot tail either (no data shown while the feed is down).
 */
export function mergeDeepDepth(live: Depth, snap: BookSnapshot | null, limit: number): Depth {
  const tail = (side: Level[], snapSide: Level[], beyond: (p: string, last: string) => boolean): Level[] => {
    const last = side.at(-1)?.[0];
    if (!snap || last === undefined) return side.slice(0, limit);
    return [...side, ...snapSide.filter(([p]) => beyond(p, last))].slice(0, limit);
  };
  return {
    ...live,
    bids: tail(live.bids, snap?.bids ?? [], (p, last) => dec(p).lt(last)),
    asks: tail(live.asks, snap?.asks ?? [], (p, last) => dec(p).gt(last)),
  };
}
