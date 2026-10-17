import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { dec } from '@cex/core';
import { AccountTradingStats, AdminUserDetail, ApiError, createApiClient, endpoints } from '../index.ts';
import { fixtureAccountTradingStats, fixtureAdminUserDetail, fixtureAdminUsers, fixtureMe } from '../fixtures/index.ts';
import { createMockHandlers, mockStore, resetMockStore, setMockRole, setMockTax } from './index.ts';
import { mockTradingStatsOf } from './accountStats.ts';

const BASE = 'http://mock.local';
const server = setupServer(...createMockHandlers({ baseUrl: BASE, latencyMs: 0 }));
// validateResponses: every mock response must match the contract schema
const api = createApiClient({ baseUrl: BASE, validateResponses: true });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  resetMockStore();
  setMockRole('user', false);
});
afterAll(() => server.close());

const AS_OF = Date.parse('2026-10-09T03:00:00.000Z');
const zero = { spot: '0.00000000', futures: '0.00000000', total: '0.00000000', fills: 0 };

describe('account trading stats (0.20.0)', () => {
  it('the endpoint is GET /api/v1/account/stats for a signed-in user, and the schemas reject numbers and negative counts', () => {
    expect(endpoints.accountTradingStats).toMatchObject({ method: 'GET', path: '/api/v1/account/stats', auth: 'user' });
    expect(AccountTradingStats.safeParse(fixtureAccountTradingStats).success).toBe(true);
    expect(AccountTradingStats.safeParse({ ...fixtureAccountTradingStats, volume: { ...fixtureAccountTradingStats.volume, today: { ...zero, spot: 0 } } }).success).toBe(false);
    expect(AccountTradingStats.safeParse({ ...fixtureAccountTradingStats, volume: { ...fixtureAccountTradingStats.volume, excludedNonUsdtFills: -1 } }).success).toBe(false);
    expect(AccountTradingStats.safeParse({ ...fixtureAccountTradingStats, tax: { ...fixtureAccountTradingStats.tax, thisMonth: { month: '2026-13', withheldCount: 0, withheldAmount: '0' } } }).success).toBe(false);
    // AdminUserDetail needs the new field
    const { trading: _t, ...noTrading } = fixtureAdminUserDetail(fixtureMe.id)!;
    expect(AdminUserDetail.safeParse(noTrading).success).toBe(false);
  });

  it('the fixture for the demo user is what the rules give (hand-computed: Oct 9 BUYs 999.9875 + 280.02, the Sep 20 SELL 612.5)', () => {
    expect(mockTradingStatsOf(fixtureMe.id, AS_OF)).toEqual(fixtureAccountTradingStats);
    expect(fixtureAccountTradingStats.volume.last30d.total).toBe('1892.50750000'); // 1280.0075 + 612.5
    expect(fixtureAccountTradingStats.volume.previousMonth.total).toBe('612.50000000');
  });

  it('boundaries are GMT+7: the same fills seen at 23:59:59.999 and 00:00:00.000 on the next day', () => {
    // the two Oct 9 BUYs happened at 09:00 and 09:35 GMT+7; "now" 2026-10-09T16:59:59.999Z is 23:59:59.999 GMT+7 the same day
    const lastMs = mockTradingStatsOf(fixtureMe.id, Date.parse('2026-10-09T16:59:59.999Z'));
    expect(lastMs.volume.today.fills).toBe(2);
    const nextDay = mockTradingStatsOf(fixtureMe.id, Date.parse('2026-10-09T17:00:00.000Z')); // 00:00:00.000 on Oct 10
    expect(nextDay.volume.today).toEqual(zero);
    expect(nextDay.volume.last7d.total).toBe('1280.00750000');
    // month turn: at 2026-10-31T17:00Z it is 1 Nov in GMT+7 - October becomes "previous month"
    const nov = mockTradingStatsOf(fixtureMe.id, Date.parse('2026-10-31T17:00:00.000Z'));
    expect(nov.tax.thisMonth.month).toBe('2026-11');
    expect(nov.tax.previousMonth.month).toBe('2026-10');
    expect(nov.volume.previousMonth.total).toBe('1280.00750000');
    expect(nov.volume.thisMonth).toEqual(zero);
    // January: the previous month is December of the year before
    expect(mockTradingStatsOf(fixtureMe.id, Date.parse('2027-01-15T00:00:00.000Z')).tax.previousMonth.month).toBe('2026-12');
  });

  it('through the HTTP mock: validated response, honest zeros without fills, and a new fill shows up', async () => {
    const s = await api.accountTradingStats();
    expect(s.tax.taxMode).toBe('WITHHOLD'); // mock tax starts on
    expect(s.volume.today.fills).toBe(0); // the fixture fills are from Oct 2026, not "today"

    resetMockStore('empty');
    setMockRole('user', false);
    const e = await api.accountTradingStats();
    expect(e.volume).toEqual({ today: zero, last7d: zero, last30d: zero, thisMonth: zero, previousMonth: zero, excludedNonUsdtFills: 0 });
    expect(e.tax.thisMonth.withheldCount).toBe(0);

    const buy = await api.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.001' } });
    const after = await api.accountTradingStats();
    expect(after.volume.today).toEqual({ spot: buy.fills[0]!.quoteQty, futures: '0.00000000', total: buy.fills[0]!.quoteQty, fills: 1 });
  });

  it('a withheld SELL raises this month tax by exactly Trade.tax; a DOMESTIC_ORG sale withholds nothing', async () => {
    const before = await api.accountTradingStats();
    const sell = await api.placeOrder({ body: { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.001' } });
    const tax = sell.fills[0]!.tax;
    expect(dec(tax).gt(0)).toBe(true);
    const after = await api.accountTradingStats();
    expect(after.tax.thisMonth.withheldCount).toBe(before.tax.thisMonth.withheldCount + 1);
    expect(dec(after.tax.thisMonth.withheldAmount).sub(before.tax.thisMonth.withheldAmount).toFixed(8)).toBe(tax);

    setMockTax({ category: 'DOMESTIC_ORG' });
    const org = await api.placeOrder({ body: { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.001' } });
    expect(org.fills[0]!.tax).toBe('0.00000000');
    const later = await api.accountTradingStats();
    expect(later.tax.category).toBe('DOMESTIC_ORG');
    expect(later.tax.thisMonth).toEqual(after.tax.thisMonth);
    expect(later.volume.today.fills).toBe(after.volume.today.fills + 1);
  });

  it('a signed-out caller is refused', async () => {
    mockStore.signedIn = false;
    await expect(api.accountTradingStats()).rejects.toSatisfy((e: unknown) => e instanceof ApiError && e.code === 'UNAUTHENTICATED');
  });

  it('admin detail carries trading: the demo user equals the own numbers, other users have honest zeros (the mock has none of their fills)', async () => {
    setMockRole('admin');
    const own = await api.accountTradingStats();
    const demo = await api.adminGetUser({ params: { userId: fixtureMe.id } });
    // same computation; asOf is read at two different instants
    expect({ ...demo.trading, asOf: '' }).toEqual({ ...own, asOf: '' });
    const other = fixtureAdminUsers.find((u) => u.id !== fixtureMe.id && !u.isBot)!;
    const d = await api.adminGetUser({ params: { userId: other.id } });
    expect(d.trading.volume.last30d).toEqual(zero);
    expect(d.trading.tax.category).toBe('INDIVIDUAL');
  });
});
