import { describe, expect, it } from 'vitest';
import { walkBook } from './book.ts';
import { dec } from './decimal.ts';

const asks = [
  { price: dec('100'), qty: dec('1') },
  { price: dec('101'), qty: dec('2') },
  { price: dec('103'), qty: dec('5') },
];
const bids = [
  { price: dec('99'), qty: dec('1') },
  { price: dec('98'), qty: dec('2') },
];
const step = dec('0.001');

describe('walkBook', () => {
  it('walks asks for a base quantity across levels', () => {
    const r = walkBook('BUY', asks, { kind: 'base', qty: dec('2.5') }, step);
    expect(r.complete).toBe(true);
    expect(r.executedQty.toString()).toBe('2.5');
    // 1*100 + 1.5*101 = 251.5
    expect(r.quoteQty.toString()).toBe('251.5');
    expect(r.fills).toHaveLength(2);
  });

  it('reports incomplete when the book is too thin', () => {
    const r = walkBook('SELL', bids, { kind: 'base', qty: dec('5') }, step);
    expect(r.complete).toBe(false);
    expect(r.executedQty.toString()).toBe('3');
  });

  it('respects a limit price', () => {
    const r = walkBook('BUY', asks, { kind: 'base', qty: dec('5') }, step, dec('101'));
    expect(r.executedQty.toString()).toBe('3');
    expect(r.complete).toBe(false);
  });

  it('converts a quote amount into a step-floored base quantity that never overspends', () => {
    const r = walkBook('BUY', asks, { kind: 'quote', amount: dec('200') }, step);
    // 100 buys 1 @100, remaining 100 buys 0.990099.. @101 -> floor to 0.990
    expect(r.executedQty.toString()).toBe('1.99');
    expect(r.quoteQty.lte(dec('200'))).toBe(true);
    expect(r.quoteQty.toString()).toBe('199.99');
    expect(r.complete).toBe(true);
  });

  it('returns incomplete for a quote amount larger than the book', () => {
    const r = walkBook('BUY', asks, { kind: 'quote', amount: dec('100000') }, step);
    expect(r.complete).toBe(false);
    expect(r.executedQty.toString()).toBe('8');
  });
});
