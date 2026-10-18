import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { AdminFundingSummaryQuery, AdminRiskPositionsQuery, ApiError, createApiClient, endpoints, hasPermission, type EndpointDef } from '../index.ts';
import { createMockHandlers, resetMockStore, setMockRole } from './index.ts';

const BASE = 'http://mock.local';
const server = setupServer(...createMockHandlers({ baseUrl: BASE, latencyMs: 0 }));
const api = createApiClient({ baseUrl: BASE, validateResponses: true });
const code = (c: string) => (e: unknown) => e instanceof ApiError && e.code === c;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  resetMockStore();
  setMockRole('support');
});
afterAll(() => server.close());

describe('admin risk endpoints (module AD, AD2)', () => {
  it('permissions: positions / liquidations need users.read, funding / metrics exchange.read; a user gets FORBIDDEN', async () => {
    expect((endpoints.adminRiskPositions as EndpointDef).permission).toBe('users.read');
    expect((endpoints.adminLiquidations as EndpointDef).permission).toBe('users.read');
    expect((endpoints.adminFundingSummary as EndpointDef).permission).toBe('exchange.read');
    expect((endpoints.adminMetrics as EndpointDef).permission).toBe('exchange.read');
    expect(hasPermission('support', 'users.read') && hasPermission('support', 'exchange.read')).toBe(true);
    setMockRole('user', false);
    await expect(api.adminRiskPositions({})).rejects.toSatisfy(code('FORBIDDEN'));
    await expect(api.adminMetrics({})).rejects.toSatisfy(code('FORBIDDEN'));
  });

  it('positions: default order is closest to liquidation with the stale-mark row last and all its mark-based fields null', async () => {
    const r = await api.adminRiskPositions({});
    expect(r.items.map((i) => i.positionId)).toEqual(['101', '102', '103']);
    expect(r.items[2]).toMatchObject({ markPrice: null, notional: null, unrealizedPnl: null, liqDistance: null, marginRatio: null });
    expect(r.totals[1]).toMatchObject({ symbol: 'ETHUSDT', markStatus: 'STALE', longNotional: null });
    expect((await api.adminRiskPositions({ query: { sort: 'notional' } })).items.map((i) => i.positionId)).toEqual(['102', '101', '103']);
    expect((await api.adminRiskPositions({ query: { side: 'SHORT' } })).items.map((i) => i.positionId)).toEqual(['102']);
    const p1 = await api.adminRiskPositions({ query: { limit: 2 } });
    expect(p1.nextCursor).toBe('2');
    expect((await api.adminRiskPositions({ query: { limit: 2, cursor: p1.nextCursor! } })).items.map((i) => i.positionId)).toEqual(['103']);
    expect(AdminRiskPositionsQuery.safeParse({ sort: 'pnl' }).success).toBe(false);
    expect(AdminRiskPositionsQuery.parse({}).sort).toBe('liqDistance');
  });

  it('liquidations: newest first with a cursor; funding and metrics validate', async () => {
    const p1 = await api.adminLiquidations({ query: { limit: 1 } });
    expect(p1.items[0]!.positionId).toBe('98');
    expect(p1.nextCursor).toBe('2026-10-16T21:15:00.000Z|98');
    expect((await api.adminLiquidations({ query: { limit: 1, cursor: p1.nextCursor! } })).items[0]!.positionId).toBe('90');
    await expect(api.adminLiquidations({ query: { cursor: 'x' } })).rejects.toSatisfy(code('VALIDATION_ERROR'));
    expect((await api.adminFundingSummary({ query: { symbol: 'ETHUSDT' } })).items.map((i) => i.symbol)).toEqual(['ETHUSDT']);
    expect(AdminFundingSummaryQuery.safeParse({ from: '2026-10-08T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' }).success).toBe(false);
    expect(AdminFundingSummaryQuery.safeParse({ from: '2024-01-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' }).success).toBe(false);
  });

  it('metrics: every day of the range, zero days included, 7d by default', async () => {
    const m = await api.adminMetrics({});
    expect(m.days).toHaveLength(7);
    expect(m.days.some((d) => d.spotVolume === '0.00000000' && d.newUsers === 0)).toBe(true);
    expect((await api.adminMetrics({ query: { range: '30d' } })).days).toHaveLength(30);
    expect((await api.adminMetrics({ query: { range: '90d' } })).days).toHaveLength(90);
    await expect(api.adminMetrics({ query: { range: '1y' as never } })).rejects.toSatisfy(code('VALIDATION_ERROR'));
  });
});
