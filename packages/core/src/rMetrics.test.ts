import { describe, expect, it } from 'vitest';
import { Dec } from './decimal.ts';
import { pnl } from './futures.ts';
import { allocateSpotFill, computeEntryResult, futuresEntryResult } from './journalFills.ts';
import { computeJournalStats } from './journalStats.ts';
import { R_METRICS_VERSION, compareCloseKey, compareRecordIds, rMultiple, rOutcome, riskAmount, summarizeR, type RSeriesItem } from './rMetrics.ts';

const s = (d: Dec | null) => (d === null ? null : d.toFixed(8));
const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}T12:00:00.000Z`;

describe('riskAmount', () => {
  it('|entry − stop| × qty, price risk only', () => {
    // LONG: |100 − 95| × 2 = 10 ; SHORT: |100 − 105| × 2 = 10 (always positive)
    expect(s(riskAmount({ entryPrice: '100', stopPrice: '95', quantity: '2' }))).toBe('10.00000000');
    expect(s(riskAmount({ entryPrice: '100', stopPrice: '105', quantity: '2' }))).toBe('10.00000000');
  });

  it('no initial stop, zero distance or zero quantity → null (R undefined, A-D4)', () => {
    expect(riskAmount({ entryPrice: '100', stopPrice: null, quantity: '2' })).toBeNull();
    expect(riskAmount({ entryPrice: '100', stopPrice: undefined, quantity: '2' })).toBeNull();
    expect(riskAmount({ entryPrice: '100', stopPrice: '100', quantity: '2' })).toBeNull();
    expect(riskAmount({ entryPrice: '100', stopPrice: '95', quantity: '0' })).toBeNull();
  });

  it('rounds to 8 dp half-up, so a non-terminating average entry still gives the exact risk', () => {
    // 3 buys for 220 USDT, 3 units: avg = 73.333… ; risk = |220 − 70 × 3| = 10 exactly
    expect(s(riskAmount({ entryPrice: new Dec(220).div(3), stopPrice: '70', quantity: '3' }))).toBe('10.00000000');
  });

  it('rejects impossible inputs', () => {
    expect(() => riskAmount({ entryPrice: '0', stopPrice: '1', quantity: '1' })).toThrow();
    expect(() => riskAmount({ entryPrice: '100', stopPrice: '0', quantity: '1' })).toThrow();
    expect(() => riskAmount({ entryPrice: '100', stopPrice: '90', quantity: '-1' })).toThrow();
    expect(() => riskAmount({ entryPrice: '1e2', stopPrice: '90', quantity: '1' })).toThrow();
  });
});

describe('rMultiple', () => {
  it('net PnL ÷ risk', () => {
    // 19.5 / 10 = 1.95
    expect(s(rMultiple({ netPnl: '19.5', risk: '10' }))).toBe('1.95000000');
  });

  it('rounds half-up to 8 dp', () => {
    expect(s(rMultiple({ netPnl: '10', risk: '3' }))).toBe('3.33333333'); // 3.333333333…
    expect(s(rMultiple({ netPnl: '-20', risk: '3' }))).toBe('-6.66666667'); // −6.666666666… → nearest 8 dp (ties away from 0)
    expect(s(rMultiple({ netPnl: '0.00000001', risk: '3' }))).toBe('0.00000000'); // 0.0000000033… → 0 → BREAKEVEN
  });

  it('null when there is no risk or no PnL; negative risk is a bug', () => {
    expect(rMultiple({ netPnl: '5', risk: null })).toBeNull();
    expect(rMultiple({ netPnl: null, risk: '5' })).toBeNull();
    expect(rMultiple({ netPnl: '5', risk: '0' })).toBeNull();
    expect(() => rMultiple({ netPnl: '5', risk: '-1' })).toThrow();
  });

  it('SHORT: the numerator is (entry − exit) × qty minus every cost; the denominator stays positive', () => {
    // SHORT 2 @ 100, initial stop 105, covered at 90; fees 0.05 % per side: 0.1 (entry) + 0.09 (exit) = 0.19
    // gross = (100 − 90) × 2 = 20 → net = 19.81 ; risk = |100 − 105| × 2 = 10 ; R = 1.981
    const gross = pnl('SHORT', new Dec(100), new Dec(90), new Dec(2));
    expect(gross.toFixed(8)).toBe('20.00000000');
    const risk = riskAmount({ entryPrice: '100', stopPrice: '105', quantity: '2' });
    expect(s(rMultiple({ netPnl: gross.sub('0.19'), risk }))).toBe('1.98100000');
    // stopped out at 105: gross (100 − 105) × 2 = −10, fees 0.1 + 0.105 → net −10.205 → R −1.0205 (fees make it worse than −1R)
    const lossGross = pnl('SHORT', new Dec(100), new Dec(105), new Dec(2));
    expect(s(rMultiple({ netPnl: lossGross.sub('0.205'), risk }))).toBe('-1.02050000');
  });
});

describe('rOutcome', () => {
  it('WIN / LOSS / BREAKEVEN from R, or from net PnL when R is null', () => {
    expect(rOutcome({ r: '0.5', netPnl: '-1' })).toBe('WIN'); // R decides when present
    expect(rOutcome({ r: '-0.00000001', netPnl: null })).toBe('LOSS');
    expect(rOutcome({ r: '0.000000004', netPnl: null })).toBe('BREAKEVEN'); // rounds to 0 at 8 dp
    expect(rOutcome({ r: null, netPnl: '3' })).toBe('WIN');
    expect(rOutcome({ r: null, netPnl: '0' })).toBe('BREAKEVEN');
    expect(() => rOutcome({ r: null, netPnl: null })).toThrow();
  });
});

describe('summarizeR', () => {
  it('empty series: every metric null, counts 0, version printed', () => {
    const r = summarizeR([]);
    expect(r).toEqual({
      rMetricsVersion: 1,
      count: 0,
      countWithR: 0,
      countWithNetPnl: 0,
      wins: 0,
      losses: 0,
      breakevens: 0,
      winRate: null,
      totalR: null,
      expectancyR: null,
      avgWinR: null,
      avgLossR: null,
      profitFactorR: null,
      maxDrawdownR: null,
      totalNetPnl: null,
      avgNetPnl: null,
      profitFactorUsdt: null,
      maxDrawdownUsdt: null,
      longestWinStreak: null,
      longestLossStreak: null,
      rCurve: [],
      pnlCurve: [],
    });
    expect(R_METRICS_VERSION).toBe(1);
  });

  it('single winning entry', () => {
    const r = summarizeR([{ id: 1, closedAt: day(1), r: '2', netPnl: '50' }]);
    expect(r.count).toBe(1);
    expect(r.winRate).toBe('1.00000000');
    expect(r.expectancyR).toBe('2.00000000');
    expect(r.profitFactorR).toBeNull(); // no losing R: undefined, not 0 and not infinity
    expect(r.maxDrawdownR).toBe('0.00000000');
    expect(r.longestWinStreak).toBe(1);
    expect(r.longestLossStreak).toBe(0);
    expect(r.rCurve).toEqual([{ id: '1', closedAt: day(1), r: '2.00000000', cumR: '2.00000000' }]);
  });

  it('golden mixed series (hand computed)', () => {
    // r: +2, −1, −1, +3, −1 ; netPnl = 20 × r
    // wins 2 / 5 = 0.4 ; ΣR = 2 → expectancy 0.4 ; PF = (2 + 3) / 3 = 1.666666666… → 1.66666667
    // C: 0 → 2, 1, 0, 3, 2 ; peaks 2,2,2,3,3 ; DD = max(0,1,2,0,1) = 2
    // USDT: Σ = 40, avg 8, PF 100/60, cum 40,20,0,60,40 → DD 40 ; streaks W L L W L → win 1, loss 2
    const series: RSeriesItem[] = [2, -1, -1, 3, -1].map((r, i) => ({ id: i + 1, closedAt: day(i + 1), r: String(r), netPnl: String(20 * r) }));
    const out = summarizeR(series);
    expect(out).toMatchObject({
      count: 5,
      countWithR: 5,
      wins: 2,
      losses: 3,
      breakevens: 0,
      winRate: '0.40000000',
      totalR: '2.00000000',
      expectancyR: '0.40000000',
      avgWinR: '2.50000000',
      avgLossR: '-1.00000000',
      profitFactorR: '1.66666667',
      maxDrawdownR: '2.00000000',
      totalNetPnl: '40.00000000',
      avgNetPnl: '8.00000000',
      profitFactorUsdt: '1.66666667',
      maxDrawdownUsdt: '40.00000000',
      longestWinStreak: 1,
      longestLossStreak: 2,
    });
    expect(out.rCurve.map((p) => p.cumR)).toEqual(['2.00000000', '1.00000000', '0.00000000', '3.00000000', '2.00000000']);
  });

  it('all losses: PF 0, drawdown from C_0 = 0', () => {
    // r: −1, −0.5, −1 → Σ −2.5 ; expectancy −2.5 / 3 = −0.833333333… → −0.83333333 ; C: −1, −1.5, −2.5 → DD 2.5
    const out = summarizeR([
      { id: 1, closedAt: day(1), r: '-1', netPnl: '-10' },
      { id: 2, closedAt: day(2), r: '-0.5', netPnl: '-5' },
      { id: 3, closedAt: day(3), r: '-1', netPnl: '-10' },
    ]);
    expect(out).toMatchObject({
      winRate: '0.00000000',
      totalR: '-2.50000000',
      expectancyR: '-0.83333333',
      avgWinR: null,
      avgLossR: '-0.83333333',
      profitFactorR: '0.00000000',
      maxDrawdownR: '2.50000000',
      profitFactorUsdt: '0.00000000',
      maxDrawdownUsdt: '25.00000000',
      longestWinStreak: 0,
      longestLossStreak: 3,
    });
  });

  it('the cumulative R curve starts at 0 (R convention §1.1)', () => {
    // all wins: C = 1, 3 → DD 0
    expect(summarizeR([
      { id: 1, closedAt: day(1), r: '1', netPnl: null },
      { id: 2, closedAt: day(2), r: '2', netPnl: null },
    ]).maxDrawdownR).toBe('0.00000000');
    // starts with a loss: C_0 = 0, C_1 = −1, C_2 = 2 → DD = 0 − (−1) = 1 (a curve starting at C_1 would say 0)
    expect(summarizeR([
      { id: 1, closedAt: day(1), r: '-1', netPnl: null },
      { id: 2, closedAt: day(2), r: '3', netPnl: null },
    ]).maxDrawdownR).toBe('1.00000000');
  });

  it('entries without R count in USDT stats and outcomes only', () => {
    // #1 no stop, +10 USDT → WIN by net PnL ; #2 R −1, −5 USDT
    const out = summarizeR([
      { id: 1, closedAt: day(1), r: null, netPnl: '10' },
      { id: 2, closedAt: day(2), r: '-1', netPnl: '-5' },
    ]);
    expect(out).toMatchObject({
      count: 2,
      countWithR: 1,
      countWithNetPnl: 2,
      wins: 1,
      losses: 1,
      winRate: '0.50000000',
      totalR: '-1.00000000',
      expectancyR: '-1.00000000',
      profitFactorR: '0.00000000',
      totalNetPnl: '5.00000000',
      profitFactorUsdt: '2.00000000', // 10 / 5
    });
    expect(out.rCurve).toHaveLength(1);
    expect(out.pnlCurve.map((p) => p.cumNetPnl)).toEqual(['10.00000000', '5.00000000']);
  });

  it('a breakeven breaks both streaks and stays in the win-rate denominator', () => {
    // W BE W L BE L → longest win 1, loss 1 ; win rate 2 / 6 = 0.333333333… → 0.33333333
    const out = summarizeR(['1', '0', '1', '-1', '0', '-1'].map((r, i) => ({ id: i + 1, closedAt: day(i + 1), r, netPnl: null })));
    expect(out).toMatchObject({ wins: 2, losses: 2, breakevens: 2, winRate: '0.33333333', longestWinStreak: 1, longestLossStreak: 1 });
  });

  it('rejects unsorted input and repeated keys; same close time is ordered by id', () => {
    const t = day(5);
    // numeric ids compare as numbers: 9 < 10 (text order would say "10" < "9")
    expect(summarizeR([{ id: '9', closedAt: t, r: '1', netPnl: null }, { id: '10', closedAt: t, r: '1', netPnl: null }]).count).toBe(2);
    expect(() => summarizeR([{ id: '10', closedAt: t, r: '1', netPnl: null }, { id: '9', closedAt: t, r: '1', netPnl: null }])).toThrow(/not sorted/);
    expect(() => summarizeR([{ id: 1, closedAt: day(2), r: '1', netPnl: null }, { id: 2, closedAt: day(1), r: '1', netPnl: null }])).toThrow(/not sorted/);
    expect(() => summarizeR([{ id: 1, closedAt: t, r: '1', netPnl: null }, { id: 1, closedAt: t, r: '1', netPnl: null }])).toThrow(/not sorted/);
    // uuids compare as text (PostgreSQL uuid order for canonical lowercase)
    const a = '0b6f3c1e-0000-4000-8000-000000000000';
    const b = 'a1c2d3e4-0000-4000-8000-000000000000';
    expect(summarizeR([{ id: a, closedAt: t, r: '1', netPnl: null }, { id: b, closedAt: t, r: '1', netPnl: null }]).count).toBe(2);
    expect(compareRecordIds(b, a)).toBe(1);
    expect(compareCloseKey({ closedAt: t, id: 9 }, { closedAt: t, id: '10' })).toBe(-1);
  });

  it('orders by sub-millisecond digits of ISO strings (PostgreSQL keeps microseconds)', () => {
    const early = { id: 'b', closedAt: '2026-10-13T10:00:00.123400Z', r: '1', netPnl: null };
    const late = { id: 'a', closedAt: '2026-10-13T10:00:00.123700Z', r: '1', netPnl: null };
    expect(summarizeR([early, late]).count).toBe(2);
    expect(() => summarizeR([late, early])).toThrow(/not sorted/);
  });

  it('accepts only R from rMultiple (≤ 8 dp) and money at ≤ 8 dp; an item needs R or net PnL', () => {
    expect(() => summarizeR([{ id: 1, closedAt: day(1), r: '0.123456789', netPnl: null }])).toThrow(/rMultiple/);
    expect(() => summarizeR([{ id: 1, closedAt: day(1), r: null, netPnl: '1.000000001' }])).toThrow();
    expect(() => summarizeR([{ id: 1, closedAt: day(1), r: null, netPnl: null }])).toThrow();
    expect(() => summarizeR([{ id: 1, closedAt: 'not a date', r: '1', netPnl: null }])).toThrow();
  });
});

describe('one R for journal and signals (R convention §3)', () => {
  it('the journal path and a signal-style direct call give the same R for the same numbers', () => {
    // Spot entry: BUY 2 @ 100 (fee 0.002 base), SELL 1.998 @ 104 (fee 0.207792). Initial stop 98.
    // net = 207.792 − 0.207792 − 200 = 7.584208 ; risk = |100 − 98| × 2 = 4 ; R = 1.896052
    const rules = { stepSize: '0.001', minNotional: '5' };
    const a = allocateSpotFill(null, { id: 1, side: 'BUY', price: '100', quantity: '2', quoteQty: '200', fee: '0.002', createdAt: day(1) }, rules);
    const b = allocateSpotFill(a.newState, { id: 2, side: 'SELL', price: '104', quantity: '1.998', quoteQty: '207.792', fee: '0.207792', createdAt: day(2) }, rules);
    const journal = computeEntryResult(b.newState!, { initialStop: '98' });
    const direct = rMultiple({ netPnl: '7.584208', risk: riskAmount({ entryPrice: '100', stopPrice: '98', quantity: '2' }) });
    expect(journal.netPnl).toBe('7.58420800');
    expect(journal.rMultiple).toBe('1.89605200');
    expect(s(direct)).toBe(journal.rMultiple);

    // Futures SHORT: open 2 @ 100, cover 2 @ 90, realized 20, fees 0.19, funding −0.01 → net 19.8 ; stop 105 → risk 10 → R 1.98
    const fut = futuresEntryResult(
      {
        side: 'SHORT', status: 'CLOSED', quantity: '0', realizedPnl: '20', fees: '0.19', funding: '-0.01',
        openedAt: day(1), closedAt: day(2), closeReason: 'USER',
        legs: [{ leg: 'OPEN', price: '100', qty: '2' }, { leg: 'CLOSE', price: '90', qty: '2' }],
      },
      { initialStop: '105' },
    );
    const signalLike = rMultiple({ netPnl: pnl('SHORT', new Dec(100), new Dec(90), new Dec(2)).sub('0.19').sub('0.01'), risk: riskAmount({ entryPrice: '100', stopPrice: '105', quantity: '2' }) });
    expect(fut.rMultiple).toBe('1.98000000');
    expect(s(signalLike)).toBe(fut.rMultiple);
  });

  it('journal stats summary is exactly summarizeR of the same series', () => {
    const entries = [
      { id: 'e1', closedAt: day(1), r: '1.5', netPnl: '30' },
      { id: 'e2', closedAt: day(2), r: null, netPnl: '-4' },
      { id: 'e3', closedAt: day(3), r: '-1', netPnl: '-20' },
    ];
    const viaJournal = computeJournalStats(
      entries.map((e) => ({ id: e.id, status: 'CLOSED' as const, needsReview: false, closedAt: e.closedAt, market: 'SPOT' as const, symbol: 'BTCUSDT', direction: 'LONG' as const, setup: null, mistakes: [], netPnl: e.netPnl, rMultiple: e.r })),
    ).summary;
    expect(viaJournal).toEqual(summarizeR(entries));
  });
});
