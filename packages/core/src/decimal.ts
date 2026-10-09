import DecimalBase from 'decimal.js';

/**
 * All money, price and quantity math goes through this Decimal clone.
 * Never use JS `number` for amounts.
 */
export const Dec = DecimalBase.clone({ precision: 60, rounding: DecimalBase.ROUND_HALF_UP, toExpNeg: -40, toExpPos: 40 });
export type Dec = InstanceType<typeof Dec>;

/** Balances and ledger amounts are kept at 8 decimal places (same as Binance assets). */
export const AMOUNT_SCALE = 8;

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

export function isDecimalString(s: unknown): s is string {
  return typeof s === 'string' && DECIMAL_RE.test(s);
}

export function dec(value: string | Dec): Dec {
  if (typeof value !== 'string') return value;
  if (!DECIMAL_RE.test(value)) throw new Error(`Invalid decimal string: "${value}"`);
  return new Dec(value);
}

export const ZERO = new Dec(0);

/** Canonical string at a fixed scale, e.g. "0.00123400". */
export function toFixedStr(d: Dec, scale = AMOUNT_SCALE): string {
  return d.toFixed(scale);
}

/** Round toward zero to `scale` decimals (amounts paid out to users). */
export function roundDown(d: Dec, scale = AMOUNT_SCALE): Dec {
  return d.toDecimalPlaces(scale, Dec.ROUND_DOWN);
}

/** Round away from zero to `scale` decimals (amounts charged to users). */
export function roundUp(d: Dec, scale = AMOUNT_SCALE): Dec {
  return d.toDecimalPlaces(scale, Dec.ROUND_UP);
}

export function hasAtMostScale(d: Dec, scale = AMOUNT_SCALE): boolean {
  return d.decimalPlaces() <= scale;
}

/** Largest multiple of `step` that is <= value (value >= 0). */
export function floorToStep(value: Dec, step: Dec): Dec {
  if (step.lte(0)) throw new Error('step must be > 0');
  return value.div(step).floor().mul(step);
}

export function isMultipleOfStep(value: Dec, step: Dec): boolean {
  if (step.lte(0)) return true;
  return value.mod(step).isZero();
}

export function minDec(a: Dec, b: Dec): Dec {
  return a.lte(b) ? a : b;
}

export function maxDec(a: Dec, b: Dec): Dec {
  return a.gte(b) ? a : b;
}
