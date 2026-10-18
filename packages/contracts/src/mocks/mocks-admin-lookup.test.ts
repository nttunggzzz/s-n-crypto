import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { ApiError, AUDIT_EXPORT_COLUMNS, USERS_EXPORT_COLUMNS, createApiClient, endpoints, hasPermission } from '../index.ts';
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

describe('AD1 mocks follow the server rules', () => {
  it('declares permissions: lookup users.read, audit export audit.read, users export users.export (admin and owner only)', () => {
    expect([endpoints.adminSearchOrders.permission, endpoints.adminSearchTrades.permission, endpoints.adminUserSessions.permission]).toEqual(['users.read', 'users.read', 'users.read']);
    expect([endpoints.adminAuditExport.permission, endpoints.adminUsersExport.permission]).toEqual(['audit.read', 'users.export']);
    expect(['support', 'admin', 'owner'].map((r) => hasPermission(r as 'admin', 'users.export'))).toEqual([false, true, true]);
  });

  it('orders and trades: market required, filters, user by UID, unknown user 404, cursor without gaps', async () => {
    await expect(api.adminSearchOrders({ query: {} as never })).rejects.toSatisfy(code('VALIDATION_ERROR'));
    const all = await api.adminSearchOrders({ query: { market: 'SPOT', limit: 200 } });
    expect(all.items.length).toBeGreaterThan(2);
    const paged: string[] = [];
    let cursor: string | undefined;
    do {
      const p = await api.adminSearchOrders({ query: { market: 'SPOT', limit: 2, cursor } });
      paged.push(...p.items.map((o) => o.id));
      cursor = p.nextCursor ?? undefined;
    } while (cursor);
    expect(paged).toEqual(all.items.map((o) => o.id));
    expect((await api.adminSearchOrders({ query: { market: 'FUTURES', user: '10000002' } })).items.every((o) => o.uid === '10000002' && o.market === 'FUTURES')).toBe(true);
    expect((await api.adminSearchOrders({ query: { market: 'SPOT', user: '10000002' } })).items).toEqual([]);
    await expect(api.adminSearchOrders({ query: { market: 'SPOT', user: '99999999' } })).rejects.toSatisfy(code('NOT_FOUND'));
    expect((await api.adminSearchTrades({ query: { market: 'FUTURES' } })).items.every((t) => t.tax === null)).toBe(true);
    expect((await api.adminSearchTrades({ query: { market: 'SPOT', side: 'SELL' } })).items.every((t) => t.side === 'SELL')).toBe(true);
  });

  it('sessions carry no token field; exports enforce permissions and use the contract headers', async () => {
    const s = await api.adminUserSessions({ params: { userId: '00000000-0000-4000-8000-000000000001' } });
    expect(s.items.length).toBeGreaterThan(0);
    expect(JSON.stringify(s).toLowerCase()).not.toContain('token');
    await expect(api.adminUsersExport({ query: {} })).rejects.toSatisfy(code('FORBIDDEN'));
    await expect(api.adminAuditExport({ query: {} })).rejects.toSatisfy(code('FORBIDDEN'));
    setMockRole('admin');
    expect((await api.adminAuditExport({ query: {} })).slice(1).split('\r\n')[0]).toBe(AUDIT_EXPORT_COLUMNS.join(','));
    expect((await api.adminUsersExport({ query: {} })).slice(1).split('\r\n')[0]).toBe(USERS_EXPORT_COLUMNS.join(','));
  });
});
