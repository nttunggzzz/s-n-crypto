import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { ApiError, createApiClient, type UserEvent } from '../index.ts';
import { createMockHandlers, createMockRealtimeClient, resetMockStore, setMockScenario } from './index.ts';

const BASE = 'http://mock.local';
const server = setupServer(...createMockHandlers({ baseUrl: BASE, latencyMs: 0 }));
// validateResponses: every mock response must match the contract schema
const api = createApiClient({ baseUrl: BASE, validateResponses: true });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => resetMockStore());
afterAll(() => server.close());

describe('mock handlers follow the contract', () => {
  it('every read endpoint returns schema-valid data', async () => {
    await api.health();
    await api.me();
    await api.listSessions();
    await api.exchangeInfo();
    await api.tickers();
    await api.depth({ params: { symbol: 'BTCUSDT' } });
    await api.marketTrades({ params: { symbol: 'ETHUSDT' } });
    await api.candles({ params: { symbol: 'BTCUSDT' }, query: { interval: '1h', limit: 50 } });
    await api.marketStatus();
    await api.balances();
    await api.ledger();
    await api.faucetStatus();
    await api.openOrders();
    await api.orderHistory();
    await api.myTrades();
    expect((await api.getOrder({ params: { orderId: '101' } })).status).toBe('PARTIALLY_FILLED');
  });

  it('auth endpoints', async () => {
    await api.register({ body: { email: 'a@b.co', password: '12345678', name: 'A' } });
    await api.login({ body: { email: 'a@b.co', password: '12345678' } });
    await api.verifyEmail({ body: { token: '0123456789abc' } });
    await api.forgotPassword({ body: { email: 'a@b.co' } });
    await api.logout();
    await expect(api.me()).rejects.toSatisfy((e) => e instanceof ApiError && e.code === 'UNAUTHENTICATED');
  });

  it('orders move balances and emit realtime user events', async () => {
    const rt = createMockRealtimeClient({ intervalMs: 10_000 });
    const events: UserEvent[] = [];
    rt.subscribe('user', (e) => events.push(e));
    const m = await api.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quoteOrderQty: '100' } });
    expect(m.order.status).toBe('FILLED');
    expect(m.fills).toHaveLength(1);
    const l = await api.placeOrder({ body: { symbol: 'ETHUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.1', price: '2000' } });
    expect((await api.openOrders()).items[0]!.id).toBe(l.order.id);
    await api.cancelOrder({ params: { orderId: l.order.id } });
    await api.cancelAllOrders();
    expect((await api.openOrders()).items).toHaveLength(0);
    expect(events.map((e) => e.kind)).toEqual(expect.arrayContaining(['order', 'trade', 'balance']));
    rt.close();
  });

  it('scenarios expose error, halted and unverified states', async () => {
    setMockScenario('halted');
    expect((await api.exchangeInfo()).tradingHalted).toBe(true);
    await expect(api.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.001' } })).rejects.toSatisfy(
      (e) => e instanceof ApiError && e.code === 'TRADING_HALTED',
    );
    setMockScenario('unverified');
    await expect(api.faucetClaim()).rejects.toSatisfy((e) => e instanceof ApiError && e.code === 'EMAIL_NOT_VERIFIED');
    setMockScenario('error');
    await expect(api.tickers()).rejects.toSatisfy((e) => e instanceof ApiError && e.status === 500);
    setMockScenario('empty');
    expect((await api.openOrders()).items).toEqual([]);
  });
});
