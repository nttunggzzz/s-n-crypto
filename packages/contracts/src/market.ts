import { z } from 'zod';
import { CandleInterval, DataStatus, DecimalString, EpochMs, IsoDateTime, SymbolCode } from './common.ts';

export const SymbolInfo = z.object({
  symbol: SymbolCode,
  baseAsset: z.string(),
  quoteAsset: z.string(),
  /** Price must be a multiple of tickSize. */
  tickSize: DecimalString,
  /** Quantity must be a multiple of stepSize. */
  stepSize: DecimalString,
  minQty: DecimalString,
  maxQty: DecimalString,
  /** Minimum quantity * price, in quote asset. */
  minNotional: DecimalString,
  /** Decimals to display, derived from tickSize / stepSize. */
  pricePrecision: z.number().int(),
  quantityPrecision: z.number().int(),
  /** Admin can disable a pair; disabled pairs reject new orders. */
  enabled: z.boolean(),
});
export type SymbolInfo = z.infer<typeof SymbolInfo>;

export const ExchangeInfo = z.object({
  /** Emergency stop set by admin: no new orders, no matching. */
  tradingHalted: z.boolean(),
  /** Fee rate applied to the received asset, e.g. "0.001" = 0.1%. */
  feeRate: DecimalString,
  symbols: z.array(SymbolInfo),
  serverTime: IsoDateTime,
});
export type ExchangeInfo = z.infer<typeof ExchangeInfo>;

/** 24h rolling stats + best bid/ask. Any field Binance has not sent yet is null (never 0). */
export const Ticker = z.object({
  symbol: SymbolCode,
  lastPrice: DecimalString.nullable(),
  openPrice: DecimalString.nullable(),
  highPrice: DecimalString.nullable(),
  lowPrice: DecimalString.nullable(),
  priceChange: DecimalString.nullable(),
  priceChangePercent: DecimalString.nullable(),
  volume: DecimalString.nullable(),
  quoteVolume: DecimalString.nullable(),
  bestBid: DecimalString.nullable(),
  bestAsk: DecimalString.nullable(),
  status: DataStatus,
  updatedAt: IsoDateTime.nullable(),
});
export type Ticker = z.infer<typeof Ticker>;

/** [price, quantity] */
export const DepthLevel = z.tuple([DecimalString, DecimalString]);

export const Depth = z.object({
  symbol: SymbolCode,
  bids: z.array(DepthLevel),
  asks: z.array(DepthLevel),
  status: DataStatus,
  updatedAt: IsoDateTime.nullable(),
});
export type Depth = z.infer<typeof Depth>;

/** A public trade on Binance (not a trade of our users). */
export const MarketTrade = z.object({
  id: z.number().int(),
  price: DecimalString,
  qty: DecimalString,
  time: EpochMs,
  /** true = the seller was the taker (displayed red). */
  isBuyerMaker: z.boolean(),
});
export type MarketTrade = z.infer<typeof MarketTrade>;

export const MarketTrades = z.object({
  symbol: SymbolCode,
  items: z.array(MarketTrade),
  status: DataStatus,
});
export type MarketTrades = z.infer<typeof MarketTrades>;

export const Candle = z.object({
  /** Open time of the bucket, epoch ms UTC. */
  openTime: EpochMs,
  closeTime: EpochMs,
  open: DecimalString,
  high: DecimalString,
  low: DecimalString,
  close: DecimalString,
  volume: DecimalString,
  quoteVolume: DecimalString,
  /** false only for the currently forming candle. */
  closed: z.boolean(),
});
export type Candle = z.infer<typeof Candle>;

export const Candles = z.object({
  symbol: SymbolCode,
  interval: CandleInterval,
  items: z.array(Candle),
});
export type Candles = z.infer<typeof Candles>;

export const CandlesQuery = z.object({
  interval: CandleInterval.default('1m'),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
  /** Return candles with openTime < endTime (for loading older history). */
  endTime: z.coerce.number().int().optional(),
});

export const LimitQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const MarketConnection = z.enum(['CONNECTED', 'CONNECTING', 'DISCONNECTED']);

export const MarketStatus = z.object({
  connection: MarketConnection,
  staleThresholdMs: z.number().int(),
  symbols: z.array(
    z.object({
      symbol: SymbolCode,
      status: DataStatus,
      lastUpdateAt: IsoDateTime.nullable(),
    }),
  ),
});
export type MarketStatus = z.infer<typeof MarketStatus>;
