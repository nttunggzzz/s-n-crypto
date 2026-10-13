import { describe, expect, it } from 'vitest';
import { computeJournalStats, isoWeekdayAt, type JournalStatsEntryInput } from './journalStats.ts';
import { summarizeR } from './rMetrics.ts';

const entry = (o: Partial<JournalStatsEntryInput> & Pick<JournalStatsEntryInput, 'id' | 'closedAt'>): JournalStatsEntryInput => ({
  status: 'CLOSED',
  needsReview: false,
  market: 'SPOT',
  symbol: 'BTCUSDT',
  direction: 'LONG',
  setup: null,
  mistakes: [],
  netPnl: '0',
  rMultiple: null,
  ...o,
});

// 2026-10-05 is a Monday. 03:00 UTC = 10:00 GMT+7, same day.
const GOLDEN: JournalStatsEntryInput[] = [
  entry({ id: 'e1', closedAt: '2026-10-05T03:00:00.000Z', setup: 'breakout', mistakes: ['FOMO'], netPnl: '-20', rMultiple: '-1' }),
  entry({ id: 'e2', closedAt: '2026-10-06T03:00:00.000Z', market: 'FUTURES', symbol: 'ETHUSDT', direction: 'SHORT', setup: 'breakout', mistakes: ['FOMO', 'OVERSIZE'], netPnl: '-48', rMultiple: '-2.4' }),
  entry({ id: 'e3', closedAt: '2026-10-07T03:00:00.000Z', setup: 'pullback', netPnl: '60', rMultiple: '3' }),
  entry({ id: 'e4', closedAt: '2026-10-08T03:00:00.000Z', symbol: 'SOLUSDT', mistakes: ['LATE_ENTRY'], netPnl: '5', rMultiple: null }),
];

describe('computeJournalStats (Module A §2.5)', () => {
  it('basis ACTUAL_FILLS, R metrics version, golden summary', () => {
    const s = computeJournalStats(GOLDEN);
    expect(s.basis).toBe('ACTUAL_FILLS');
    expect(s.rMetricsVersion).toBe(1);
    expect(s.excluded).toEqual({ void: 0, needsReview: 0 });
    // R: −1, −2.4, +3 (e4 has none) → Σ −0.4, expectancy −0.4/3 = −0.1333… ; PF 3 / 3.4 = 0.882352941… ; C −1, −3.4, −0.4 → DD 3.4
    // outcomes: L, L, W, W (e4 by net PnL) → win rate 0.5
    // USDT: Σ −3 ; PF 65 / 68 = 0.955882352… ; cum −20, −68, −8, −3 → DD 68
    expect(s.summary).toMatchObject({
      count: 4,
      countWithR: 3,
      wins: 2,
      losses: 2,
      winRate: '0.50000000',
      totalR: '-0.40000000',
      expectancyR: '-0.13333333',
      profitFactorR: '0.88235294',
      maxDrawdownR: '3.40000000',
      totalNetPnl: '-3.00000000',
      profitFactorUsdt: '0.95588235',
      maxDrawdownUsdt: '68.00000000',
      longestLossStreak: 2,
      longestWinStreak: 2,
    });
  });

  it('groups by mistake: an entry with several mistakes counts in each ("FOMO cost you 3.4R")', () => {
    const { byMistake } = computeJournalStats(GOLDEN);
    expect(byMistake.map((g) => [g.key, g.count, g.totalR, g.totalNetPnl])).toEqual([
      ['FOMO', 2, '-3.40000000', '-68.00000000'], // −1 − 2.4 ; −20 − 48
      ['LATE_ENTRY', 1, null, '5.00000000'], // no R: USDT only
      ['OVERSIZE', 1, '-2.40000000', '-48.00000000'],
    ]);
  });

  it('groups by setup (no setup last), symbol, market, direction', () => {
    const s = computeJournalStats(GOLDEN);
    expect(s.bySetup.map((g) => [g.key, g.count, g.totalR, g.winRate])).toEqual([
      ['breakout', 2, '-3.40000000', '0.00000000'],
      ['pullback', 1, '3.00000000', '1.00000000'],
      [null, 1, null, '1.00000000'],
    ]);
    expect(s.bySymbol.map((g) => [g.key, g.count, g.totalR, g.totalNetPnl])).toEqual([
      ['BTCUSDT', 2, '2.00000000', '40.00000000'], // −1 + 3 ; −20 + 60
      ['ETHUSDT', 1, '-2.40000000', '-48.00000000'],
      ['SOLUSDT', 1, null, '5.00000000'],
    ]);
    expect(s.byMarket.map((g) => [g.key, g.count])).toEqual([['FUTURES', 1], ['SPOT', 3]]);
    expect(s.byDirection.map((g) => [g.key, g.count, g.expectancyR])).toEqual([
      ['LONG', 3, '1.00000000'], // (−1 + 3) / 2 entries with R
      ['SHORT', 1, '-2.40000000'],
    ]);
    expect(s.byWeekday.map((g) => g.key)).toEqual([1, 2, 3, 4]); // Mon … Thu at GMT+7
  });

  it('weekday at GMT+7: 23:30 UTC on Monday is already Tuesday in Vietnam', () => {
    const t = '2026-10-12T23:30:00.000Z'; // Monday 23:30 UTC = Tuesday 06:30 GMT+7
    expect(isoWeekdayAt(t, 0)).toBe(1);
    expect(isoWeekdayAt(t, 420)).toBe(2);
    const one = [entry({ id: 'x', closedAt: t, netPnl: '1', rMultiple: '0.5' })];
    expect(computeJournalStats(one).byWeekday.map((g) => g.key)).toEqual([2]);
    expect(computeJournalStats(one, { weekdayUtcOffsetMinutes: 0 }).byWeekday.map((g) => g.key)).toEqual([1]);
    expect(isoWeekdayAt('2026-10-11T12:00:00.000Z', 420)).toBe(7); // Sunday
  });

  it('excludes VOID and needsReview entries from every number and counts them', () => {
    const withExcluded = [
      entry({ id: 'v1', status: 'VOID', closedAt: null, netPnl: null, rMultiple: null }), // voided while open (reset)
      GOLDEN[0]!,
      entry({ id: 'n1', closedAt: '2026-10-05T04:00:00.000Z', needsReview: true, netPnl: '999', rMultiple: '9' }),
      GOLDEN[1]!,
      entry({ id: 'v2', status: 'VOID', needsReview: true, closedAt: '2026-10-01T00:00:00.000Z', netPnl: '7', rMultiple: '1' }), // VOID wins
      GOLDEN[2]!,
      GOLDEN[3]!,
    ];
    const s = computeJournalStats(withExcluded);
    expect(s.excluded).toEqual({ void: 2, needsReview: 1 });
    expect(s).toEqual({ ...computeJournalStats(GOLDEN), excluded: { void: 2, needsReview: 1 } });
  });

  it('a mistake listed twice on one entry counts once', () => {
    const s = computeJournalStats([entry({ id: 'a', closedAt: '2026-10-05T03:00:00.000Z', mistakes: ['FOMO', 'FOMO'], netPnl: '-10', rMultiple: '-1' })]);
    expect(s.byMistake).toEqual([expect.objectContaining({ key: 'FOMO', count: 1, totalR: '-1.00000000' })]);
  });

  it('empty input: null metrics, no groups', () => {
    const s = computeJournalStats([]);
    expect(s.summary).toEqual(summarizeR([]));
    expect(s.summary.expectancyR).toBeNull();
    expect([s.bySetup, s.bySymbol, s.byMarket, s.byDirection, s.byWeekday, s.byMistake]).toEqual([[], [], [], [], [], []]);
  });

  it('refuses OPEN entries, CLOSED entries without data, and an unsorted series', () => {
    expect(() => computeJournalStats([{ ...GOLDEN[0]!, status: 'OPEN' as never }])).toThrow(/only CLOSED/);
    expect(() => computeJournalStats([{ ...GOLDEN[0]!, netPnl: null }])).toThrow(/netPnl/);
    expect(() => computeJournalStats([GOLDEN[1]!, GOLDEN[0]!])).toThrow(/not sorted/);
    expect(() => computeJournalStats(GOLDEN, { weekdayUtcOffsetMinutes: 2000 })).toThrow();
  });
});
