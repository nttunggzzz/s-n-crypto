import { Dec, ZERO, floorToStep } from './decimal.ts';

export interface RiskSizingInput {
  /** Account value used as the base (e.g. wallet totalValueUsdt). */
  equity: Dec;
  /** Percent of equity you accept to lose if the stop is hit, e.g. 1 = 1%. */
  riskPercent: Dec;
  entryPrice: Dec;
  stopPrice: Dec;
  stepSize: Dec;
  /** Fee rate per side (exchangeInfo.feeRate); counted on entry and exit. */
  feeRate?: Dec;
}

export interface RiskSizingResult {
  /** Suggested base quantity, floored to stepSize (0 if too small). */
  quantity: Dec;
  /** equity × riskPercent / 100 */
  riskAmount: Dec;
  /** Loss per unit if the stop is hit, including fees. */
  lossPerUnit: Dec;
  /** quantity × entryPrice — may exceed what the user can afford; the UI should cap it. */
  notional: Dec;
  side: 'LONG';
}

/**
 * Position size for a fixed risk (long only on spot): stop must be below entry.
 *   lossPerUnit = (entry − stop) + feeRate × (entry + stop)
 *   quantity    = floor_step(riskAmount / lossPerUnit)
 */
export function positionSizeForRisk(i: RiskSizingInput): RiskSizingResult {
  if (i.entryPrice.lte(0) || i.stopPrice.lte(0)) throw new Error('prices must be > 0');
  if (i.stopPrice.gte(i.entryPrice)) throw new Error('stop must be below entry');
  if (i.riskPercent.lte(0) || i.riskPercent.gt(100)) throw new Error('riskPercent must be in (0, 100]');
  const fee = i.feeRate ?? ZERO;
  const lossPerUnit = i.entryPrice.sub(i.stopPrice).add(fee.mul(i.entryPrice.add(i.stopPrice)));
  const riskAmount = i.equity.mul(i.riskPercent).div(100);
  const quantity = floorToStep(riskAmount.div(lossPerUnit), i.stepSize);
  return { quantity, riskAmount, lossPerUnit, notional: quantity.mul(i.entryPrice), side: 'LONG' };
}
