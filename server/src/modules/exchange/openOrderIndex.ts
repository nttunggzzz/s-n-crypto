import { dec, type Dec } from '@cex/core';
import { OPEN_STATUSES } from '../../db/schema.ts';
import type { OrderRow } from './events.ts';

/** A working limit: LIMIT, a triggered STOP_LIMIT, or the limit leg of an OCO. Fills when crossed. */
export interface LimitEntry {
  kind: 'LIMIT';
  id: number;
  side: 'BUY' | 'SELL';
  price: Dec;
}

/** A waiting STOP_MARKET / STOP_LIMIT (incl. OCO stop legs). Triggers when the price reaches stopPrice. */
export interface StopEntry {
  kind: 'STOP';
  id: number;
  direction: 'UP' | 'DOWN';
  stopPrice: Dec;
}

/** A waiting trailing stop. reference/stopPrice are null until activation. */
export interface TrailingEntry {
  kind: 'TRAILING';
  id: number;
  side: 'BUY' | 'SELL';
  deltaBips: number;
  activationPrice: Dec | null;
  reference: Dec | null;
  stopPrice: Dec | null;
}

export type IndexEntry = LimitEntry | StopEntry | TrailingEntry;

const isOpen = (s: string) => (OPEN_STATUSES as readonly string[]).includes(s);

/** What the matcher must watch for this order, if anything. */
export function entryFor(o: OrderRow): IndexEntry | null {
  if (!isOpen(o.status)) return null;
  if (o.type === 'LIMIT' || (o.type === 'STOP_LIMIT' && o.triggerState === 'TRIGGERED')) {
    return o.price === null ? null : { kind: 'LIMIT', id: o.id, side: o.side, price: dec(o.price) };
  }
  if ((o.type === 'STOP_MARKET' || o.type === 'STOP_LIMIT') && o.triggerState === 'WAITING' && o.stopPrice && o.triggerDirection) {
    return { kind: 'STOP', id: o.id, direction: o.triggerDirection, stopPrice: dec(o.stopPrice) };
  }
  if (o.type === 'TRAILING_STOP_MARKET' && o.triggerState === 'WAITING' && o.trailingDeltaBips !== null) {
    return {
      kind: 'TRAILING',
      id: o.id,
      side: o.side,
      deltaBips: o.trailingDeltaBips,
      activationPrice: o.activationPrice === null ? null : dec(o.activationPrice),
      reference: o.trailingReferencePrice === null ? null : dec(o.trailingReferencePrice),
      stopPrice: o.stopPrice === null ? null : dec(o.stopPrice),
    };
  }
  return null;
}

/**
 * In-memory index of orders the matcher watches, per symbol, so the DB is not queried on every
 * market trade. The DB stays the source of truth: every action re-checks the row under a lock.
 */
export class OpenOrderIndex {
  private readonly bySymbol = new Map<string, Map<number, IndexEntry>>();

  /** Adds, updates or removes the order according to its current state. */
  sync(o: OrderRow): void {
    const e = entryFor(o);
    if (!e) return this.remove(o.symbol, o.id);
    let m = this.bySymbol.get(o.symbol);
    if (!m) {
      m = new Map();
      this.bySymbol.set(o.symbol, m);
    }
    m.set(o.id, e);
  }

  remove(symbol: string, id: number): void {
    this.bySymbol.get(symbol)?.delete(id);
  }

  clear(): void {
    this.bySymbol.clear();
  }

  get(symbol: string, id: number): IndexEntry | undefined {
    return this.bySymbol.get(symbol)?.get(id);
  }

  size(symbol?: string): number {
    if (symbol) return this.bySymbol.get(symbol)?.size ?? 0;
    let n = 0;
    for (const m of this.bySymbol.values()) n += m.size;
    return n;
  }

  private entries(symbol: string): IndexEntry[] {
    return [...(this.bySymbol.get(symbol)?.values() ?? [])].sort((a, b) => a.id - b.id);
  }

  /** Working limits crossed (strictly) by trades in [low, high]: BUY price > low, SELL price < high. */
  crossingLimits(symbol: string, low: Dec, high: Dec): number[] {
    return this.entries(symbol)
      .filter((e): e is LimitEntry => e.kind === 'LIMIT')
      .filter((e) => (e.side === 'BUY' ? e.price.gt(low) : e.price.lt(high)))
      .map((e) => e.id);
  }

  /** Waiting stops reached by trades in [low, high] (touch triggers). */
  reachedStops(symbol: string, low: Dec, high: Dec): StopEntry[] {
    return this.entries(symbol)
      .filter((e): e is StopEntry => e.kind === 'STOP')
      .filter((e) => (e.direction === 'UP' ? high.gte(e.stopPrice) : low.lte(e.stopPrice)));
  }

  trailing(symbol: string): TrailingEntry[] {
    return this.entries(symbol).filter((e): e is TrailingEntry => e.kind === 'TRAILING');
  }
}
