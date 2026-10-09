import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { ApiError, createApiClient, UserEvent, type UserEvent as UserEventT } from '../index.ts';
import { createMockHandlers, mockStore, resetMockStore, setMockPrice } from './index.ts';

const BASE = 'http://mock.local';
const server = setupServer(...createMockHandlers({ baseUrl: BASE, latencyMs: 0 }));
const api = createApiClient({ baseUrl: BASE, validateResponses: true });
const events: UserEventT[] = [];
const listener = (e: UserEventT) => events.push(UserEvent.parse(e)); // realtime payloads must match the contract too

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  mockStore.listeners.add(listener);
});
beforeEach(() => {
  resetMockStore();
  events.length = 0;
});
afterAll(() => {
  mockStore.listeners.delete(listener);
  server.close();
});

const code = (c: string) => (e: unknown) => e instanceof ApiError && e.code === c;

describe('phase 2 mocks follow the contract', () => {
  it('read endpoints', async () => {
    expect((await api.openOrders()).items.some((o) => o.type === 'TRAILING_STOP_MARKET')).toBe(true);
    expect((await api.openOrderLists()).items).toHaveLength(1);
    await api.getOrderList({ params: { listId: '7' } });
    const p = await api.portfolio();
    expect(p.positions.find((x) => x.asset === 'LINK')!.marketValue).toBeNull();
    const h = await api.portfolioHistory({ query: { range: '24h' } });
    expect(h.points).toHaveLength(25);
    expect(h.points.some((x) => x.totalValueUsdt === null)).toBe(true);
    await api.listAlerts({ query: { status: 'ACTIVE' } });
    expect((await api.unreadNotifications()).unread).toBe(2);
    await api.listNotifications({ query: { unreadOnly: 'true' } });
    expect((await api.getPreferences()).favorites).toContain('BTCUSDT');
  });

  it('stop-market triggers when price falls through it', async () => {
    await api.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01' } });
    const r = await api.placeOrder({ body: { symbol: 'BTCUSDT', side: 'SELL', type: 'STOP_MARKET', stopPrice: '79000', quantity: '0.005' } });
    expect(r.order).toMatchObject({ status: 'NEW', triggerState: 'WAITING', triggerDirection: 'DOWN' });
    setMockPrice('BTCUSDT', 78990);
    const o = await api.getOrder({ params: { orderId: r.order.id } });
    expect(o).toMatchObject({ status: 'FILLED', triggerState: 'TRIGGERED' });
    expect(events.filter((e) => e.kind === 'notification').map((e) => (e as { notification: { type: string } }).notification.type)).toEqual(
      expect.arrayContaining(['STOP_TRIGGERED', 'ORDER_FILLED']),
    );
  });

  it('OCO: the take-profit fill cancels the stop leg', async () => {
    const list = await api.placeOco({ body: { symbol: 'ETHUSDT', side: 'SELL', quantity: '0.2', price: '2600', stopPrice: '2400' } });
    expect(list.listStatus).toBe('EXECUTING');
    await expect(api.placeOco({ body: { symbol: 'ETHUSDT', side: 'SELL', quantity: '0.01', price: '2400', stopPrice: '2300' } })).rejects.toSatisfy(code('INVALID_OCO_PRICES'));
    setMockPrice('ETHUSDT', 2600.5);
    const done = await api.getOrderList({ params: { listId: list.id } });
    expect(done.listStatus).toBe('ALL_DONE');
    expect(done.orders.map((o) => [o.type, o.status, o.closeReason])).toEqual([
      ['LIMIT', 'FILLED', null],
      ['STOP_MARKET', 'CANCELED', 'OCO_SIBLING'],
    ]);
  });

  it('market BUY with TP/SL places a SELL OCO for the received quantity', async () => {
    await expect(
      api.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01', tpsl: { takeProfitPrice: '70000', stopLossPrice: '60000' } } }),
    ).rejects.toSatisfy(code('INVALID_TPSL'));
    const r = await api.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01', tpsl: { takeProfitPrice: '84000', stopLossPrice: '76000' } } });
    const parent = await api.getOrder({ params: { orderId: r.order.id } });
    expect(parent.tpsl).toMatchObject({ state: 'PLACED' });
    const list = await api.getOrderList({ params: { listId: parent.tpsl!.childOrderListId! } });
    expect(list.orders[0]!.quantity).toBe('0.00999000'); // 0.01 minus 0.1% fee, floored to the step
    expect(list.parentOrderId).toBe(r.order.id);
  });

  it('price alerts fire once', async () => {
    await expect(api.createAlert({ body: { symbol: 'SOLUSDT', condition: 'ABOVE', targetPrice: '100' } })).rejects.toSatisfy(code('INVALID_PRICE'));
    const a = await api.createAlert({ body: { symbol: 'SOLUSDT', condition: 'ABOVE', targetPrice: '115', note: 'test' } });
    setMockPrice('SOLUSDT', 115.2);
    setMockPrice('SOLUSDT', 116);
    const after = (await api.listAlerts()).items.find((x) => x.id === a.id)!;
    expect(after).toMatchObject({ status: 'TRIGGERED', triggeredPrice: '115.20000000' });
    expect(events.filter((e) => e.kind === 'alert')).toHaveLength(1);
    await api.deleteAlert({ params: { alertId: a.id } });
  });

  it('trailing stop follows the price and triggers on the pullback', async () => {
    const r = await api.placeOrder({ body: { symbol: 'BNBUSDT', side: 'BUY', type: 'TRAILING_STOP_MARKET', trailingDeltaBips: 100, quoteOrderQty: '100' } });
    setMockPrice('BNBUSDT', 700); // new low → stop follows down to 707
    expect((await api.getOrder({ params: { orderId: r.order.id } })).stopPrice).toBe('707.00000000');
    setMockPrice('BNBUSDT', 707.5);
    expect((await api.getOrder({ params: { orderId: r.order.id } })).status).toBe('FILLED');
  });

  it('exports, preferences, notifications', async () => {
    const csv = await api.exportTrades({ query: { symbol: 'BTCUSDT' } });
    expect(csv.startsWith('﻿tradeId,orderId,time_utc')).toBe(true);
    const prefs = await api.updatePreferences({ body: { upColor: 'RED', favorites: ['SOLUSDT'] } });
    expect(prefs).toMatchObject({ upColor: 'RED', favorites: ['SOLUSDT'], confirmOrders: true });
    expect((await api.markNotificationsRead({ body: { all: true } })).unread).toBe(0);
  });

  it('cancelling one OCO leg cancels the list and releases funds once', async () => {
    const before = (await api.balances()).items.find((b) => b.asset === 'BTC')!;
    await api.cancelOrder({ params: { orderId: '103' } });
    const list = await api.getOrderList({ params: { listId: '7' } });
    expect(list.orders.every((o) => o.status === 'CANCELED')).toBe(true);
    const after = (await api.balances()).items.find((b) => b.asset === 'BTC')!;
    expect(after.locked).toBe('0.00000000');
    expect(after.total).toBe(before.total);
  });
});
