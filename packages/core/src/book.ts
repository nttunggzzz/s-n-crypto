import { Dec, ZERO, floorToStep, minDec } from './decimal.ts';

export type Side = 'BUY' | 'SELL';

export interface BookLevel {
  price: Dec;
  qty: Dec;
}

export interface Fill {
  price: Dec;
  qty: Dec;
}

export type WalkTarget = { kind: 'base'; qty: Dec } | { kind: 'quote'; amount: Dec };

export interface WalkResult {
  fills: Fill[];
  executedQty: Dec;
  quoteQty: Dec;
  /** true when the requested target was fully reachable within the book (and limit). */
  complete: boolean;
}

/**
 * Simulates taking liquidity from an external order book snapshot.
 *
 * `levels` must be best-first: asks ascending for BUY, bids descending for SELL.
 * With `limitPrice`, levels worse than the limit are not touched.
 * Virtual users do not consume Binance liquidity, so every order walks the full snapshot.
 */
export function walkBook(
  side: Side,
  levels: readonly BookLevel[],
  target: WalkTarget,
  stepSize: Dec,
  limitPrice?: Dec,
): WalkResult {
  const usable = levels.filter((l) => {
    if (l.qty.lte(0)) return false;
    if (!limitPrice) return true;
    return side === 'BUY' ? l.price.lte(limitPrice) : l.price.gte(limitPrice);
  });

  let baseTarget: Dec;
  let reachable = true;
  if (target.kind === 'base') {
    baseTarget = target.qty;
  } else {
    // Continuous walk to find how much base the quote amount can buy/sell, then floor to step.
    let remaining = target.amount;
    let base = ZERO;
    for (const l of usable) {
      if (remaining.lte(0)) break;
      const levelQuote = l.qty.mul(l.price);
      if (levelQuote.lte(remaining)) {
        base = base.add(l.qty);
        remaining = remaining.sub(levelQuote);
      } else {
        base = base.add(remaining.div(l.price));
        remaining = ZERO;
      }
    }
    if (remaining.gt(0)) reachable = false;
    baseTarget = floorToStep(base, stepSize);
  }

  const fills: Fill[] = [];
  let remaining = baseTarget;
  let quoteQty = ZERO;
  for (const l of usable) {
    if (remaining.lte(0)) break;
    const q = minDec(l.qty, remaining);
    fills.push({ price: l.price, qty: q });
    quoteQty = quoteQty.add(q.mul(l.price));
    remaining = remaining.sub(q);
  }
  const executedQty = baseTarget.sub(remaining);
  const complete = reachable && remaining.isZero() && executedQty.gt(0);
  return { fills, executedQty, quoteQty, complete };
}
