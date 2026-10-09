/**
 * ⚠️ MOCK futures data — UI development and tests only. Trading rules are the real Binance USDⓈ-M
 * filters (2026-10-09); prices follow the fake spot mock prices × multiplier.
 */
import type { Candle, CandleInterval, Depth, FundingEvent, FuturesExchangeInfo, FuturesSymbolInfo, FuturesTicker, MarkPrice } from '../index.ts';
import { MOCK_PAIRS } from './index.ts';

interface MockContract {
  base: string;
  underlying: string;
  multiplier: number;
  tick: string;
  step: string;
  minQty: string;
  maxQty: string;
  minNotional: string;
}

export const MOCK_FUTURES: Record<string, MockContract> = {
  BTCUSDT: { base: 'BTC', underlying: 'BTC', multiplier: 1, tick: '0.1', step: '0.001', minQty: '0.001', maxQty: '1000', minNotional: '50' },
  ETHUSDT: { base: 'ETH', underlying: 'ETH', multiplier: 1, tick: '0.01', step: '0.001', minQty: '0.001', maxQty: '10000', minNotional: '20' },
  SOLUSDT: { base: 'SOL', underlying: 'SOL', multiplier: 1, tick: '0.01', step: '0.01', minQty: '0.01', maxQty: '1000000', minNotional: '5' },
  BNBUSDT: { base: 'BNB', underlying: 'BNB', multiplier: 1, tick: '0.01', step: '0.01', minQty: '0.01', maxQty: '100000', minNotional: '5' },
  XRPUSDT: { base: 'XRP', underlying: 'XRP', multiplier: 1, tick: '0.0001', step: '0.1', minQty: '0.1', maxQty: '10000000', minNotional: '5' },
  DOGEUSDT: { base: 'DOGE', underlying: 'DOGE', multiplier: 1, tick: '0.00001', step: '1', minQty: '1', maxQty: '300000000', minNotional: '5' },
  ADAUSDT: { base: 'ADA', underlying: 'ADA', multiplier: 1, tick: '0.0001', step: '1', minQty: '1', maxQty: '30000000', minNotional: '5' },
  AVAXUSDT: { base: 'AVAX', underlying: 'AVAX', multiplier: 1, tick: '0.001', step: '1', minQty: '1', maxQty: '500000', minNotional: '5' },
  LINKUSDT: { base: 'LINK', underlying: 'LINK', multiplier: 1, tick: '0.001', step: '0.01', minQty: '0.01', maxQty: '700000', minNotional: '20' },
  SUIUSDT: { base: 'SUI', underlying: 'SUI', multiplier: 1, tick: '0.0001', step: '0.1', minQty: '0.1', maxQty: '10000000', minNotional: '5' },
  NEARUSDT: { base: 'NEAR', underlying: 'NEAR', multiplier: 1, tick: '0.001', step: '1', minQty: '1', maxQty: '5000000', minNotional: '5' },
  UNIUSDT: { base: 'UNI', underlying: 'UNI', multiplier: 1, tick: '0.001', step: '1', minQty: '1', maxQty: '2000000', minNotional: '5' },
  ENAUSDT: { base: 'ENA', underlying: 'ENA', multiplier: 1, tick: '0.00001', step: '1', minQty: '1', maxQty: '20000000', minNotional: '5' },
  TAOUSDT: { base: 'TAO', underlying: 'TAO', multiplier: 1, tick: '0.01', step: '0.001', minQty: '0.001', maxQty: '20000', minNotional: '5' },
  ONDOUSDT: { base: 'ONDO', underlying: 'ONDO', multiplier: 1, tick: '0.0001', step: '0.1', minQty: '0.1', maxQty: '9000000', minNotional: '5' },
  '1000PEPEUSDT': { base: '1000PEPE', underlying: 'PEPE', multiplier: 1000, tick: '0.0000001', step: '1', minQty: '1', maxQty: '800000000', minNotional: '5' },
  WLDUSDT: { base: 'WLD', underlying: 'WLD', multiplier: 1, tick: '0.0001', step: '1', minQty: '1', maxQty: '20000000', minNotional: '5' },
  AAVEUSDT: { base: 'AAVE', underlying: 'AAVE', multiplier: 1, tick: '0.01', step: '0.1', minQty: '0.1', maxQty: '78000', minNotional: '5' },
  TRXUSDT: { base: 'TRX', underlying: 'TRX', multiplier: 1, tick: '0.00001', step: '1', minQty: '1', maxQty: '20000000', minNotional: '5' },
  BCHUSDT: { base: 'BCH', underlying: 'BCH', multiplier: 1, tick: '0.01', step: '0.001', minQty: '0.001', maxQty: '20000', minNotional: '20' },
  FETUSDT: { base: 'FET', underlying: 'FET', multiplier: 1, tick: '0.0001', step: '1', minQty: '1', maxQty: '10000000', minNotional: '5' },
  LTCUSDT: { base: 'LTC', underlying: 'LTC', multiplier: 1, tick: '0.01', step: '0.001', minQty: '0.001', maxQty: '170000', minNotional: '20' },
  TIAUSDT: { base: 'TIA', underlying: 'TIA', multiplier: 1, tick: '0.0001', step: '1', minQty: '1', maxQty: '7000000', minNotional: '5' },
  DOTUSDT: { base: 'DOT', underlying: 'DOT', multiplier: 1, tick: '0.0001', step: '0.1', minQty: '0.1', maxQty: '3000000', minNotional: '5' },
  APTUSDT: { base: 'APT', underlying: 'APT', multiplier: 1, tick: '0.0001', step: '0.1', minQty: '0.1', maxQty: '2000000', minNotional: '5' },
  FILUSDT: { base: 'FIL', underlying: 'FIL', multiplier: 1, tick: '0.0001', step: '0.1', minQty: '0.1', maxQty: '6000000', minNotional: '5' },
  HBARUSDT: { base: 'HBAR', underlying: 'HBAR', multiplier: 1, tick: '0.00001', step: '1', minQty: '1', maxQty: '30000000', minNotional: '5' },
  ARBUSDT: { base: 'ARB', underlying: 'ARB', multiplier: 1, tick: '0.00001', step: '0.1', minQty: '0.1', maxQty: '30000000', minNotional: '5' },
  XLMUSDT: { base: 'XLM', underlying: 'XLM', multiplier: 1, tick: '0.00001', step: '1', minQty: '1', maxQty: '10000000', minNotional: '5' },
  INJUSDT: { base: 'INJ', underlying: 'INJ', multiplier: 1, tick: '0.001', step: '0.1', minQty: '0.1', maxQty: '500000', minNotional: '5' },
  ATOMUSDT: { base: 'ATOM', underlying: 'ATOM', multiplier: 1, tick: '0.001', step: '0.01', minQty: '0.01', maxQty: '2000000', minNotional: '5' },
  TRUMPUSDT: { base: 'TRUMP', underlying: 'TRUMP', multiplier: 1, tick: '0.001', step: '0.01', minQty: '0.01', maxQty: '3000000', minNotional: '5' },
  PENGUUSDT: { base: 'PENGU', underlying: 'PENGU', multiplier: 1, tick: '0.000001', step: '1', minQty: '1', maxQty: '200000000', minNotional: '5' },
  ICPUSDT: { base: 'ICP', underlying: 'ICP', multiplier: 1, tick: '0.001', step: '1', minQty: '1', maxQty: '500000', minNotional: '5' },
  JUPUSDT: { base: 'JUP', underlying: 'JUP', multiplier: 1, tick: '0.0001', step: '1', minQty: '1', maxQty: '5000000', minNotional: '5' },
  ALGOUSDT: { base: 'ALGO', underlying: 'ALGO', multiplier: 1, tick: '0.00001', step: '0.1', minQty: '0.1', maxQty: '10000000', minNotional: '5' },
  OPUSDT: { base: 'OP', underlying: 'OP', multiplier: 1, tick: '0.00001', step: '0.1', minQty: '0.1', maxQty: '10000000', minNotional: '5' },
  VIRTUALUSDT: { base: 'VIRTUAL', underlying: 'VIRTUAL', multiplier: 1, tick: '0.0001', step: '0.1', minQty: '0.1', maxQty: '2000000', minNotional: '5' },
  RENDERUSDT: { base: 'RENDER', underlying: 'RENDER', multiplier: 1, tick: '0.001', step: '0.1', minQty: '0.1', maxQty: '1000000', minNotional: '5' },
  CRVUSDT: { base: 'CRV', underlying: 'CRV', multiplier: 1, tick: '0.0001', step: '0.1', minQty: '0.1', maxQty: '4000000', minNotional: '5' },
  LDOUSDT: { base: 'LDO', underlying: 'LDO', multiplier: 1, tick: '0.0001', step: '1', minQty: '1', maxQty: '3000000', minNotional: '5' },
  POLUSDT: { base: 'POL', underlying: 'POL', multiplier: 1, tick: '0.00001', step: '1', minQty: '1', maxQty: '15000000', minNotional: '5' },
  SEIUSDT: { base: 'SEI', underlying: 'SEI', multiplier: 1, tick: '0.00001', step: '1', minQty: '1', maxQty: '20000000', minNotional: '5' },
  '1000SHIBUSDT': { base: '1000SHIB', underlying: 'SHIB', multiplier: 1000, tick: '0.000001', step: '1', minQty: '1', maxQty: '800000000', minNotional: '5' },
  ETCUSDT: { base: 'ETC', underlying: 'ETC', multiplier: 1, tick: '0.001', step: '0.01', minQty: '0.01', maxQty: '400000', minNotional: '20' },
  WIFUSDT: { base: 'WIF', underlying: 'WIF', multiplier: 1, tick: '0.0001', step: '0.1', minQty: '0.1', maxQty: '6000000', minNotional: '5' },
  '1000BONKUSDT': { base: '1000BONK', underlying: 'BONK', multiplier: 1000, tick: '0.000001', step: '1', minQty: '1', maxQty: '400000000', minNotional: '5' },
  '1000FLOKIUSDT': { base: '1000FLOKI', underlying: 'FLOKI', multiplier: 1000, tick: '0.00001', step: '1', minQty: '1', maxQty: '40000000', minNotional: '5' },
  KAIAUSDT: { base: 'KAIA', underlying: 'KAIA', multiplier: 1, tick: '0.00001', step: '1', minQty: '1', maxQty: '15000000', minNotional: '5' },
  STXUSDT: { base: 'STX', underlying: 'STX', multiplier: 1, tick: '0.0001', step: '1', minQty: '1', maxQty: '4000000', minNotional: '5' },
};

const T0 = '2026-10-09T03:00:00.000Z';
const dp = (step: string) => (step.includes('.') ? step.split('.')[1]!.replace(/0+$/, '').length : 0);
export const fmtFuturesPrice = (symbol: string, p: number) => p.toFixed(dp(MOCK_FUTURES[symbol]!.tick));
export const fmtFuturesQty = (symbol: string, q: number) => q.toFixed(dp(MOCK_FUTURES[symbol]!.step));
/** BTC/ETH 0.4 %, everything else 0.5 % (same defaults as the server). */
export const mockMmr = (symbol: string) => (symbol === 'BTCUSDT' || symbol === 'ETHUSDT' ? 0.004 : 0.005);
/** Futures trade a hair above spot (basis), like real perpetuals most of the time. */
export const mockFuturesPrice = (symbol: string, spotPrices: Record<string, number>) => {
  const c = MOCK_FUTURES[symbol]!;
  return (spotPrices[`${c.underlying}USDT`] ?? MOCK_PAIRS[`${c.underlying}USDT`]!.price) * c.multiplier * 1.0003;
};

/** LINKUSDT has no live mark price and AVAXUSDT is STALE, mirroring the spot fixtures. */
export const MOCK_FUTURES_FROZEN = new Set(['LINKUSDT', 'AVAXUSDT']);

export const fixtureFuturesSymbols: FuturesSymbolInfo[] = Object.entries(MOCK_FUTURES).map(([symbol, c]) => ({
  symbol,
  baseAsset: c.base,
  quoteAsset: 'USDT' as const,
  underlyingAsset: c.underlying,
  multiplier: c.multiplier,
  tickSize: c.tick,
  stepSize: c.step,
  minQty: c.minQty,
  maxQty: c.maxQty,
  minNotional: c.minNotional,
  pricePrecision: dp(c.tick),
  quantityPrecision: dp(c.step),
  maxLeverage: 20,
  maintenanceMarginRate: String(mockMmr(symbol)),
  enabled: symbol !== 'SUIUSDT',
}));

export const fixtureFuturesExchangeInfo: FuturesExchangeInfo = {
  tradingHalted: false,
  fees: { makerFee: '0.0002', takerFee: '0.0005', liquidationFee: '0.005' },
  maxLeverage: 20,
  marginModes: ['ISOLATED'],
  symbols: fixtureFuturesSymbols,
  serverTime: T0,
};

/** Next 8-hourly funding time (00:00, 08:00, 16:00 UTC) after `now`. */
export const nextFundingTime = (now = Date.now()) => Math.floor(now / 28_800_000) * 28_800_000 + 28_800_000;
export const MOCK_FUNDING_RATE = '0.0001';

export function fixtureMarkPrice(symbol: string, price: number, now = Date.now()): MarkPrice {
  if (symbol === 'LINKUSDT') return { symbol, markPrice: null, indexPrice: null, fundingRate: null, nextFundingTime: null, status: 'UNAVAILABLE', updatedAt: null };
  return {
    symbol,
    markPrice: fmtFuturesPrice(symbol, price),
    indexPrice: fmtFuturesPrice(symbol, price / 1.0003),
    fundingRate: MOCK_FUNDING_RATE,
    nextFundingTime: new Date(nextFundingTime(now)).toISOString(),
    status: symbol === 'AVAXUSDT' ? 'STALE' : 'LIVE',
    updatedAt: new Date(now).toISOString(),
  };
}

export function fixtureFuturesTicker(symbol: string, price: number, now = Date.now()): FuturesTicker {
  const m = fixtureMarkPrice(symbol, price, now);
  if (m.status === 'UNAVAILABLE') {
    return { symbol, lastPrice: null, openPrice: null, highPrice: null, lowPrice: null, priceChange: null, priceChangePercent: null, volume: null, quoteVolume: null, bestBid: null, bestAsk: null, status: 'UNAVAILABLE', updatedAt: null, markPrice: null, indexPrice: null, fundingRate: null, nextFundingTime: null };
  }
  const open = price / 1.02;
  const tick = Number(MOCK_FUTURES[symbol]!.tick);
  return {
    symbol,
    lastPrice: fmtFuturesPrice(symbol, price),
    openPrice: fmtFuturesPrice(symbol, open),
    highPrice: fmtFuturesPrice(symbol, price * 1.02),
    lowPrice: fmtFuturesPrice(symbol, open * 0.99),
    priceChange: fmtFuturesPrice(symbol, price - open),
    priceChangePercent: (((price - open) / open) * 100).toFixed(3),
    volume: '54321.000',
    quoteVolume: (54321 * price).toFixed(8),
    bestBid: fmtFuturesPrice(symbol, price - tick),
    bestAsk: fmtFuturesPrice(symbol, price),
    status: m.status,
    updatedAt: m.updatedAt,
    markPrice: m.markPrice,
    indexPrice: m.indexPrice,
    fundingRate: m.fundingRate,
    nextFundingTime: m.nextFundingTime,
  };
}

export function fixtureFuturesDepth(symbol: string, mid: number, levels = 20): Depth {
  const c = MOCK_FUTURES[symbol]!;
  const tick = Number(c.tick);
  const qty = (i: number) => fmtFuturesQty(symbol, ((((i * 37) % 11) + 1) * Number(c.minQty) * 50));
  return {
    symbol,
    // tiny-priced contracts would go below zero deep in the book: stop there
    bids: Array.from({ length: levels }, (_, i) => [fmtFuturesPrice(symbol, mid - tick * (i + 1) * 3), qty(i)] as [string, string]).filter(([p]) => Number(p) > 0),
    asks: Array.from({ length: levels }, (_, i) => [fmtFuturesPrice(symbol, mid + tick * i * 3), qty(i + 3)] as [string, string]),
    status: MOCK_FUTURES_FROZEN.has(symbol) ? (symbol === 'LINKUSDT' ? 'UNAVAILABLE' : 'STALE') : 'LIVE',
    updatedAt: T0,
  };
}

const INTERVAL_MS: Record<CandleInterval, number> = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 };

export function fixtureFuturesCandles(symbol: string, interval: CandleInterval, price: number, n = 200, end = Date.parse(T0)): Candle[] {
  const ms = INTERVAL_MS[interval];
  const start = Math.floor(end / ms) * ms - (n - 1) * ms;
  return Array.from({ length: n }, (_, i) => {
    const o = price * (1 + Math.sin(i / 8) / 35 + Math.sin(i / 2.1) / 180);
    const c = price * (1 + Math.sin((i + 1) / 8) / 35 + Math.sin((i + 1) / 2.1) / 180);
    const openTime = start + i * ms;
    return {
      openTime,
      closeTime: openTime + ms - 1,
      open: fmtFuturesPrice(symbol, o),
      high: fmtFuturesPrice(symbol, Math.max(o, c) * 1.003),
      low: fmtFuturesPrice(symbol, Math.min(o, c) * 0.997),
      close: fmtFuturesPrice(symbol, c),
      volume: (500 + ((i * 17) % 90)).toFixed(3),
      quoteVolume: ((500 + ((i * 17) % 90)) * c).toFixed(8),
      closed: i < n - 1,
    };
  });
}

export function fixtureFundingEvents(symbol: string, price: number, n = 10, now = Date.now()): FundingEvent[] {
  const last = nextFundingTime(now) - 28_800_000;
  return Array.from({ length: n }, (_, i) => ({
    symbol,
    fundingTime: new Date(last - i * 28_800_000).toISOString(),
    rate: ['0.0001', '0.00008', '-0.00002', '0.00012', '0.0001'][i % 5]!,
    markPrice: fmtFuturesPrice(symbol, price * (1 - i / 400)),
  }));
}
