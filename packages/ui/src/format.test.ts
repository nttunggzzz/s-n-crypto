import { describe, it, expect } from 'vitest';
import { formatDecimal, formatPrice, formatAmount, formatPercent } from './format';

describe('formatDecimal', () => {
  it('returns "—" for null or undefined or empty, never "0"', () => {
    expect(formatDecimal(null)).toBe('—');
    expect(formatDecimal(undefined)).toBe('—');
    expect(formatDecimal('')).toBe('—');
    expect(formatDecimal('null')).toBe('—');
    expect(formatDecimal('undefined')).toBe('—');
  });

  it('formats with Vietnamese locale by default (dots for thousands, comma for decimals)', () => {
    expect(formatDecimal('1234567.89')).toBe('1.234.567,89');
    expect(formatDecimal('1000')).toBe('1.000');
    expect(formatDecimal('0.05')).toBe('0,05');
  });

  it('formats with English locale when specified', () => {
    expect(formatDecimal('1234567.89', { locale: 'en' })).toBe('1,234,567.89');
  });

  it('limits or pads decimals without floating-point math', () => {
    expect(formatDecimal('1234.5678', { decimals: 2 })).toBe('1.234,56');
    expect(formatDecimal('1234.5', { decimals: 4 })).toBe('1.234,5000');
    expect(formatDecimal('1234.5678', { decimals: 0 })).toBe('1.234');
  });

  it('handles negative numbers correctly', () => {
    expect(formatDecimal('-5000.50')).toBe('-5.000,50');
  });
});

describe('formatPrice and formatAmount', () => {
  it('respects tickSize decimal places for price', () => {
    expect(formatPrice('96500.12345', '0.01')).toBe('96.500,12');
    expect(formatPrice(null, '0.01')).toBe('—');
  });

  it('respects stepSize decimal places for amount', () => {
    expect(formatAmount('1.234567', '0.001')).toBe('1,234');
    expect(formatAmount(null, '0.001')).toBe('—');
  });
});

describe('formatPercent', () => {
  it('adds + sign for positive percentages and - for negative', () => {
    expect(formatPercent('2.45')).toBe('+2,45%');
    expect(formatPercent('-3.14')).toBe('-3,14%');
    expect(formatPercent('0.00')).toBe('0,00%');
    expect(formatPercent(null)).toBe('—');
  });
});
