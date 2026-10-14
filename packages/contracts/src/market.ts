import { z } from 'zod';
import { CandleInterval, DataStatus, DecimalString, EpochMs, IsoDateTime, SymbolCode } from './common.ts';
import { TaxMode } from './tax.ts';

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

/** Sector tags for grouping coins (market page chips). Labels: ASSET_TAG_LABELS. */
export const AssetTag = z.enum(['LAYER1', 'LAYER2', 'MEME', 'AI', 'DEFI', 'RWA', 'PAYMENTS', 'INFRA', 'STORAGE', 'EXCHANGE', 'STABLECOIN']);
export type AssetTag = z.infer<typeof AssetTag>;

export const ASSET_TAG_LABELS: Record<AssetTag, { vi: string; en: string }> = {
  LAYER1: { vi: 'Layer 1', en: 'Layer 1' },
  LAYER2: { vi: 'Layer 2', en: 'Layer 2' },
  MEME: { vi: 'Meme', en: 'Meme' },
  AI: { vi: 'AI', en: 'AI' },
  DEFI: { vi: 'DeFi', en: 'DeFi' },
  RWA: { vi: 'Tài sản thực (RWA)', en: 'RWA' },
  PAYMENTS: { vi: 'Thanh toán', en: 'Payments' },
  INFRA: { vi: 'Hạ tầng', en: 'Infrastructure' },
  STORAGE: { vi: 'Lưu trữ', en: 'Storage' },
  EXCHANGE: { vi: 'Token sàn', en: 'Exchange token' },
  STABLECOIN: { vi: 'Stablecoin', en: 'Stablecoin' },
};

/** Display info for a coin. Fields we do not have are null / empty (admin can fill them in). */
export const AssetInfo = z.object({
  asset: z.string(),
  /** Full name, e.g. "Bitcoin". */
  name: z.string().nullable(),
  tags: z.array(AssetTag),
  /** Short plain-text description (no HTML/Markdown). */
  description: z.string().nullable(),
});
export type AssetInfo = z.infer<typeof AssetInfo>;

export const ExchangeInfo = z.object({
  /** Emergency stop set by admin: no new orders, no matching. */
  tradingHalted: z.boolean(),
  /** Fee rate applied to the received asset, e.g. "0.001" = 0.1%. */
  feeRate: DecimalString,
  /**
   * Vietnam tax (0.15.0, test exchange): WITHHOLD = every spot SELL fill pays roundUp8(quoteQty × taxRate) in the quote
   * asset, on the gross value, besides the fee (BUY never). OFF = nothing withheld: hide the tax line of the order form.
   * DOMESTIC_ORG sellers are not withheld (`taxProfile`). See tax.ts.
   */
  taxMode: TaxMode,
  taxRate: DecimalString,
  /** VND per 1 USDT, a reference rate set by the exchange; null = not set → show no VND amount. */
  taxVndRate: DecimalString.nullable(),
  taxVndRateUpdatedAt: IsoDateTime.nullable(),
  symbols: z.array(SymbolInfo),
  /** One entry per asset used by `symbols` (base and quote), in symbol order. */
  assets: z.array(AssetInfo),
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

/**
 * Order book. Levels 1–20 are live (Binance stream). With `limit` > 20 the levels beyond the
 * live top 20 come from a REST snapshot refreshed every 1–3 s (for price grouping / depth chart);
 * if the snapshot is unavailable you get only the live levels.
 */
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

export const DepthQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(20),
});

/** Mini price chart for market lists. 24h = hourly closes, 7d = 4-hourly closes. */
export const SparklineRange = z.enum(['24h', '7d']);
export type SparklineRange = z.infer<typeof SparklineRange>;

export const SparklinesQuery = z.object({ range: SparklineRange.default('24h') });

export const Sparkline = z.object({
  symbol: SymbolCode,
  /** Close prices, oldest first; the last point is the forming candle. Empty when unavailable. */
  points: z.array(DecimalString),
  /** LIVE: feed is live · STALE: history only, the last point may be old · UNAVAILABLE: no points. */
  status: DataStatus,
});
export type Sparkline = z.infer<typeof Sparkline>;

export const Sparklines = z.object({
  range: SparklineRange,
  interval: CandleInterval,
  items: z.array(Sparkline),
  updatedAt: IsoDateTime,
});
export type Sparklines = z.infer<typeof Sparklines>;

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

/** Exchange-wide switches, pushed on `exchange:status` whenever an admin changes them. */
export const ExchangeStatus = z.object({
  tradingHalted: z.boolean(),
  /** Pairs that do not accept orders right now (admin-disabled or not trading on Binance). */
  disabledSymbols: z.array(SymbolCode),
  /**
   * Vietnam tax settings in force (0.16.0), the same values as `exchangeInfo.taxMode/taxRate/taxVndRate`: pushed when an admin
   * changes them so an open SELL form updates without a reload.
   */
  taxMode: TaxMode,
  taxRate: DecimalString,
  taxVndRate: DecimalString.nullable(),
  updatedAt: IsoDateTime,
});
export type ExchangeStatus = z.infer<typeof ExchangeStatus>;
