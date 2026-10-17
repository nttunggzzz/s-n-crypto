/**
 * Trading-volume / tax-withheld fixtures (0.19.0) - UI development only. The numbers of the demo user are computed by hand
 * from the fixture fills (`fixtureMyTrades`, as of 2026-10-09T03:00Z = 10:00 GMT+7) and checked in mocks-account-stats.test.ts:
 *   Oct 9 BUY 999.9875 + BUY 280.02 = 1280.0075 (today, 7d, 30d, this month); Sep 20 SELL 612.5 (previous month, 30d only).
 * The mock resolver `accountTradingStats` does NOT return this constant: it computes the same figures from the mock store.
 */
import type { AccountTradingStats, TaxCategory, TaxMode, VolumeBucket } from '../index.ts';

const ZERO_BUCKET: VolumeBucket = { spot: '0.00000000', futures: '0.00000000', total: '0.00000000', fills: 0 };

/** Nothing traded, nothing withheld: the honest answer for a user without fills. */
export function fixtureEmptyTradingStats(asOf: string, month: string, previousMonth: string, taxMode: TaxMode = 'OFF', category: TaxCategory = 'INDIVIDUAL'): AccountTradingStats {
  return {
    asOf,
    volume: { today: ZERO_BUCKET, last7d: ZERO_BUCKET, last30d: ZERO_BUCKET, thisMonth: ZERO_BUCKET, previousMonth: ZERO_BUCKET, excludedNonUsdtFills: 0 },
    tax: {
      taxMode,
      category,
      thisMonth: { month, withheldCount: 0, withheldAmount: '0.00000000' },
      previousMonth: { month: previousMonth, withheldCount: 0, withheldAmount: '0.00000000' },
    },
  };
}

/** The demo user as of 2026-10-09T03:00:00Z (mock tax starts in WITHHOLD). */
export const fixtureAccountTradingStats: AccountTradingStats = {
  asOf: '2026-10-09T03:00:00.000Z',
  volume: {
    today: { spot: '1280.00750000', futures: '0.00000000', total: '1280.00750000', fills: 2 },
    last7d: { spot: '1280.00750000', futures: '0.00000000', total: '1280.00750000', fills: 2 },
    last30d: { spot: '1892.50750000', futures: '0.00000000', total: '1892.50750000', fills: 3 },
    thisMonth: { spot: '1280.00750000', futures: '0.00000000', total: '1280.00750000', fills: 2 },
    previousMonth: { spot: '612.50000000', futures: '0.00000000', total: '612.50000000', fills: 1 },
    excludedNonUsdtFills: 0,
  },
  tax: {
    taxMode: 'WITHHOLD',
    category: 'INDIVIDUAL',
    thisMonth: { month: '2026-10', withheldCount: 0, withheldAmount: '0.00000000' },
    previousMonth: { month: '2026-09', withheldCount: 1, withheldAmount: '0.61250000' },
  },
};
