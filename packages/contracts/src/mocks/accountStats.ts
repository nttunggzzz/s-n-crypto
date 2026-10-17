/**
 * ⚠️ Mock resolver of the profile numbers (0.19.0) - UI development only.
 * Computed from the mock store with the server's rules ("mock = server"): quoteQty of the user's own fills, USDT-quoted
 * pairs only, windows in GMT+7 (days: today + the previous 6 / 29; months: the 1st 00:00 GMT+7), tax = the sum of the
 * withholding records of the month. A user without fills gets zeros - nothing is invented.
 */
import { dec, toFixedStr, ZERO, type Dec } from '@cex/core';
import type { AccountTradingStats, TaxCategory, VolumeBucket } from '../index.ts';
import { fixtureExchangeInfo, fixtureMe } from '../fixtures/index.ts';
import { requireUser, type Resolver } from './common.ts';
import { mockStore } from './store.ts';

const VN_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

/** 00:00 GMT+7 of the day that contains `ms`, as a UTC instant. */
const vnDayStart = (ms: number): number => Math.floor((ms + VN_OFFSET_MS) / DAY_MS) * DAY_MS - VN_OFFSET_MS;
/** 00:00 GMT+7 on the 1st of month `month` (1..12; 0 = December of the year before) of `year`, as a UTC instant. */
const vnMonthStart = (year: number, month: number): number => Date.UTC(year, month - 1, 1) - VN_OFFSET_MS;
const monthLabel = (year: number, month: number): string => new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 7);

interface Fill {
  at: number;
  quote: Dec;
}

const quoteAssetOf = (symbol: string): string | undefined => fixtureExchangeInfo.symbols.find((s) => s.symbol === symbol)?.quoteAsset;

function bucket(spot: Fill[], futures: Fill[], from: number, to = Infinity): VolumeBucket {
  const inWin = (f: Fill) => f.at >= from && f.at < to;
  const s = spot.filter(inWin);
  const f = futures.filter(inWin);
  const sum = (rows: Fill[]) => rows.reduce((acc, r) => acc.add(r.quote), ZERO);
  const spotSum = sum(s);
  const futuresSum = sum(f);
  return { spot: toFixedStr(spotSum), futures: toFixedStr(futuresSum), total: toFixedStr(spotSum.add(futuresSum)), fills: s.length + f.length };
}

/** The numbers of one user as of `nowMs`. Only the demo user (the signed-in mock user) has fills in the mock store. */
export function mockTradingStatsOf(userId: string, nowMs: number): AccountTradingStats {
  const isDemo = userId === fixtureMe.id;
  const spotAll = isDemo ? mockStore.trades : [];
  const spot: Fill[] = spotAll.filter((t) => quoteAssetOf(t.symbol) === 'USDT').map((t) => ({ at: Date.parse(t.createdAt), quote: dec(t.quoteQty) }));
  const futures: Fill[] = (isDemo ? mockStore.futures.trades : []).map((t) => ({ at: Date.parse(t.createdAt), quote: dec(t.quoteQty) }));

  const today = vnDayStart(nowMs);
  const d = new Date(nowMs + VN_OFFSET_MS);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const thisStart = vnMonthStart(year, month);
  const prevStart = vnMonthStart(year, month - 1);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const last30 = today - 29 * DAY_MS;

  const records = mockStore.tax.withholdings.filter((w) => w.userId === userId);
  const tax = (from: number, to: number, label: string) => {
    const rows = records.filter((w) => Date.parse(w.createdAt) >= from && Date.parse(w.createdAt) < to);
    return { month: label, withheldCount: rows.length, withheldAmount: toFixedStr(rows.reduce((acc, w) => acc.add(dec(w.taxAmount)), ZERO)) };
  };
  const category: TaxCategory = isDemo ? mockStore.tax.category : 'INDIVIDUAL';

  return {
    asOf: new Date(nowMs).toISOString(),
    volume: {
      today: bucket(spot, futures, today),
      last7d: bucket(spot, futures, today - 6 * DAY_MS),
      last30d: bucket(spot, futures, last30),
      thisMonth: bucket(spot, futures, thisStart),
      previousMonth: bucket(spot, futures, prevStart, thisStart),
      excludedNonUsdtFills: spotAll.filter((t) => quoteAssetOf(t.symbol) !== 'USDT' && Date.parse(t.createdAt) >= last30).length,
    },
    tax: {
      taxMode: mockStore.tax.settings.taxMode,
      category,
      thisMonth: tax(thisStart, Infinity, monthLabel(year, month)),
      previousMonth: tax(prevStart, thisStart, monthLabel(prevYear, prevMonth)),
    },
  };
}

export const accountStatsResolvers: { accountTradingStats: Resolver<'accountTradingStats'> } = {
  accountTradingStats: () => {
    requireUser();
    return mockTradingStatsOf(fixtureMe.id, Date.now());
  },
};
