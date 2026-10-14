import { describe, expect, it } from 'vitest';
import { dec } from './decimal.ts';
import { taxVndAmounts, withholdingTax } from './tax.ts';

const t = (q: string, r = '0.001') => withholdingTax(dec(q), dec(r)).toFixed(8);

describe('withholdingTax — roundUp8(quoteQty × rate) per fill (module T §3.2)', () => {
  it('exact products stay exact', () => {
    expect(t('249.75')).toBe('0.24975000'); // 249.75 × 0.001
    expect(t('1000')).toBe('1.00000000');
    expect(t('5', '0.01')).toBe('0.05000000'); // max rate
  });

  it('rounds UP at the 8th decimal (the user pays)', () => {
    expect(t('0.00000001')).toBe('0.00000001'); // 1e-11 → 1e-8, never 0
    expect(t('0.00999999')).toBe('0.00001000'); // 0.00000999999 → 0.00001
    expect(t('123.45678901')).toBe('0.12345679'); // 0.12345678901 → …79
    expect(t('99.99999999', '0.0015')).toBe('0.15000000'); // 0.149999999985 → 0.15
    expect(t('0.00001234', '0.00000001')).toBe('0.00000001'); // tiny rate, tiny value: still 1e-8
  });

  it('per fill, not on the order total: two fills of 0.000005 pay 2e-8, one fill of 0.00001 pays 1e-8', () => {
    const perFill = withholdingTax(dec('0.000005'), dec('0.001')).add(withholdingTax(dec('0.000005'), dec('0.001')));
    expect(perFill.toFixed(8)).toBe('0.00000002'); // 5e-9 → 1e-8 each
    expect(t('0.00001')).toBe('0.00000001');
  });

  it('zero value → zero; negative input is refused', () => {
    expect(t('0')).toBe('0.00000000');
    expect(() => withholdingTax(dec('-1'), dec('0.001'))).toThrow();
    expect(() => withholdingTax(dec('1'), dec('-0.001'))).toThrow();
  });
});

describe('taxVndAmounts — gross floored, tax ceiled to whole dong', () => {
  it('golden values', () => {
    // 249.75 USDT × 26350 = 6 580 912.5 → 6 580 912 ; tax 0.24975 × 26350 = 6 580.9125 → 6 581
    const a = taxVndAmounts(dec('249.75'), dec('0.24975'), dec('26350'));
    expect([a.grossVnd!.toFixed(), a.taxVnd!.toFixed()]).toEqual(['6580912', '6581']);
    // exact products are not moved
    const b = taxVndAmounts(dec('100'), dec('0.1'), dec('25000'));
    expect([b.grossVnd!.toFixed(), b.taxVnd!.toFixed()]).toEqual(['2500000', '2500']);
    // 1e-8 USDT of tax at 26350.5 = 0.000263505 → 1 dong
    const c = taxVndAmounts(dec('0.00000001'), dec('0.00000001'), dec('26350.5'));
    expect([c.grossVnd!.toFixed(), c.taxVnd!.toFixed()]).toEqual(['0', '1']);
  });

  it('no reference rate → null, never 0 (invariant 6)', () => {
    expect(taxVndAmounts(dec('100'), dec('0.1'), null)).toEqual({ grossVnd: null, taxVnd: null });
    expect(() => taxVndAmounts(dec('100'), dec('0.1'), dec('0'))).toThrow();
  });
});
