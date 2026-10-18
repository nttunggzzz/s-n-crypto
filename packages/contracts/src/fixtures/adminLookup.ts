/**
 * ⚠️ MOCK DATA — batch AD1 (admin order / fill lookup, sessions). Built from the demo user's fixtures plus two
 * Futures orders / fills for the second user. Never imported by the server.
 */
import type { AdminOrderRow, AdminTradeRow, AdminUserSession } from '../adminLookup.ts';
import { fixtureAdminUsers, fixtureMyTrades, fixtureOpenOrders, fixtureOrderHistory } from './index.ts';

const demo = fixtureAdminUsers[0]!;
const an = fixtureAdminUsers[1]!;
const owner = (u: typeof demo) => ({ userId: u.id, uid: u.uid, email: u.email });

const spotOrders: AdminOrderRow[] = [...fixtureOpenOrders, ...fixtureOrderHistory].map((o) => ({
  market: 'SPOT',
  id: o.id,
  clientOrderId: o.clientOrderId,
  ...owner(demo),
  source: o.source,
  sourceId: o.sourceId,
  symbol: o.symbol,
  side: o.side,
  type: o.type,
  status: o.status,
  price: o.price,
  quantity: o.quantity,
  executedQty: o.executedQty,
  avgPrice: o.avgPrice,
  leverage: null,
  closeReason: o.closeReason,
  createdAt: o.createdAt,
  updatedAt: o.updatedAt,
}));

const futuresOrders: AdminOrderRow[] = [
  {
    market: 'FUTURES',
    id: '9002',
    clientOrderId: 'web-f-9002',
    ...owner(an),
    source: null,
    sourceId: null,
    symbol: 'BTCUSDT',
    side: 'BUY',
    type: 'LIMIT',
    status: 'NEW',
    price: '60000.00000000',
    quantity: '0.01000000',
    executedQty: '0.00000000',
    avgPrice: null,
    leverage: 10,
    closeReason: null,
    createdAt: '2026-10-09T03:00:00.000Z',
    updatedAt: '2026-10-09T03:00:00.000Z',
  },
  {
    market: 'FUTURES',
    id: '9001',
    clientOrderId: 'web-f-9001',
    ...owner(an),
    source: null,
    sourceId: null,
    symbol: 'BTCUSDT',
    side: 'BUY',
    type: 'MARKET',
    status: 'FILLED',
    price: null,
    quantity: '0.01000000',
    executedQty: '0.01000000',
    avgPrice: '61000.00000000',
    leverage: 10,
    closeReason: null,
    createdAt: '2026-10-09T02:30:00.000Z',
    updatedAt: '2026-10-09T02:30:00.000Z',
  },
];

/** Newest first, like the endpoint. */
export const fixtureAdminOrderRows: AdminOrderRow[] = [...spotOrders, ...futuresOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || Number(b.id) - Number(a.id));

const spotTrades: AdminTradeRow[] = fixtureMyTrades.map((t) => ({
  market: 'SPOT',
  id: t.id,
  orderId: t.orderId,
  ...owner(demo),
  symbol: t.symbol,
  side: t.side,
  price: t.price,
  quantity: t.quantity,
  quoteQty: t.quoteQty,
  fee: t.fee,
  feeAsset: t.feeAsset,
  tax: t.tax,
  liquidity: t.liquidity,
  realizedPnl: t.realizedPnl,
  createdAt: t.createdAt,
}));

const futuresTrades: AdminTradeRow[] = [
  {
    market: 'FUTURES',
    id: '8001',
    orderId: '9001',
    ...owner(an),
    symbol: 'BTCUSDT',
    side: 'BUY',
    price: '61000.00000000',
    quantity: '0.01000000',
    quoteQty: '610.00000000',
    fee: '0.30500000',
    feeAsset: 'USDT',
    tax: null,
    liquidity: 'TAKER',
    realizedPnl: '0.00000000',
    createdAt: '2026-10-09T02:30:00.000Z',
  },
];

export const fixtureAdminTradeRows: AdminTradeRow[] = [...spotTrades, ...futuresTrades].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || Number(b.id) - Number(a.id));

/** Sessions of the demo user (no token material). */
export const fixtureAdminUserSessions: AdminUserSession[] = [
  { id: '00000000-0000-4000-8000-0000000000a1', createdAt: '2026-10-09T01:00:00.000Z', lastSeenAt: '2026-10-09T03:00:00.000Z', expiresAt: '2026-11-08T01:00:00.000Z', ip: '203.0.113.10', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', mfaVerified: false },
  { id: '00000000-0000-4000-8000-0000000000a2', createdAt: '2026-10-05T08:00:00.000Z', lastSeenAt: '2026-10-08T22:00:00.000Z', expiresAt: '2026-11-04T08:00:00.000Z', ip: '198.51.100.7', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', mfaVerified: false },
];
