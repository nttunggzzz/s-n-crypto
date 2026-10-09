import { AMOUNT_SCALE, Dec, ZERO, ceilToStep, floorToStep, roundUp } from './decimal.ts';

/**
 * USDT-margined linear perpetuals, isolated margin, one-way mode.
 * Shared by the server (authoritative) and the UI (display only — e.g. live PnL from the mark price).
 */
export type PositionSide = 'LONG' | 'SHORT';

/** Precision kept for average entry prices (more than any tick size; PnL is rounded to 8 dp afterwards). */
export const ENTRY_PRICE_SCALE = 12;

const dir = (side: PositionSide) => (side === 'LONG' ? 1 : -1);

/** Round toward −∞ at `scale`: a signed amount in the user's disfavour (gains down, losses up). */
export function floorSigned(d: Dec, scale = AMOUNT_SCALE): Dec {
  return d.toDecimalPlaces(scale, Dec.ROUND_FLOOR);
}

/** Margin needed to open `qty` at `price` with `leverage` (charged: rounded up). */
export function initialMargin(price: Dec, qty: Dec, leverage: number): Dec {
  return roundUp(price.mul(qty).div(leverage));
}

/** Exact (unrounded) profit or loss of `qty` from `entry` to `price`. */
export function rawPnl(side: PositionSide, entry: Dec, price: Dec, qty: Dec): Dec {
  return price.sub(entry).mul(qty).mul(dir(side));
}

/** Realized / displayed PnL at 8 dp, rounded in the user's disfavour. */
export function pnl(side: PositionSide, entry: Dec, price: Dec, qty: Dec): Dec {
  return floorSigned(rawPnl(side, entry, price, qty));
}

/** Weighted average entry after adding `addQty` at `price`. */
export function averageEntry(qty: Dec, entry: Dec, addQty: Dec, price: Dec): Dec {
  if (qty.isZero()) return price;
  return entry.mul(qty).add(price.mul(addQty)).div(qty.add(addQty)).toDecimalPlaces(ENTRY_PRICE_SCALE, Dec.ROUND_HALF_UP);
}

/** Maintenance margin at the mark price. */
export function maintenanceMargin(mark: Dec, qty: Dec, mmr: Dec): Dec {
  return mark.mul(qty).mul(mmr);
}

/**
 * Isolated position is liquidated when margin + unrealized PnL ≤ maintenance margin
 * (exact comparison, no rounding).
 */
export function isLiquidatable(side: PositionSide, entry: Dec, mark: Dec, qty: Dec, margin: Dec, mmr: Dec): boolean {
  return margin.add(rawPnl(side, entry, mark, qty)).lte(maintenanceMargin(mark, qty, mmr));
}

/**
 * Mark price at which the position gets liquidated, aligned to the tick on the safe side
 * (LONG rounds up, SHORT rounds down: the shown price is reached just before the real one — a warning, not the trigger).
 * LONG:  margin + (P − entry)·q = P·q·mmr  →  P = (entry·q − margin) / (q·(1 − mmr))
 * SHORT: margin + (entry − P)·q = P·q·mmr  →  P = (entry·q + margin) / (q·(1 + mmr))
 * null when a LONG can never be liquidated (margin ≥ entry·q).
 */
export function liquidationPrice(side: PositionSide, entry: Dec, qty: Dec, margin: Dec, mmr: Dec, tick?: Dec): Dec | null {
  if (qty.lte(0)) return null;
  if (side === 'LONG') {
    const p = entry.mul(qty).sub(margin).div(qty.mul(new Dec(1).sub(mmr)));
    if (p.lte(0)) return null;
    return tick ? ceilToStep(p, tick) : p;
  }
  const p = entry.mul(qty).add(margin).div(qty.mul(new Dec(1).add(mmr)));
  return tick ? floorToStep(p, tick) : p;
}

/**
 * Funding for one settlement, signed from the user's point of view (+ received, − paid).
 * rate > 0: LONG pays SHORT. Rounded in the user's disfavour.
 */
export function fundingPayment(side: PositionSide, qty: Dec, mark: Dec, rate: Dec): Dec {
  return floorSigned(qty.mul(mark).mul(rate).mul(-dir(side)));
}

/** Return on margin, e.g. 0.25 = +25 %. null without margin. */
export function returnOnMargin(pnlValue: Dec, margin: Dec): Dec | null {
  return margin.gt(ZERO) ? pnlValue.div(margin) : null;
}
