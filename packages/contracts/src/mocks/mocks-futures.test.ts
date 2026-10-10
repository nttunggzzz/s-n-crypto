import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { ApiError, createApiClient } from '../index.ts';
import { createMockHandlers, mockSettleFunding, resetMockStore, setMockFuturesPrice, setMockRole } from './index.ts';

const BASE = 'http://mock.local';
const server = setupServer(...createMockHandlers({ baseUrl: BASE, latencyMs: 0 }));
const api = createApiClient({ baseUrl: BASE, validateResponses: true });
const code = (c: string) => (e: unknown) => e instanceof ApiError && e.code === c;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  resetMockStore();
  setMockRole('user', false);
});
afterAll(() => server.close());

describe('futures mocks (contracts phase F)', () => {
  it('market data: 50 contracts incl. 1000PEPE, mark/funding, depth, candles, funding history', async () => {
    const info = await api.futuresExchangeInfo();
    expect(info.symbols).toHaveLength(50);
    expect(info.maxLeverage).toBe(20);
    expect(info.symbols.find((s) => s.symbol === '1000PEPEUSDT')).toMatchObject({ baseAsset: '1000PEPE', underlyingAsset: 'PEPE', multiplier: 1000 });
    expect((await api.futuresTickers()).items[0]).toHaveProperty('markPrice');
    expect((await api.futuresMarkPrice({ params: { symbol: 'LINKUSDT' } })).status).toBe('UNAVAILABLE');
    await api.futuresDepth({ params: { symbol: 'BTCUSDT' } });
    await api.futuresMarketTrades({ params: { symbol: 'BTCUSDT' } });
    expect((await api.futuresCandles({ params: { symbol: 'BTCUSDT' }, query: { interval: '1h', limit: 50 } })).items).toHaveLength(50);
    expect((await api.futuresFundingHistory({ params: { symbol: 'BTCUSDT' } })).items.length).toBeGreaterThan(0);
    await api.futuresMarketStatus();
  });

  it('transfer, leverage, open LONG with TP/SL, adjust margin, partial close, history', async () => {
    const before = await api.futuresAccount();
    const t = await api.futuresTransfer({ body: { direction: 'SPOT_TO_FUTURES', amount: '1000' } });
    expect(Number(t.futures.available)).toBeCloseTo(Number(before.available) + 1000, 6);
    await expect(api.futuresSetLeverage({ params: { symbol: 'BTCUSDT' }, body: { leverage: 5 } })).rejects.toSatisfy(code('LEVERAGE_LOCKED'));
    expect((await api.futuresSetLeverage({ params: { symbol: 'SOLUSDT' }, body: { leverage: 20 } })).leverage).toBe(20);

    const o = await api.futuresPlaceOrder({ body: { symbol: 'SOLUSDT', side: 'BUY', type: 'MARKET', quantity: '10', tpsl: { takeProfitPrice: '130.00', stopLossPrice: '100.00' } } });
    expect(o).toMatchObject({ status: 'FILLED', leverage: 20, purpose: 'TRADE' });
    const pos = (await api.futuresPositions()).items.find((p) => p.symbol === 'SOLUSDT')!;
    expect(pos).toMatchObject({ side: 'LONG', quantity: '10.00', leverage: 20, takeProfitPrice: '130.00', stopLossPrice: '100.00', marginMode: 'ISOLATED' });
    expect(pos.liquidationPrice).not.toBeNull();

    await api.futuresAdjustMargin({ params: { symbol: 'SOLUSDT' }, body: { amount: '20' } });
    await expect(api.futuresAdjustMargin({ params: { symbol: 'SOLUSDT' }, body: { amount: '-9999' } })).rejects.toSatisfy(code('MARGIN_TOO_LOW'));
    await expect(api.futuresSetTpSl({ params: { symbol: 'SOLUSDT' }, body: { takeProfitPrice: '1.00', stopLossPrice: null } })).rejects.toSatisfy(code('INVALID_TPSL'));

    const close = await api.futuresClosePosition({ params: { symbol: 'SOLUSDT' }, body: { quantity: '4' } });
    expect(close).toMatchObject({ purpose: 'CLOSE', reduceOnly: true, side: 'SELL', executedQty: '4.00' });
    expect((await api.futuresPositions()).items.find((p) => p.symbol === 'SOLUSDT')!.quantity).toBe('6.00');
    await api.futuresClosePosition({ params: { symbol: 'SOLUSDT' }, body: {} });
    expect((await api.futuresPositions()).items.some((p) => p.symbol === 'SOLUSDT')).toBe(false);
    expect((await api.futuresPositionHistory()).items[0]).toMatchObject({ symbol: 'SOLUSDT', status: 'CLOSED', closeReason: 'USER' });
    expect((await api.futuresMyTrades()).items.length).toBeGreaterThanOrEqual(3);
    expect((await api.futuresLedger()).items.some((e) => e.type === 'TRANSFER' && e.account === 'FUTURES')).toBe(true);
  });

  it('resting limit fills when the price trades through; reduce-only is checked', async () => {
    await expect(api.futuresPlaceOrder({ body: { symbol: 'XRPUSDT', side: 'SELL', type: 'MARKET', quantity: '10', reduceOnly: true } })).rejects.toSatisfy(code('REDUCE_ONLY_REJECTED'));
    const o = await api.futuresPlaceOrder({ body: { symbol: 'XRPUSDT', side: 'BUY', type: 'LIMIT', price: '1.3000', quantity: '100' } });
    expect(o.status).toBe('NEW');
    expect(Number(o.lockedAmount)).toBeGreaterThan(0);
    setMockFuturesPrice('XRPUSDT', 1.29);
    expect((await api.futuresOpenOrders({ query: { symbol: 'XRPUSDT' } })).items).toHaveLength(0);
    expect((await api.futuresPositions()).items.find((p) => p.symbol === 'XRPUSDT')).toMatchObject({ side: 'LONG', entryPrice: '1.3' });
    expect((await api.listNotifications()).items[0]).toMatchObject({ type: 'FUTURES_ORDER_FILLED', symbol: 'XRPUSDT' });
  });

  it('TP/SL closes at the mark; a deep drop liquidates; funding is paid', async () => {
    // one-way mode: the demo resting BUY ETH limit would close the SHORT first — remove it
    await api.futuresCancelAll({ query: { symbol: 'ETHUSDT' } });
    await api.futuresPlaceOrder({ body: { symbol: 'ETHUSDT', side: 'SELL', type: 'MARKET', quantity: '0.100', tpsl: { takeProfitPrice: '2300.00' } } });
    setMockFuturesPrice('ETHUSDT', 2290);
    expect((await api.futuresPositionHistory()).items[0]).toMatchObject({ symbol: 'ETHUSDT', side: 'SHORT', closeReason: 'TAKE_PROFIT' });
    expect((await api.listNotifications()).items[0]).toMatchObject({ type: 'POSITION_TPSL', reason: 'TAKE_PROFIT' });

    // the demo BTC LONG (10×, entry 79 000): funding then a crash
    const btc = (await api.futuresPositions()).items.find((p) => p.symbol === 'BTCUSDT')!;
    mockSettleFunding();
    const after = (await api.futuresPositions()).items.find((p) => p.symbol === 'BTCUSDT')!;
    expect(Number(after.margin)).toBeLessThan(Number(btc.margin));
    setMockFuturesPrice('BTCUSDT', 60000);
    expect((await api.futuresPositionHistory()).items[0]).toMatchObject({ symbol: 'BTCUSDT', closeReason: 'LIQUIDATION' });
    expect((await api.listNotifications()).items[0]).toMatchObject({ type: 'POSITION_LIQUIDATED', symbol: 'BTCUSDT' });
    expect((await api.futuresOrderHistory()).items[0]).toMatchObject({ purpose: 'LIQUIDATION', status: 'FILLED' });
  });

  it('admin futures symbols: permission + audit', async () => {
    await expect(api.adminFuturesSymbols()).rejects.toSatisfy(code('FORBIDDEN'));
    setMockRole('admin');
    expect((await api.adminFuturesSymbols()).items).toHaveLength(50);
    const s = await api.adminUpdateFuturesSymbol({ params: { symbol: 'DOGEUSDT' }, body: { maxLeverage: 10, reason: 'giảm rủi ro meme' } });
    expect(s.maxLeverage).toBe(10);
    await expect(api.futuresSetLeverage({ params: { symbol: 'DOGEUSDT' }, body: { leverage: 15 } })).rejects.toSatisfy(code('INVALID_LEVERAGE'));
    expect((await api.adminAuditLogs()).items[0]!.action).toBe('FUTURES_SYMBOL_UPDATE');
  });
});
