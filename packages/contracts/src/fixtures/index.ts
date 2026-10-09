/**
 * ⚠️ MOCK DATA — for UI development and tests only.
 * Never imported by the server; the UI must not load it on staging/production.
 * Prices here are made-up round numbers, not market data.
 */
import type { Balances, Candle, CandleInterval, Depth, ExchangeInfo, FaucetStatus, LedgerEntry, MarketStatus, MarketTrade, Me, Order, SessionInfo, SymbolInfo, Ticker, Trade } from '../index.ts';

const T0 = '2026-10-09T03:00:00.000Z';

interface MockPair {
  base: string;
  price: number;
  tick: string;
  step: string;
  minNotional: string;
}

/** Same trading rules as the real Binance pairs; prices are fake. */
export const MOCK_PAIRS: Record<string, MockPair> = {
  BTCUSDT: { base: 'BTC', price: 80000, tick: '0.01', step: '0.00001', minNotional: '5' },
  ETHUSDT: { base: 'ETH', price: 2500, tick: '0.01', step: '0.0001', minNotional: '5' },
  SOLUSDT: { base: 'SOL', price: 110, tick: '0.01', step: '0.001', minNotional: '5' },
  BNBUSDT: { base: 'BNB', price: 740, tick: '0.01', step: '0.001', minNotional: '5' },
  XRPUSDT: { base: 'XRP', price: 1.4, tick: '0.0001', step: '0.1', minNotional: '5' },
  DOGEUSDT: { base: 'DOGE', price: 0.085, tick: '0.00001', step: '1', minNotional: '1' },
  ADAUSDT: { base: 'ADA', price: 0.24, tick: '0.0001', step: '0.1', minNotional: '5' },
  AVAXUSDT: { base: 'AVAX', price: 10.25, tick: '0.001', step: '0.01', minNotional: '5' },
  LINKUSDT: { base: 'LINK', price: 12.8, tick: '0.001', step: '0.01', minNotional: '5' },
  SUIUSDT: { base: 'SUI', price: 1.05, tick: '0.0001', step: '0.1', minNotional: '5' },
};

const decimals = (step: string) => (step.includes('.') ? step.split('.')[1]!.replace(/0+$/, '').length : 0);
export const fmtPrice = (symbol: string, p: number) => p.toFixed(decimals(MOCK_PAIRS[symbol]!.tick));
const fmt8 = (n: number) => n.toFixed(8);

export const fixtureSymbols: SymbolInfo[] = Object.entries(MOCK_PAIRS).map(([symbol, p]) => ({
  symbol,
  baseAsset: p.base,
  quoteAsset: 'USDT',
  tickSize: p.tick,
  stepSize: p.step,
  minQty: p.step,
  maxQty: '9000000',
  minNotional: p.minNotional,
  pricePrecision: decimals(p.tick),
  quantityPrecision: decimals(p.step),
  enabled: symbol !== 'SUIUSDT', // one disabled pair so the UI can render that state
}));

export const fixtureExchangeInfo: ExchangeInfo = {
  tradingHalted: false,
  feeRate: '0.001',
  symbols: fixtureSymbols,
  serverTime: T0,
};

export function fixtureTicker(symbol: string, price = MOCK_PAIRS[symbol]!.price): Ticker {
  // AVAXUSDT is STALE and LINKUSDT UNAVAILABLE so every UI state can be seen.
  if (symbol === 'LINKUSDT') {
    return { symbol, lastPrice: null, openPrice: null, highPrice: null, lowPrice: null, priceChange: null, priceChangePercent: null, volume: null, quoteVolume: null, bestBid: null, bestAsk: null, status: 'UNAVAILABLE', updatedAt: null };
  }
  const open = MOCK_PAIRS[symbol]!.price * 0.98;
  return {
    symbol,
    lastPrice: fmtPrice(symbol, price),
    openPrice: fmtPrice(symbol, open),
    highPrice: fmtPrice(symbol, price * 1.02),
    lowPrice: fmtPrice(symbol, open * 0.99),
    priceChange: fmtPrice(symbol, price - open),
    priceChangePercent: (((price - open) / open) * 100).toFixed(3),
    volume: '12345.678',
    quoteVolume: fmt8(12345.678 * price),
    bestBid: fmtPrice(symbol, price - Number(MOCK_PAIRS[symbol]!.tick)),
    bestAsk: fmtPrice(symbol, price),
    status: symbol === 'AVAXUSDT' ? 'STALE' : 'LIVE',
    updatedAt: T0,
  };
}

export const fixtureTickers = (): Ticker[] => Object.keys(MOCK_PAIRS).map((s) => fixtureTicker(s));

export function fixtureDepth(symbol: string, mid = MOCK_PAIRS[symbol]!.price, levels = 20): Depth {
  const tick = Number(MOCK_PAIRS[symbol]!.tick);
  const qty = (i: number) => (((i * 37) % 11) / 10 + 0.05).toFixed(decimals(MOCK_PAIRS[symbol]!.step) || 0);
  return {
    symbol,
    bids: Array.from({ length: levels }, (_, i) => [fmtPrice(symbol, mid - tick * (i + 1) * 5), qty(i)] as [string, string]),
    asks: Array.from({ length: levels }, (_, i) => [fmtPrice(symbol, mid + tick * i * 5), qty(i + 3)] as [string, string]),
    status: 'LIVE',
    updatedAt: T0,
  };
}

export function fixtureMarketTrades(symbol: string, n = 30): MarketTrade[] {
  const p = MOCK_PAIRS[symbol]!.price;
  return Array.from({ length: n }, (_, i) => ({
    id: 1000 + n - i,
    price: fmtPrice(symbol, p * (1 + Math.sin(i) / 500)),
    qty: (0.01 + (i % 7) / 100).toFixed(4),
    time: Date.parse(T0) - i * 1500,
    isBuyerMaker: i % 3 === 0,
  }));
}

const INTERVAL_MS: Record<CandleInterval, number> = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 };

/** Deterministic fake candles (sine walk) ending at `end`. */
export function fixtureCandles(symbol: string, interval: CandleInterval, n = 200, end = Date.parse(T0)): Candle[] {
  const ms = INTERVAL_MS[interval];
  const p0 = MOCK_PAIRS[symbol]!.price;
  const start = Math.floor(end / ms) * ms - (n - 1) * ms;
  return Array.from({ length: n }, (_, i) => {
    const o = p0 * (1 + Math.sin(i / 9) / 40 + Math.sin(i / 2.3) / 200);
    const c = p0 * (1 + Math.sin((i + 1) / 9) / 40 + Math.sin((i + 1) / 2.3) / 200);
    const openTime = start + i * ms;
    return {
      openTime,
      closeTime: openTime + ms - 1,
      open: fmtPrice(symbol, o),
      high: fmtPrice(symbol, Math.max(o, c) * 1.002),
      low: fmtPrice(symbol, Math.min(o, c) * 0.998),
      close: fmtPrice(symbol, c),
      volume: (100 + ((i * 13) % 50)).toFixed(3),
      quoteVolume: fmt8((100 + ((i * 13) % 50)) * c),
      closed: i < n - 1,
    };
  });
}

export const fixtureMarketStatus: MarketStatus = {
  connection: 'CONNECTED',
  staleThresholdMs: 10000,
  symbols: Object.keys(MOCK_PAIRS).map((symbol) => ({
    symbol,
    status: symbol === 'AVAXUSDT' ? 'STALE' : symbol === 'LINKUSDT' ? 'UNAVAILABLE' : 'LIVE',
    lastUpdateAt: symbol === 'LINKUSDT' ? null : T0,
  })),
};

export const fixtureMe: Me = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'demo@example.com',
  name: 'Người dùng demo',
  emailVerified: true,
  role: 'user',
  signalsAccess: false,
  createdAt: '2026-10-01T00:00:00.000Z',
};

export const fixtureBalances: Balances = {
  items: [
    { asset: 'BTC', available: '0.01211787', locked: '0.00000000', total: '0.01211787', valueUsdt: '969.42960000' },
    { asset: 'ETH', available: '0.50000000', locked: '0.25000000', total: '0.75000000', valueUsdt: '1875.00000000' },
    { asset: 'LINK', available: '3.00000000', locked: '0.00000000', total: '3.00000000', valueUsdt: null },
    { asset: 'USDT', available: '7155.57040000', locked: '500.00000000', total: '7655.57040000', valueUsdt: '7655.57040000' },
  ],
  totalValueUsdt: '10500.00000000',
  unpricedAssets: ['LINK'],
};

export const fixtureFaucetStatus: FaucetStatus = {
  asset: 'USDT',
  amount: '10000.00000000',
  cooldownHours: 24,
  lifetimeCap: '100000.00000000',
  totalClaimed: '10000.00000000',
  canClaim: false,
  nextAvailableAt: '2026-10-10T03:00:00.000Z',
};

export const fixtureOpenOrders: Order[] = [
  {
    id: '102',
    clientOrderId: 'web-102',
    symbol: 'ETHUSDT',
    side: 'SELL',
    type: 'LIMIT',
    timeInForce: 'GTC',
    status: 'NEW',
    price: '2600.00000000',
    stopPrice: null,
    quantity: '0.25000000',
    quoteOrderQty: null,
    executedQty: '0.00000000',
    cumulativeQuoteQty: '0.00000000',
    avgPrice: null,
    createdAt: '2026-10-09T02:40:00.000Z',
    updatedAt: '2026-10-09T02:40:00.000Z',
  },
  {
    id: '101',
    clientOrderId: 'web-101',
    symbol: 'BTCUSDT',
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    status: 'PARTIALLY_FILLED',
    price: '78000.00000000',
    stopPrice: null,
    quantity: '0.01000000',
    quoteOrderQty: null,
    executedQty: '0.00359000',
    cumulativeQuoteQty: '280.02000000',
    avgPrice: '78000.00000000',
    createdAt: '2026-10-09T02:30:00.000Z',
    updatedAt: '2026-10-09T02:35:00.000Z',
  },
];

export const fixtureOrderHistory: Order[] = [
  {
    id: '100',
    clientOrderId: 'web-100',
    symbol: 'BTCUSDT',
    side: 'BUY',
    type: 'MARKET',
    timeInForce: null,
    status: 'FILLED',
    price: null,
    stopPrice: null,
    quantity: null,
    quoteOrderQty: '1000.00000000',
    executedQty: '0.01250000',
    cumulativeQuoteQty: '999.98750000',
    avgPrice: '79999.00000000',
    createdAt: '2026-10-09T02:00:00.000Z',
    updatedAt: '2026-10-09T02:00:00.000Z',
  },
  {
    id: '99',
    clientOrderId: 'web-99',
    symbol: 'SOLUSDT',
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    status: 'CANCELED',
    price: '100.00000000',
    stopPrice: null,
    quantity: '1.00000000',
    quoteOrderQty: null,
    executedQty: '0.00000000',
    cumulativeQuoteQty: '0.00000000',
    avgPrice: null,
    createdAt: '2026-10-08T10:00:00.000Z',
    updatedAt: '2026-10-08T12:00:00.000Z',
  },
];

export const fixtureMyTrades: Trade[] = [
  {
    id: '501',
    orderId: '101',
    symbol: 'BTCUSDT',
    side: 'BUY',
    price: '78000.00000000',
    quantity: '0.00359000',
    quoteQty: '280.02000000',
    fee: '0.00000359',
    feeAsset: 'BTC',
    liquidity: 'MAKER',
    createdAt: '2026-10-09T02:35:00.000Z',
  },
  {
    id: '500',
    orderId: '100',
    symbol: 'BTCUSDT',
    side: 'BUY',
    price: '79999.00000000',
    quantity: '0.01250000',
    quoteQty: '999.98750000',
    fee: '0.00001250',
    feeAsset: 'BTC',
    liquidity: 'TAKER',
    createdAt: '2026-10-09T02:00:00.000Z',
  },
];

export const fixtureLedger: LedgerEntry[] = [
  { id: '7', asset: 'BTC', type: 'FEE', deltaAvailable: '-0.00001250', deltaLocked: '0.00000000', availableAfter: '0.01248750', lockedAfter: '0.00000000', refType: 'ORDER', refId: '100', createdAt: '2026-10-09T02:00:00.000Z' },
  { id: '6', asset: 'BTC', type: 'TRADE_CREDIT', deltaAvailable: '0.01250000', deltaLocked: '0.00000000', availableAfter: '0.01250000', lockedAfter: '0.00000000', refType: 'ORDER', refId: '100', createdAt: '2026-10-09T02:00:00.000Z' },
  { id: '5', asset: 'USDT', type: 'TRADE_DEBIT', deltaAvailable: '-999.98750000', deltaLocked: '0.00000000', availableAfter: '9000.01250000', lockedAfter: '0.00000000', refType: 'ORDER', refId: '100', createdAt: '2026-10-09T02:00:00.000Z' },
  { id: '1', asset: 'USDT', type: 'FAUCET', deltaAvailable: '10000.00000000', deltaLocked: '0.00000000', availableAfter: '10000.00000000', lockedAfter: '0.00000000', refType: 'FAUCET', refId: '1', createdAt: '2026-10-09T01:00:00.000Z' },
];

export const fixtureSessions: SessionInfo[] = [
  { id: '00000000-0000-4000-8000-0000000000a1', current: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', ip: '203.0.113.10', createdAt: '2026-10-09T01:00:00.000Z', lastSeenAt: T0, expiresAt: '2026-11-08T01:00:00.000Z' },
  { id: '00000000-0000-4000-8000-0000000000a2', current: false, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', ip: '198.51.100.7', createdAt: '2026-10-05T08:00:00.000Z', lastSeenAt: '2026-10-08T22:00:00.000Z', expiresAt: '2026-11-04T08:00:00.000Z' },
];
