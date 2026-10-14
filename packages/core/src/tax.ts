import { Dec, roundUp } from './decimal.ts';

/**
 * Vietnam crypto tax (module T §3.2) — the arithmetic only; who is withheld is decided by the server.
 *
 * Tax of ONE spot SELL fill = roundUp to 8 decimals of (quoteQty × rate), on the GROSS value (before the fee),
 * profit or loss alike. Rounded up because the user pays it (invariant 2). quoteQty > 0 and rate > 0 → tax ≥ 0.00000001.
 */
export function withholdingTax(quoteQty: Dec, rate: Dec): Dec {
  if (quoteQty.lt(0) || rate.lt(0)) throw new Error('withholdingTax: quoteQty and rate must be >= 0');
  return roundUp(quoteQty.mul(rate));
}

/**
 * Reference VND amounts of a withheld fill (display only, the ledger is in USDT):
 *  - grossVnd = floor(grossQuote × vndRate) whole dong,
 *  - taxVnd   = ceil(taxAmount × vndRate) whole dong (what the user pays rounds up).
 * No rate → both null (never guessed, invariant 6).
 */
export function taxVndAmounts(grossQuote: Dec, taxAmount: Dec, vndRate: Dec | null): { grossVnd: Dec | null; taxVnd: Dec | null } {
  if (vndRate === null) return { grossVnd: null, taxVnd: null };
  if (vndRate.lte(0)) throw new Error('taxVndAmounts: vndRate must be > 0');
  return {
    grossVnd: grossQuote.mul(vndRate).toDecimalPlaces(0, Dec.ROUND_FLOOR),
    taxVnd: taxAmount.mul(vndRate).toDecimalPlaces(0, Dec.ROUND_CEIL),
  };
}
