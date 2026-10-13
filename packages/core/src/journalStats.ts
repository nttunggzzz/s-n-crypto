import { type PositionSide } from './futures.ts';
import {
  R_METRICS_VERSION,
  recordIdText,
  summarizeR,
  timeKey,
  type DecLike,
  type RSeriesItem,
  type RSummary,
  type RecordId,
  type TimeLike,
} from './rMetrics.ts';

/**
 * Personal statistics of the trading journal (Module A §2.5, basis ACTUAL_FILLS — real fills only, never signals).
 * Every number comes from `summarizeR` (rMetrics.ts); nothing here re-implements a formula.
 */

/** One journal entry as the stats query returns it (decimal fields: decimal strings or Dec). */
export interface JournalStatsEntryInput {
  id: RecordId;
  /** OPEN entries must not be passed (throws). VOID entries are excluded and counted in `excluded.void`. */
  status: 'CLOSED' | 'VOID';
  /** excluded and counted in `excluded.needsReview` (unless VOID, which takes precedence) */
  needsReview: boolean;
  /** required for CLOSED */
  closedAt: TimeLike | null;
  market: 'SPOT' | 'FUTURES';
  symbol: string;
  direction: PositionSide;
  setup: string | null;
  mistakes: readonly string[];
  /** required for CLOSED (8 dp) */
  netPnl: DecLike | null;
  /** from rMultiple; null when the entry has no initial stop (still counted in USDT stats) */
  rMultiple: DecLike | null;
}

export interface JournalStatsOptions {
  /** offset used for the weekday grouping, minutes east of UTC; default 420 (GMT+7, Vietnam, no DST) */
  weekdayUtcOffsetMinutes?: number;
}

/** Compact statistics of one group, taken from `summarizeR` of the group's entries (same order). */
export interface JournalGroupStats<K> {
  key: K;
  count: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: string | null;
  countWithR: number;
  totalR: string | null;
  expectancyR: string | null;
  profitFactorR: string | null;
  totalNetPnl: string | null;
}

export interface JournalStatsResult {
  basis: 'ACTUAL_FILLS';
  rMetricsVersion: typeof R_METRICS_VERSION;
  /** entries left out of every number below (shown separately, never hidden) */
  excluded: { void: number; needsReview: number };
  weekdayUtcOffsetMinutes: number;
  summary: RSummary;
  /** key null = entries without a setup */
  bySetup: JournalGroupStats<string | null>[];
  bySymbol: JournalGroupStats<string>[];
  byMarket: JournalGroupStats<'SPOT' | 'FUTURES'>[];
  byDirection: JournalGroupStats<PositionSide>[];
  /** ISO weekday of closedAt at the offset: 1 = Monday … 7 = Sunday */
  byWeekday: JournalGroupStats<number>[];
  /** an entry with several mistakes counts once in each of them ("FOMO cost you 3.4R") */
  byMistake: JournalGroupStats<string>[];
}

/** ISO weekday (1 = Monday … 7 = Sunday) of `t` at a fixed UTC offset. */
export function isoWeekdayAt(t: TimeLike, utcOffsetMinutes: number): number {
  const day = new Date(timeKey(t, 'closedAt').ms + utcOffsetMinutes * 60_000).getUTCDay();
  return day === 0 ? 7 : day;
}

function group<K>(key: K, items: RSeriesItem[]): JournalGroupStats<K> {
  const s = summarizeR(items);
  return {
    key,
    count: s.count,
    wins: s.wins,
    losses: s.losses,
    breakevens: s.breakevens,
    winRate: s.winRate,
    countWithR: s.countWithR,
    totalR: s.totalR,
    expectancyR: s.expectancyR,
    profitFactorR: s.profitFactorR,
    totalNetPnl: s.totalNetPnl,
  };
}

function compareKeys(a: string | number | null, b: string | number | null): number {
  if (a === b) return 0;
  if (a === null) return 1; // "no setup" last
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

function groupBy<K extends string | number | null>(items: { item: RSeriesItem; keys: K[] }[]): JournalGroupStats<K>[] {
  const map = new Map<K, RSeriesItem[]>();
  for (const { item, keys } of items) {
    for (const k of keys) {
      const list = map.get(k);
      if (list) list.push(item);
      else map.set(k, [item]);
    }
  }
  return [...map.keys()].sort(compareKeys).map((k) => group(k, map.get(k)!));
}

/**
 * Journal statistics of one user (Module A §2.5, §2.7 `journalStats`).
 * - Input: the entries in range, sorted ascending by (closedAt, id) as `summarizeR` requires (VOID / needsReview
 *   entries may sit anywhere: they are removed first and only counted).
 * - Only CLOSED entries that are not needsReview enter the numbers. Entries without R still count in USDT stats.
 * - Groups: setup, symbol, market, direction, weekday at GMT+7, mistake — each via `summarizeR` (count, total R, total USDT …).
 */
export function computeJournalStats(closedEntries: readonly JournalStatsEntryInput[], opts: JournalStatsOptions = {}): JournalStatsResult {
  const offset = opts.weekdayUtcOffsetMinutes ?? 420;
  if (!Number.isInteger(offset) || Math.abs(offset) > 14 * 60) throw new Error('weekdayUtcOffsetMinutes must be an integer within ±840');
  let voided = 0;
  let review = 0;
  const kept: { e: JournalStatsEntryInput; item: RSeriesItem }[] = [];
  for (const e of closedEntries) {
    if (e.status === 'VOID') {
      voided++;
      continue;
    }
    if (e.status !== 'CLOSED') throw new Error(`computeJournalStats: entry ${String(e.id)} is ${String(e.status)} — only CLOSED/VOID entries`);
    if (e.needsReview) {
      review++;
      continue;
    }
    if (e.closedAt === null || e.netPnl === null) throw new Error(`computeJournalStats: CLOSED entry ${String(e.id)} needs closedAt and netPnl`);
    kept.push({ e, item: { id: recordIdText(e.id), closedAt: e.closedAt, r: e.rMultiple, netPnl: e.netPnl } });
  }
  const summary = summarizeR(kept.map((k) => k.item)); // also rejects an unsorted series
  return {
    basis: 'ACTUAL_FILLS',
    rMetricsVersion: R_METRICS_VERSION,
    excluded: { void: voided, needsReview: review },
    weekdayUtcOffsetMinutes: offset,
    summary,
    bySetup: groupBy(kept.map(({ e, item }) => ({ item, keys: [e.setup] }))),
    bySymbol: groupBy(kept.map(({ e, item }) => ({ item, keys: [e.symbol] }))),
    byMarket: groupBy(kept.map(({ e, item }) => ({ item, keys: [e.market] }))),
    byDirection: groupBy(kept.map(({ e, item }) => ({ item, keys: [e.direction] }))),
    byWeekday: groupBy(kept.map(({ e, item }) => ({ item, keys: [isoWeekdayAt(e.closedAt!, offset)] }))),
    byMistake: groupBy(kept.map(({ e, item }) => ({ item, keys: [...new Set(e.mistakes)] }))),
  };
}
