import { Dec, dec, isMultipleOfStep } from './decimal.ts';

/** Trading rules of one symbol, taken from Binance exchangeInfo (decimal strings). */
export interface SymbolRules {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  tickSize: string;
  stepSize: string;
  minQty: string;
  maxQty: string;
  minNotional: string;
}

export type RuleViolation =
  | 'INVALID_PRICE'
  | 'PRICE_TICK_SIZE'
  | 'INVALID_QUANTITY'
  | 'QUANTITY_STEP_SIZE'
  | 'QUANTITY_TOO_SMALL'
  | 'QUANTITY_TOO_LARGE'
  | 'NOTIONAL_TOO_SMALL';

export function checkPrice(rules: SymbolRules, price: Dec): RuleViolation | null {
  if (price.lte(0)) return 'INVALID_PRICE';
  if (!isMultipleOfStep(price, dec(rules.tickSize))) return 'PRICE_TICK_SIZE';
  return null;
}

export function checkQuantity(rules: SymbolRules, qty: Dec): RuleViolation | null {
  if (qty.lte(0)) return 'INVALID_QUANTITY';
  if (!isMultipleOfStep(qty, dec(rules.stepSize))) return 'QUANTITY_STEP_SIZE';
  if (qty.lt(dec(rules.minQty))) return 'QUANTITY_TOO_SMALL';
  if (qty.gt(dec(rules.maxQty))) return 'QUANTITY_TOO_LARGE';
  return null;
}

export function checkNotional(rules: SymbolRules, notional: Dec): RuleViolation | null {
  if (notional.lt(dec(rules.minNotional))) return 'NOTIONAL_TOO_SMALL';
  return null;
}

/** Number of decimals implied by a step like "0.00010000" -> 4. */
export function stepDecimals(step: string): number {
  const d = dec(step);
  if (d.lte(0)) return 0;
  return d.decimalPlaces();
}
