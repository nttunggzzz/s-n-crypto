import { dec, type Dec } from '@cex/core';
import type { OrderRow } from './events.ts';

interface Entry {
  id: number;
  side: 'BUY' | 'SELL';
  price: Dec;
}

/**
 * In-memory index of resting LIMIT orders per symbol, so the matcher does not query the DB
 * on every market trade. The DB stays the source of truth: every fill re-checks the order
 * row under a row lock.
 */
export class OpenOrderIndex {
  private readonly bySymbol = new Map<string, Map<number, Entry>>();

  add(o: Pick<OrderRow, 'id' | 'symbol' | 'side' | 'price' | 'type'>): void {
    if (o.type !== 'LIMIT' || o.price === null) return;
    let m = this.bySymbol.get(o.symbol);
    if (!m) {
      m = new Map();
      this.bySymbol.set(o.symbol, m);
    }
    m.set(o.id, { id: o.id, side: o.side, price: dec(o.price) });
  }

  remove(symbol: string, id: number): void {
    this.bySymbol.get(symbol)?.delete(id);
  }

  clear(): void {
    this.bySymbol.clear();
  }

  size(symbol?: string): number {
    if (symbol) return this.bySymbol.get(symbol)?.size ?? 0;
    let n = 0;
    for (const m of this.bySymbol.values()) n += m.size;
    return n;
  }

  /**
   * Orders whose limit was crossed (strictly, not just touched) by market trades
   * between `low` and `high`: BUY with price > low, SELL with price < high.
   * Oldest first (lower id).
   */
  crossing(symbol: string, low: Dec, high: Dec): number[] {
    const m = this.bySymbol.get(symbol);
    if (!m) return [];
    const ids: number[] = [];
    for (const e of m.values()) {
      if ((e.side === 'BUY' && e.price.gt(low)) || (e.side === 'SELL' && e.price.lt(high))) ids.push(e.id);
    }
    return ids.sort((a, b) => a - b);
  }
}
