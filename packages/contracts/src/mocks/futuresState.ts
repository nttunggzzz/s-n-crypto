/**
 * ⚠️ MOCK futures state (UI development only). JS numbers inside — never copy this math into the UI;
 * the UI uses @cex/core (Dec) for anything it shows.
 */
import type { AdminFuturesSymbol, FuturesOrder, FuturesTrade, LedgerEntry, PositionSide } from '../index.ts';
import { fixtureFuturesSymbols, MOCK_FUTURES, mockFuturesPrice } from '../fixtures/futures.ts';
import { MOCK_PAIRS } from '../fixtures/index.ts';

export interface MockPosition {
  id: string;
  symbol: string;
  side: PositionSide;
  status: 'OPEN' | 'CLOSED';
  qty: number;
  maxQty: number;
  entry: number;
  margin: number;
  leverage: number;
  realized: number;
  fees: number;
  funding: number;
  closedQty: number;
  closedNotional: number;
  tp: number | null;
  sl: number | null;
  closeReason: 'USER' | 'TAKE_PROFIT' | 'STOP_LOSS' | 'LIQUIDATION' | 'ADMIN' | null;
  openedAt: string;
  closedAt: string | null;
  updatedAt: string;
}

export interface MockFuturesState {
  available: number;
  prices: Record<string, number>;
  leverage: Record<string, number>;
  positions: MockPosition[];
  closed: MockPosition[];
  orders: FuturesOrder[];
  history: FuturesOrder[];
  trades: FuturesTrade[];
  ledger: LedgerEntry[];
  symbols: AdminFuturesSymbol[];
  /** Funding time already settled (ms). */
  lastFundingAt: number;
  /** Symbols whose price was pinned with setMockFuturesPrice (stop following spot). */
  manual?: Set<string>;
  /** TP/SL to apply when a resting order opens the position. */
  pendingTpSl: Record<string, { takeProfitPrice?: string | null; stopLossPrice?: string | null }>;
}

const T = '2026-10-09T02:30:00.000Z';
const spotPrices = () => Object.fromEntries(Object.entries(MOCK_PAIRS).map(([s, p]) => [s, p.price]));

export function initialFuturesState(empty = false): MockFuturesState {
  const prices = Object.fromEntries(Object.keys(MOCK_FUTURES).map((s) => [s, mockFuturesPrice(s, spotPrices())]));
  const symbols = fixtureFuturesSymbols.map((s) => ({ ...s, sourceStatus: 'TRADING', adminEnabled: s.enabled, openPositions: 0, openOrders: 0, updatedAt: T }));
  const base: MockFuturesState = { available: 1500, prices, leverage: {}, positions: [], closed: [], orders: [], history: [], trades: [], ledger: [], symbols, lastFundingAt: 0, pendingTpSl: {} };
  base.ledger.push({ id: '9001', account: 'FUTURES', asset: 'USDT', type: 'TRANSFER', deltaAvailable: '2000.00000000', deltaLocked: '0.00000000', availableAfter: '2000.00000000', lockedAfter: '0.00000000', refType: 'TRANSFER', refId: '9001', createdAt: '2026-10-09T01:30:00.000Z' });
  if (empty) return base;
  base.positions.push({
    id: '501', symbol: 'BTCUSDT', side: 'LONG', status: 'OPEN', qty: 0.01, maxQty: 0.01, entry: 79000, margin: 79, leverage: 10,
    realized: 0, fees: 0.395, funding: -0.08, closedQty: 0, closedNotional: 0, tp: null, sl: 75000, closeReason: null, openedAt: T, closedAt: null, updatedAt: T,
  });
  base.closed.push({
    id: '500', symbol: 'SOLUSDT', side: 'SHORT', status: 'CLOSED', qty: 0, maxQty: 2, entry: 115, margin: 0, leverage: 5,
    realized: 10, fees: 0.225, funding: 0.023, closedQty: 2, closedNotional: 220, tp: null, sl: null, closeReason: 'TAKE_PROFIT', openedAt: '2026-10-08T10:00:00.000Z', closedAt: '2026-10-09T01:00:00.000Z', updatedAt: '2026-10-09T01:00:00.000Z',
  });
  base.orders.push({
    id: '701', clientOrderId: 'mock-701', symbol: 'ETHUSDT', side: 'BUY', type: 'LIMIT', purpose: 'TRADE', timeInForce: 'GTC', price: '2400.00', quantity: '0.100', executedQty: '0.000', avgPrice: null,
    reduceOnly: false, leverage: 10, status: 'NEW', lockedAmount: '24.12000000', fee: '0.00000000', realizedPnl: '0.00000000', closeReason: null, createdAt: T, updatedAt: T,
  });
  base.available = 1500 - 79 - 24.12;
  return base;
}
