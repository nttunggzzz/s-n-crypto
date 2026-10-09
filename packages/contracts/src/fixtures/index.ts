/**
 * ⚠️ MOCK DATA — for UI development and tests only.
 * Never imported by the server; the UI must not load it on staging/production.
 * Prices here are made-up round numbers, not market data.
 */
import { ASSET_CATALOG } from '../assetCatalog.ts';
import type {
  AdminAnnouncement,
  AdminOverview,
  AdminSymbol,
  AdminUserDetail,
  AdminUserSummary,
  AssetInfo,
  AuditLogEntry,
  Balances,
  ExchangeSettings,
  ReconciliationRun,
  Candle,
  CandleInterval,
  Depth,
  ExchangeInfo,
  FaucetStatus,
  LedgerEntry,
  MarketStatus,
  MarketTrade,
  Me,
  Notification,
  Order,
  OrderList,
  Portfolio,
  PortfolioHistory,
  PortfolioRange,
  Preferences,
  PriceAlert,
  SessionInfo,
  SparklineRange,
  Sparklines,
  SymbolInfo,
  Ticker,
  Trade,
} from '../index.ts';

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
  NEARUSDT: { base: 'NEAR', price: 4.8, tick: '0.001', step: '0.1', minNotional: '5' },
  UNIUSDT: { base: 'UNI', price: 7.4, tick: '0.001', step: '0.01', minNotional: '5' },
  ENAUSDT: { base: 'ENA', price: 0.22, tick: '0.0001', step: '0.01', minNotional: '5' },
  TAOUSDT: { base: 'TAO', price: 280, tick: '0.1', step: '0.0001', minNotional: '5' },
  ONDOUSDT: { base: 'ONDO', price: 0.49, tick: '0.0001', step: '0.1', minNotional: '5' },
  PEPEUSDT: { base: 'PEPE', price: 0.0000039, tick: '0.00000001', step: '1', minNotional: '1' },
  WLDUSDT: { base: 'WLD', price: 0.49, tick: '0.0001', step: '0.1', minNotional: '5' },
  AAVEUSDT: { base: 'AAVE', price: 170, tick: '0.01', step: '0.001', minNotional: '5' },
  TRXUSDT: { base: 'TRX', price: 0.33, tick: '0.0001', step: '0.1', minNotional: '5' },
  BCHUSDT: { base: 'BCH', price: 280, tick: '0.1', step: '0.001', minNotional: '5' },
  FETUSDT: { base: 'FET', price: 0.22, tick: '0.0001', step: '0.1', minNotional: '5' },
  LTCUSDT: { base: 'LTC', price: 64, tick: '0.01', step: '0.001', minNotional: '5' },
  TIAUSDT: { base: 'TIA', price: 0.48, tick: '0.0001', step: '0.01', minNotional: '5' },
  DOTUSDT: { base: 'DOT', price: 1.2, tick: '0.001', step: '0.01', minNotional: '5' },
  APTUSDT: { base: 'APT', price: 0.81, tick: '0.0001', step: '0.01', minNotional: '5' },
  FILUSDT: { base: 'FIL', price: 1.1, tick: '0.0001', step: '0.01', minNotional: '5' },
  HBARUSDT: { base: 'HBAR', price: 0.092, tick: '0.00001', step: '1', minNotional: '5' },
  ARBUSDT: { base: 'ARB', price: 0.18, tick: '0.0001', step: '0.1', minNotional: '5' },
  XLMUSDT: { base: 'XLM', price: 0.19, tick: '0.0001', step: '1', minNotional: '5' },
  INJUSDT: { base: 'INJ', price: 7, tick: '0.001', step: '0.01', minNotional: '5' },
  ATOMUSDT: { base: 'ATOM', price: 2, tick: '0.001', step: '0.01', minNotional: '5' },
  TRUMPUSDT: { base: 'TRUMP', price: 1.8, tick: '0.001', step: '0.001', minNotional: '1' },
  PENGUUSDT: { base: 'PENGU', price: 0.008, tick: '0.000001', step: '1', minNotional: '1' },
  ICPUSDT: { base: 'ICP', price: 3, tick: '0.001', step: '0.01', minNotional: '5' },
  JUPUSDT: { base: 'JUP', price: 0.36, tick: '0.0001', step: '0.1', minNotional: '5' },
  ALGOUSDT: { base: 'ALGO', price: 0.12, tick: '0.0001', step: '1', minNotional: '5' },
  OPUSDT: { base: 'OP', price: 0.12, tick: '0.0001', step: '0.01', minNotional: '5' },
  VIRTUALUSDT: { base: 'VIRTUAL', price: 0.72, tick: '0.0001', step: '0.1', minNotional: '5' },
  RENDERUSDT: { base: 'RENDER', price: 1.9, tick: '0.001', step: '0.01', minNotional: '5' },
  CRVUSDT: { base: 'CRV', price: 0.35, tick: '0.0001', step: '0.1', minNotional: '5' },
  LDOUSDT: { base: 'LDO', price: 0.42, tick: '0.0001', step: '0.01', minNotional: '5' },
  POLUSDT: { base: 'POL', price: 0.099, tick: '0.00001', step: '0.1', minNotional: '5' },
  SEIUSDT: { base: 'SEI', price: 0.066, tick: '0.00001', step: '0.1', minNotional: '5' },
  SHIBUSDT: { base: 'SHIB', price: 0.0000054, tick: '0.00000001', step: '1', minNotional: '1' },
  ETCUSDT: { base: 'ETC', price: 8.2, tick: '0.01', step: '0.01', minNotional: '5' },
  WIFUSDT: { base: 'WIF', price: 0.21, tick: '0.0001', step: '0.01', minNotional: '1' },
  BONKUSDT: { base: 'BONK', price: 0.0000033, tick: '0.00000001', step: '1', minNotional: '1' },
  FLOKIUSDT: { base: 'FLOKI', price: 0.000027, tick: '0.00000001', step: '1', minNotional: '1' },
  KAIAUSDT: { base: 'KAIA', price: 0.054, tick: '0.0001', step: '0.1', minNotional: '5' },
  STXUSDT: { base: 'STX', price: 0.39, tick: '0.0001', step: '0.1', minNotional: '5' },
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

/** Coin info for every mock asset (from the real default catalog). */
export const fixtureAssets: AssetInfo[] = [...new Set(fixtureSymbols.flatMap((s) => [s.baseAsset, s.quoteAsset]))].map(
  (asset) => ASSET_CATALOG.find((a) => a.asset === asset) ?? { asset, name: null, tags: [], description: null },
);

export const fixtureExchangeInfo: ExchangeInfo = {
  tradingHalted: false,
  feeRate: '0.001',
  symbols: fixtureSymbols,
  assets: fixtureAssets,
  serverTime: T0,
};

/** Deterministic wavy mini charts (fake). LINKUSDT has none (UNAVAILABLE), like its ticker. */
export function fixtureSparklines(range: SparklineRange = '24h', prices: Record<string, number> = {}): Sparklines {
  const n = range === '24h' ? 25 : 43;
  return {
    range,
    interval: range === '24h' ? '1h' : '4h',
    items: Object.entries(MOCK_PAIRS).map(([symbol, p], k) => {
      if (symbol === 'LINKUSDT') return { symbol, points: [], status: 'UNAVAILABLE' as const };
      const last = prices[symbol] ?? p.price;
      const trend = ((k % 7) - 3) / 100; // -3%..+3% over the range
      const points = Array.from({ length: n }, (_, i) => {
        const t = i / (n - 1);
        const v = last * (1 - trend * (1 - t)) * (1 + 0.012 * Math.sin(i * 0.9 + k));
        return fmtPrice(symbol, i === n - 1 ? last : v);
      });
      return { symbol, points, status: symbol === 'AVAXUSDT' ? ('STALE' as const) : ('LIVE' as const) };
    }),
    updatedAt: T0,
  };
}

const OWNER_REF = { id: '00000000-0000-4000-8000-000000000001', email: 'owner@example.com' };

export const fixtureAdminAnnouncements: AdminAnnouncement[] = [
  {
    id: '3',
    title: 'Bảo trì nguồn giá 02:00–02:30 (GMT+7) ngày 12/10',
    body: 'Trong thời gian bảo trì, giao dịch có thể tạm dừng vài phút.\nLệnh đang chờ được giữ nguyên.',
    level: 'MAINTENANCE',
    pinned: true,
    publishedAt: '2026-10-09T02:00:00.000Z',
    expiresAt: null,
    hidden: false,
    createdBy: OWNER_REF,
    createdAt: '2026-10-09T02:00:00.000Z',
    updatedAt: '2026-10-09T02:00:00.000Z',
  },
  {
    id: '2',
    title: 'Niêm yết thêm 40 cặp giao dịch',
    body: 'Sàn mô phỏng đã có 50 cặp USDT, gồm các nhóm Layer 1, Meme, AI và DeFi.',
    level: 'IMPORTANT',
    pinned: false,
    publishedAt: '2026-10-09T01:00:00.000Z',
    expiresAt: null,
    hidden: false,
    createdBy: OWNER_REF,
    createdAt: '2026-10-09T01:00:00.000Z',
    updatedAt: '2026-10-09T01:00:00.000Z',
  },
  {
    id: '1',
    title: 'Chào mừng đến sàn mô phỏng',
    body: 'Nhận 10.000 USDT ảo mỗi ngày ở trang Tài sản và luyện giao dịch với giá thật.',
    level: 'INFO',
    pinned: false,
    publishedAt: '2026-10-08T01:00:00.000Z',
    expiresAt: null,
    hidden: false,
    createdBy: null,
    createdAt: '2026-10-08T01:00:00.000Z',
    updatedAt: '2026-10-08T01:00:00.000Z',
  },
  {
    id: '0',
    title: 'Đã hết hạn: bảo trì ngày 07/10',
    body: 'Thông báo này đã hết hạn nên không còn hiện cho người dùng.',
    level: 'MAINTENANCE',
    pinned: true,
    publishedAt: '2026-10-06T01:00:00.000Z',
    expiresAt: '2026-10-07T01:00:00.000Z',
    hidden: false,
    createdBy: OWNER_REF,
    createdAt: '2026-10-06T01:00:00.000Z',
    updatedAt: '2026-10-06T01:00:00.000Z',
  },
  {
    id: '4',
    title: 'Bản nháp: giải đấu tháng 11',
    body: 'Chưa công bố.',
    level: 'INFO',
    pinned: false,
    publishedAt: null,
    expiresAt: null,
    hidden: false,
    createdBy: OWNER_REF,
    createdAt: '2026-10-09T03:00:00.000Z',
    updatedAt: '2026-10-09T03:00:00.000Z',
  },
];

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
    // deep books of tiny-priced coins would go below zero: stop there, like a real thin book
    bids: Array.from({ length: levels }, (_, i) => [fmtPrice(symbol, mid - tick * (i + 1) * 5), qty(i)] as [string, string]).filter(([p]) => Number(p) > 0),
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
  twoFactorEnabled: false,
  permissions: [],
  createdAt: '2026-10-01T00:00:00.000Z',
};

export const fixtureBalances: Balances = {
  items: [
    { asset: 'BTC', available: '0.00359391', locked: '0.01248000', total: '0.01607391', valueUsdt: '1285.91280000' },
    { asset: 'ETH', available: '0.25000000', locked: '0.50000000', total: '0.75000000', valueUsdt: '1875.00000000' },
    { asset: 'LINK', available: '3.00000000', locked: '0.00000000', total: '3.00000000', valueUsdt: null },
    { asset: 'USDT', available: '6955.59040000', locked: '699.98000000', total: '7655.57040000', valueUsdt: '7655.57040000' },
  ],
  totalValueUsdt: '10816.48320000',
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

/** New Order fields (phase 2) for plain orders. */
export const ORDER_DEFAULTS = {
  triggerState: null,
  triggerDirection: null,
  triggeredAt: null,
  trailingDeltaBips: null,
  activationPrice: null,
  trailingReferencePrice: null,
  orderListId: null,
  parentOrderId: null,
  tpsl: null,
  closeReason: null,
} satisfies Partial<Order>;

const ocoLegTp: Order = {
  ...ORDER_DEFAULTS,
  id: '103',
  clientOrderId: 'tpsl-100-tp',
  symbol: 'BTCUSDT',
  side: 'SELL',
  type: 'LIMIT',
  timeInForce: 'GTC',
  status: 'NEW',
  price: '84000.00000000',
  stopPrice: null,
  quantity: '0.01248000',
  quoteOrderQty: null,
  executedQty: '0.00000000',
  cumulativeQuoteQty: '0.00000000',
  avgPrice: null,
  orderListId: '7',
  parentOrderId: '100',
  createdAt: '2026-10-09T02:00:01.000Z',
  updatedAt: '2026-10-09T02:00:01.000Z',
};

const ocoLegSl: Order = {
  ...ocoLegTp,
  id: '104',
  clientOrderId: 'tpsl-100-sl',
  type: 'STOP_MARKET',
  timeInForce: null,
  price: null,
  stopPrice: '76000.00000000',
  triggerState: 'WAITING',
  triggerDirection: 'DOWN',
};

/** OCO created from the TP/SL of order 100. */
export const fixtureOrderList: OrderList = {
  id: '7',
  clientListId: 'tpsl-100',
  symbol: 'BTCUSDT',
  side: 'SELL',
  contingencyType: 'OCO',
  listStatus: 'EXECUTING',
  orders: [ocoLegTp, ocoLegSl],
  parentOrderId: '100',
  createdAt: '2026-10-09T02:00:01.000Z',
  updatedAt: '2026-10-09T02:00:01.000Z',
};

export const fixtureOpenOrders: Order[] = [
  ocoLegTp,
  ocoLegSl,
  {
    ...ORDER_DEFAULTS,
    id: '106',
    clientOrderId: 'web-106',
    symbol: 'SOLUSDT',
    side: 'BUY',
    type: 'TRAILING_STOP_MARKET',
    timeInForce: null,
    status: 'NEW',
    price: null,
    stopPrice: '111.75500000',
    quantity: null,
    quoteOrderQty: '200.00000000',
    executedQty: '0.00000000',
    cumulativeQuoteQty: '0.00000000',
    avgPrice: null,
    triggerState: 'WAITING',
    triggerDirection: 'UP',
    trailingDeltaBips: 300,
    trailingReferencePrice: '108.50000000',
    createdAt: '2026-10-09T02:50:00.000Z',
    updatedAt: '2026-10-09T02:55:00.000Z',
  },
  {
    ...ORDER_DEFAULTS,
    id: '105',
    clientOrderId: 'web-105',
    symbol: 'ETHUSDT',
    side: 'SELL',
    type: 'STOP_LIMIT',
    timeInForce: 'GTC',
    status: 'NEW',
    price: '2290.00000000',
    stopPrice: '2300.00000000',
    quantity: '0.25000000',
    quoteOrderQty: null,
    executedQty: '0.00000000',
    cumulativeQuoteQty: '0.00000000',
    avgPrice: null,
    triggerState: 'WAITING',
    triggerDirection: 'DOWN',
    createdAt: '2026-10-09T02:45:00.000Z',
    updatedAt: '2026-10-09T02:45:00.000Z',
  },
  {
    ...ORDER_DEFAULTS,
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
    ...ORDER_DEFAULTS,
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
    ...ORDER_DEFAULTS,
    id: '100',
    clientOrderId: 'web-100',
    tpsl: {
      takeProfitPrice: '84000.00000000',
      stopLossPrice: '76000.00000000',
      stopLossLimitPrice: null,
      state: 'PLACED',
      childOrderListId: '7',
      childOrderIds: ['103', '104'],
      skippedReason: null,
    },
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
    ...ORDER_DEFAULTS,
    id: '99',
    clientOrderId: 'web-99',
    symbol: 'SOLUSDT',
    side: 'BUY',
    type: 'LIMIT',
    timeInForce: 'GTC',
    status: 'CANCELED',
    closeReason: 'USER_CANCELED',
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
    realizedPnl: null,
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
    realizedPnl: null,
    createdAt: '2026-10-09T02:00:00.000Z',
  },
];

export const fixtureLedger: LedgerEntry[] = [
  { id: '7', account: 'SPOT', asset: 'BTC', type: 'FEE', deltaAvailable: '-0.00001250', deltaLocked: '0.00000000', availableAfter: '0.01248750', lockedAfter: '0.00000000', refType: 'ORDER', refId: '100', createdAt: '2026-10-09T02:00:00.000Z' },
  { id: '6', account: 'SPOT', asset: 'BTC', type: 'TRADE_CREDIT', deltaAvailable: '0.01250000', deltaLocked: '0.00000000', availableAfter: '0.01250000', lockedAfter: '0.00000000', refType: 'ORDER', refId: '100', createdAt: '2026-10-09T02:00:00.000Z' },
  { id: '5', account: 'SPOT', asset: 'USDT', type: 'TRADE_DEBIT', deltaAvailable: '-999.98750000', deltaLocked: '0.00000000', availableAfter: '9000.01250000', lockedAfter: '0.00000000', refType: 'ORDER', refId: '100', createdAt: '2026-10-09T02:00:00.000Z' },
  { id: '1', account: 'SPOT', asset: 'USDT', type: 'FAUCET', deltaAvailable: '10000.00000000', deltaLocked: '0.00000000', availableAfter: '10000.00000000', lockedAfter: '0.00000000', refType: 'FAUCET', refId: '1', createdAt: '2026-10-09T01:00:00.000Z' },
];

export const fixtureSessions: SessionInfo[] = [
  { id: '00000000-0000-4000-8000-0000000000a1', current: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', ip: '203.0.113.10', createdAt: '2026-10-09T01:00:00.000Z', lastSeenAt: T0, expiresAt: '2026-11-08T01:00:00.000Z' },
  { id: '00000000-0000-4000-8000-0000000000a2', current: false, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', ip: '198.51.100.7', createdAt: '2026-10-05T08:00:00.000Z', lastSeenAt: '2026-10-08T22:00:00.000Z', expiresAt: '2026-11-04T08:00:00.000Z' },
];

// ───────────────────────────── phase 2

export const fixturePortfolio: Portfolio = {
  positions: [
    { asset: 'BTC', quantity: '0.01607391', avgCost: '79632.61583522', costBasis: '1280.00750000', marketPrice: '80000.00000000', marketValue: '1285.91280000', unrealizedPnl: '5.90530000', unrealizedPnlPercent: '0.46', realizedPnl: '0.00000000', allocationPercent: '11.89' },
    { asset: 'ETH', quantity: '0.75000000', avgCost: '2380.50000000', costBasis: '1785.37500000', marketPrice: '2500.00000000', marketValue: '1875.00000000', unrealizedPnl: '89.62500000', unrealizedPnlPercent: '5.02', realizedPnl: '42.17000000', allocationPercent: '17.33' },
    { asset: 'LINK', quantity: '3.00000000', avgCost: '12.10000000', costBasis: '36.30000000', marketPrice: null, marketValue: null, unrealizedPnl: null, unrealizedPnlPercent: null, realizedPnl: '0.00000000', allocationPercent: null },
    { asset: 'USDT', quantity: '7655.57040000', avgCost: null, costBasis: null, marketPrice: '1.00000000', marketValue: '7655.57040000', unrealizedPnl: null, unrealizedPnlPercent: null, realizedPnl: '0.00000000', allocationPercent: '70.78' },
  ],
  totalValueUsdt: '10816.48320000',
  totalUnrealizedPnl: '95.53030000',
  totalRealizedPnl: '42.17000000',
  totalFeesUsdt: '3.71000000',
  unpricedAssets: ['LINK'],
  asOf: T0,
};

const RANGE_STEPS: Record<PortfolioRange, { hours: number; stepHours: number }> = {
  '24h': { hours: 24, stepHours: 1 },
  '7d': { hours: 168, stepHours: 1 },
  '30d': { hours: 720, stepHours: 24 },
  '90d': { hours: 2160, stepHours: 24 },
  all: { hours: 2160, stepHours: 24 },
};

/** Fake equity curve; one point is null to show the "incomplete snapshot" state. */
export function fixturePortfolioHistory(range: PortfolioRange, end = Date.parse(T0)): PortfolioHistory {
  const { hours, stepHours } = RANGE_STEPS[range];
  const n = Math.floor(hours / stepHours) + 1;
  const stepMs = stepHours * 3_600_000;
  const last = Math.floor(end / stepMs) * stepMs;
  return {
    range,
    points: Array.from({ length: n }, (_, i) => ({
      time: new Date(last - (n - 1 - i) * stepMs).toISOString(),
      totalValueUsdt: i === Math.floor(n / 3) ? null : (10000 + 600 * Math.sin(i / 7) + i * (800 / n)).toFixed(8),
    })),
  };
}

export const fixtureAlerts: PriceAlert[] = [
  { id: '12', symbol: 'BTCUSDT', condition: 'ABOVE', targetPrice: '85000.00000000', note: 'Phá đỉnh tuần', status: 'ACTIVE', triggeredPrice: null, triggeredAt: null, createdAt: '2026-10-09T01:30:00.000Z' },
  { id: '11', symbol: 'ETHUSDT', condition: 'BELOW', targetPrice: '2450.00000000', note: null, status: 'TRIGGERED', triggeredPrice: '2449.98000000', triggeredAt: '2026-10-08T20:10:00.000Z', createdAt: '2026-10-08T09:00:00.000Z' },
];

export const fixtureNotifications: Notification[] = [
  { id: '34', type: 'ORDER_FILLED', orderId: '98', symbol: 'ETHUSDT', side: 'SELL', orderType: 'LIMIT', executedQty: '0.20000000', avgPrice: '2600.00000000', readAt: null, createdAt: '2026-10-09T02:58:00.000Z' },
  { id: '33', type: 'TPSL_PLACED', orderId: '100', symbol: 'BTCUSDT', quantity: '0.01248000', orderListId: '7', childOrderIds: ['103', '104'], readAt: null, createdAt: '2026-10-09T02:00:01.000Z' },
  { id: '32', type: 'STOP_TRIGGERED', orderId: '97', symbol: 'SOLUSDT', side: 'SELL', orderType: 'STOP_MARKET', stopPrice: '105.00000000', lastPrice: '104.99000000', readAt: '2026-10-08T21:00:00.000Z', createdAt: '2026-10-08T20:40:00.000Z' },
  { id: '31', type: 'PRICE_ALERT', alertId: '11', symbol: 'ETHUSDT', condition: 'BELOW', targetPrice: '2450.00000000', lastPrice: '2449.98000000', readAt: '2026-10-08T21:00:00.000Z', createdAt: '2026-10-08T20:10:00.000Z' },
];

export const fixturePreferences: Preferences = {
  favorites: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  confirmOrders: true,
  upColor: 'GREEN',
  theme: 'system',
  locale: 'vi',
  defaultInterval: '15m',
};

// ───────────────────────────── phase 3 (admin)

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const fixtureAdminUsers: AdminUserSummary[] = [
  { id: U(1), email: 'demo@example.com', name: 'Người dùng demo', role: 'user', status: 'active', emailVerified: true, twoFactorEnabled: false, signalsAccess: false, isBot: false, createdAt: '2026-10-01T00:00:00.000Z', lastSeenAt: T0 },
  { id: U(2), email: 'trader.an@example.com', name: 'Trần An', role: 'user', status: 'active', emailVerified: true, twoFactorEnabled: true, signalsAccess: true, isBot: false, createdAt: '2026-10-02T08:00:00.000Z', lastSeenAt: '2026-10-09T02:10:00.000Z' },
  { id: U(3), email: 'spam.bot@example.com', name: 'Spam', role: 'user', status: 'locked', emailVerified: false, twoFactorEnabled: false, signalsAccess: false, isBot: false, createdAt: '2026-10-05T12:00:00.000Z', lastSeenAt: null },
  { id: U(4), email: 'support@example.com', name: 'Hỗ trợ', role: 'support', status: 'active', emailVerified: true, twoFactorEnabled: true, signalsAccess: false, isBot: false, createdAt: '2026-09-30T00:00:00.000Z', lastSeenAt: '2026-10-08T15:00:00.000Z' },
  { id: U(5), email: 'admin@example.com', name: 'Quản trị', role: 'admin', status: 'active', emailVerified: true, twoFactorEnabled: true, signalsAccess: true, isBot: false, createdAt: '2026-09-30T00:00:00.000Z', lastSeenAt: T0 },
  { id: U(6), email: 'owner@example.com', name: 'Chủ dự án', role: 'owner', status: 'active', emailVerified: true, twoFactorEnabled: true, signalsAccess: true, isBot: false, createdAt: '2026-09-29T00:00:00.000Z', lastSeenAt: '2026-10-09T01:00:00.000Z' },
  { id: U(7), email: 'signals-bot@system.local', name: 'Signal bot', role: 'user', status: 'active', emailVerified: true, twoFactorEnabled: false, signalsAccess: false, isBot: true, createdAt: '2026-09-29T00:00:00.000Z', lastSeenAt: null },
];

export function fixtureAdminUserDetail(userId: string): AdminUserDetail | null {
  const user = fixtureAdminUsers.find((u) => u.id === userId);
  if (!user) return null;
  const isDemo = user.id === U(1);
  return {
    user,
    balances: isDemo ? fixtureBalances.items : [{ asset: 'USDT', available: '10000.00000000', locked: '0.00000000', total: '10000.00000000', valueUsdt: '10000.00000000' }],
    totalValueUsdt: isDemo ? fixtureBalances.totalValueUsdt : '10000.00000000',
    unpricedAssets: isDemo ? fixtureBalances.unpricedAssets : [],
    openOrders: isDemo ? fixtureOpenOrders.length : 0,
    activeSessions: user.lastSeenAt ? 1 : 0,
    faucetTotalClaimed: '10000.00000000',
  };
}

export const fixtureExchangeSettings: ExchangeSettings = {
  tradingHalted: false,
  feeRate: '0.001',
  faucet: { asset: 'USDT', amount: '10000.00000000', cooldownHours: 24, lifetimeCap: '100000.00000000' },
  futures: { makerFee: '0.0002', takerFee: '0.0005', liquidationFee: '0.005' },
  staleThresholdMs: 10000,
  updatedAt: '2026-10-09T00:00:00.000Z',
};

export const fixtureAdminSymbols: AdminSymbol[] = fixtureSymbols.map((s) => ({
  ...s,
  sourceStatus: 'TRADING',
  adminEnabled: s.enabled,
  openOrders: s.symbol === 'BTCUSDT' ? 3 : s.symbol === 'ETHUSDT' ? 2 : 0,
  updatedAt: '2026-10-09T00:00:00.000Z',
}));

export const fixtureReconciliationRuns: ReconciliationRun[] = [
  { id: '42', startedAt: '2026-10-09T02:50:00.000Z', finishedAt: '2026-10-09T02:50:00.180Z', ok: true, checkedBalances: 128, mismatches: [] },
  {
    id: '41',
    startedAt: '2026-10-09T02:40:00.000Z',
    finishedAt: '2026-10-09T02:40:00.210Z',
    ok: false,
    checkedBalances: 127,
    mismatches: [{ kind: 'LEDGER_VS_BALANCE', account: 'SPOT', userId: U(2), asset: 'USDT', field: 'available', expected: '9500.000000000000000000', actual: '9500.010000000000000000' }],
  },
];

export const fixtureAuditLogs: AuditLogEntry[] = [
  { id: '9', actor: { id: U(5), email: 'admin@example.com' }, action: 'BALANCE_ADJUST', targetType: 'USER', targetId: U(2), before: { asset: 'USDT', available: '9000.00000000' }, after: { asset: 'USDT', available: '9500.00000000' }, reason: 'Bù lỗi hiển thị phí ngày 08/10', ip: '203.0.113.5', createdAt: '2026-10-09T02:30:00.000Z' },
  { id: '8', actor: { id: U(5), email: 'admin@example.com' }, action: 'USER_LOCK', targetType: 'USER', targetId: U(3), before: { status: 'active' }, after: { status: 'locked' }, reason: 'Tạo tài khoản hàng loạt', ip: '203.0.113.5', createdAt: '2026-10-08T10:00:00.000Z' },
  { id: '7', actor: { id: U(6), email: 'owner@example.com' }, action: 'USER_ROLE', targetType: 'USER', targetId: U(4), before: { role: 'user' }, after: { role: 'support' }, reason: 'Nhân viên hỗ trợ mới', ip: '198.51.100.2', createdAt: '2026-09-30T09:00:00.000Z' },
  { id: '6', actor: { id: U(6), email: 'owner@example.com' }, action: 'SETTINGS_UPDATE', targetType: 'EXCHANGE', targetId: null, before: { feeRate: '0.002' }, after: { feeRate: '0.001' }, reason: 'Giảm phí giai đoạn thử nghiệm', ip: '198.51.100.2', createdAt: '2026-09-30T08:00:00.000Z' },
  { id: '1', actor: null, action: 'ROLE_BOOTSTRAP', targetType: 'USER', targetId: U(6), before: { role: 'user' }, after: { role: 'owner' }, reason: 'Initial owner', ip: null, createdAt: '2026-09-29T00:00:00.000Z' },
];

export const fixtureAdminOverview: AdminOverview = {
  users: { total: 128, newLast24h: 6, locked: 1, staff: 3 },
  orders: { open: 37, placedLast24h: 412 },
  trades: { last24h: 655 },
  tradingHalted: false,
  market: fixtureMarketStatus,
  lastReconciliation: fixtureReconciliationRuns[0]!,
  serverTime: T0,
};
