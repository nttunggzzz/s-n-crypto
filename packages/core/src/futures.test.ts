import { describe, expect, it } from 'vitest';
import { dec } from './decimal.ts';
import { averageEntry, fundingPayment, initialMargin, isLiquidatable, liquidationPrice, pnl, returnOnMargin } from './futures.ts';

describe('futures math', () => {
  it('initial margin rounds up to 8 dp', () => {
    expect(initialMargin(dec('83000.1'), dec('0.001'), 20).toFixed()).toBe('4.150005');
    expect(initialMargin(dec('0.1'), dec('1'), 3).toFixed()).toBe('0.03333334');
  });

  it('PnL is signed by side and rounded toward −∞', () => {
    expect(pnl('LONG', dec('100'), dec('110'), dec('2')).toFixed()).toBe('20');
    expect(pnl('SHORT', dec('100'), dec('110'), dec('2')).toFixed()).toBe('-20');
    // entry with many decimals: gain rounds down, loss rounds up (more negative)
    const e = averageEntry(dec('1'), dec('100'), dec('2'), dec('101'));
    expect(e.toFixed()).toBe('100.666666666667');
    expect(pnl('LONG', e, dec('101'), dec('3')).toFixed()).toBe('0.99999999');
    expect(pnl('SHORT', e, dec('101'), dec('3')).toFixed()).toBe('-1');
  });

  it('liquidation price is exactly the point where isLiquidatable flips', () => {
    const entry = dec('80000');
    const qty = dec('0.01');
    const margin = dec('40'); // 20x
    const mmr = dec('0.004');
    const long = liquidationPrice('LONG', entry, qty, margin, mmr)!;
    expect(long.toFixed(6)).toBe('76305.220884');
    expect(isLiquidatable('LONG', entry, long.sub('0.000001'), qty, margin, mmr)).toBe(true);
    expect(isLiquidatable('LONG', entry, long.add('0.000001'), qty, margin, mmr)).toBe(false);
    const short = liquidationPrice('SHORT', entry, qty, margin, mmr)!;
    expect(short.toFixed(6)).toBe('83665.338645');
    expect(isLiquidatable('SHORT', entry, short.add('0.000001'), qty, margin, mmr)).toBe(true);
    expect(isLiquidatable('SHORT', entry, short.sub('0.000001'), qty, margin, mmr)).toBe(false);
    // aligned to the tick on the warning side: the shown price is reached before the real one
    expect(liquidationPrice('LONG', entry, qty, margin, mmr, dec('0.1'))!.toFixed()).toBe('76305.3');
    expect(liquidationPrice('SHORT', entry, qty, margin, mmr, dec('0.1'))!.toFixed()).toBe('83665.3');
    // 1x long with margin ≥ notional can never be liquidated
    expect(liquidationPrice('LONG', entry, qty, dec('800'), mmr)).toBeNull();
  });

  it('funding: positive rate → LONG pays, SHORT receives; rounded in the user’s disfavour', () => {
    expect(fundingPayment('LONG', dec('0.5'), dec('80000'), dec('0.0001')).toFixed()).toBe('-4');
    expect(fundingPayment('SHORT', dec('0.5'), dec('80000'), dec('0.0001')).toFixed()).toBe('4');
    expect(fundingPayment('LONG', dec('1'), dec('3.33333'), dec('0.00001955')).toFixed()).toBe('-0.00006517');
    expect(fundingPayment('SHORT', dec('1'), dec('3.33333'), dec('0.00001955')).toFixed()).toBe('0.00006516');
  });

  it('return on margin', () => {
    expect(returnOnMargin(dec('10'), dec('40'))!.toFixed()).toBe('0.25');
    expect(returnOnMargin(dec('10'), dec('0'))).toBeNull();
  });
});
