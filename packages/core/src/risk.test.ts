import { describe, expect, it } from 'vitest';
import { dec } from './decimal.ts';
import { positionSizeForRisk } from './risk.ts';

describe('positionSizeForRisk', () => {
  it('sizes a long so that hitting the stop loses ~riskPercent of equity', () => {
    const r = positionSizeForRisk({ equity: dec('10000'), riskPercent: dec('1'), entryPrice: dec('80000'), stopPrice: dec('78000'), stepSize: dec('0.00001') });
    // risk 100 USDT / 2000 per BTC = 0.05 BTC
    expect(r.quantity.toString()).toBe('0.05');
    expect(r.riskAmount.toString()).toBe('100');
    expect(r.notional.toString()).toBe('4000');
  });

  it('includes fees on both sides and floors to the step', () => {
    const r = positionSizeForRisk({
      equity: dec('10000'),
      riskPercent: dec('1'),
      entryPrice: dec('80000'),
      stopPrice: dec('78000'),
      stepSize: dec('0.00001'),
      feeRate: dec('0.001'),
    });
    // lossPerUnit = 2000 + 0.001 × 158000 = 2158 → 100 / 2158 = 0.046339… → 0.04633
    expect(r.lossPerUnit.toString()).toBe('2158');
    expect(r.quantity.toString()).toBe('0.04633');
    expect(r.quantity.mul(r.lossPerUnit).lte(r.riskAmount)).toBe(true);
  });

  it('rejects a stop above the entry', () => {
    expect(() => positionSizeForRisk({ equity: dec('1000'), riskPercent: dec('1'), entryPrice: dec('100'), stopPrice: dec('101'), stepSize: dec('0.01') })).toThrow();
  });
});
