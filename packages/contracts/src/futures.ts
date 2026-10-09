import { z } from 'zod';
import { CandleInterval, DataStatus, DecimalString, IsoDateTime, OrderSide, OrderStatus, PositiveDecimalString, SymbolCode, TimeInForce, TimeRangeQuery } from './common.ts';
import { Ticker } from './market.ts';
import { Balance } from './wallet.ts';

/**
 * Simulated USDT-margined perpetual futures (phase F).
 * v1: isolated margin, one-way mode (one LONG or SHORT position per symbol), leverage 1–20×.
 * Prices come from Binance USDⓈ-M futures; users never trade with each other.
 * Quantities are in the contract's base unit: for 1000PEPEUSDT, quantity 1 = 1000 PEPE (see `multiplier`).
 */

export const MAX_LEVERAGE = 20;

export const MarginMode = z.enum(['ISOLATED', 'CROSS']);
export type MarginMode = z.infer<typeof MarginMode>;
export const PositionSide = z.enum(['LONG', 'SHORT']);
export type PositionSide = z.infer<typeof PositionSide>;
export const Leverage = z.number().int().min(1).max(MAX_LEVERAGE);

// ───────────────────────────── instruments & market data

export const FuturesSymbolInfo = z.object({
  symbol: SymbolCode,
  /** Contract base unit, e.g. "BTC" or "1000PEPE". */
  baseAsset: z.string(),
  quoteAsset: z.literal('USDT'),
  /** The coin behind it (for name/icon via exchangeInfo.assets), e.g. "PEPE". */
  underlyingAsset: z.string(),
  /** Coins per 1 unit of baseAsset: 1, or 1000 for "1000PEPE". */
  multiplier: z.number().int().positive(),
  tickSize: DecimalString,
  stepSize: DecimalString,
  minQty: DecimalString,
  maxQty: DecimalString,
  /** Minimum price × quantity in USDT. */
  minNotional: DecimalString,
  pricePrecision: z.number().int(),
  quantityPrecision: z.number().int(),
  /** Highest leverage allowed on this contract (≤ 20). */
  maxLeverage: Leverage,
  /** Maintenance margin rate, e.g. "0.004" = 0.4 % of the position value at the mark price. */
  maintenanceMarginRate: DecimalString,
  enabled: z.boolean(),
});
export type FuturesSymbolInfo = z.infer<typeof FuturesSymbolInfo>;

export const FuturesFees = z.object({
  /** Resting limit orders that get filled. */
  makerFee: DecimalString,
  /** Market orders, marketable limits, TP/SL closes. */
  takerFee: DecimalString,
  /** Charged on liquidation, on the position value at the mark price (capped by what is left). */
  liquidationFee: DecimalString,
});
export type FuturesFees = z.infer<typeof FuturesFees>;

export const FuturesExchangeInfo = z.object({
  tradingHalted: z.boolean(),
  fees: FuturesFees,
  maxLeverage: Leverage,
  /** Margin modes accepted right now (v1: ISOLATED only). */
  marginModes: z.array(MarginMode),
  symbols: z.array(FuturesSymbolInfo),
  serverTime: IsoDateTime,
});
export type FuturesExchangeInfo = z.infer<typeof FuturesExchangeInfo>;

/** Mark/index price and funding, from Binance (about every second). null = not received yet. */
export const MarkPrice = z.object({
  symbol: SymbolCode,
  markPrice: DecimalString.nullable(),
  indexPrice: DecimalString.nullable(),
  /** Funding rate for the next settlement, e.g. "0.0001" = 0.01 %. */
  fundingRate: DecimalString.nullable(),
  nextFundingTime: IsoDateTime.nullable(),
  status: DataStatus,
  updatedAt: IsoDateTime.nullable(),
});
export type MarkPrice = z.infer<typeof MarkPrice>;

/** 24h futures ticker + mark/funding. */
export const FuturesTicker = Ticker.extend({
  markPrice: DecimalString.nullable(),
  indexPrice: DecimalString.nullable(),
  fundingRate: DecimalString.nullable(),
  nextFundingTime: IsoDateTime.nullable(),
});
export type FuturesTicker = z.infer<typeof FuturesTicker>;

export const FundingEvent = z.object({
  symbol: SymbolCode,
  fundingTime: IsoDateTime,
  rate: DecimalString,
  markPrice: DecimalString,
});
export type FundingEvent = z.infer<typeof FundingEvent>;

export const FuturesCandlesQuery = z.object({
  interval: CandleInterval.default('1m'),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
  endTime: z.coerce.number().int().optional(),
});

// ───────────────────────────── account

/** The futures wallet (USDT). walletBalance = available + positionMargin + orderMargin. */
export const FuturesAccount = z.object({
  asset: z.literal('USDT'),
  walletBalance: DecimalString,
  /** Free: can open positions or be transferred to Spot. */
  available: DecimalString,
  /** Isolated margin held by open positions. */
  positionMargin: DecimalString,
  /** Reserved by open limit orders (margin + fee). */
  orderMargin: DecimalString,
  /** At the mark price; null when any open position has no live mark price (never 0 by guess). */
  unrealizedPnl: DecimalString.nullable(),
  /** walletBalance + unrealizedPnl; null when unrealizedPnl is null. */
  equity: DecimalString.nullable(),
  openPositions: z.number().int(),
});
export type FuturesAccount = z.infer<typeof FuturesAccount>;

export const TransferDirection = z.enum(['SPOT_TO_FUTURES', 'FUTURES_TO_SPOT']);
export const FuturesTransferRequest = z.object({
  direction: TransferDirection,
  asset: z.literal('USDT').default('USDT'),
  amount: PositiveDecimalString,
});
export const FuturesTransferResult = z.object({
  spot: Balance,
  futures: FuturesAccount,
});

/** Per-symbol settings of the user. Leverage can only change with no open position and no open orders on the symbol. */
export const FuturesSymbolSettings = z.object({
  symbol: SymbolCode,
  leverage: Leverage,
  marginMode: MarginMode,
});
export type FuturesSymbolSettings = z.infer<typeof FuturesSymbolSettings>;

export const SetLeverageRequest = z.object({ leverage: Leverage });

// ───────────────────────────── orders

export const FuturesOrderType = z.enum(['MARKET', 'LIMIT']);
/** Why the order exists: user trade, user close, or created by the engine. */
export const FuturesOrderPurpose = z.enum(['TRADE', 'CLOSE', 'TAKE_PROFIT', 'STOP_LOSS', 'LIQUIDATION', 'ADMIN']);

export const PositionTpSl = z.object({
  /** LONG: above the mark price · SHORT: below. Triggered by the mark price, closed at market. */
  takeProfitPrice: DecimalString.nullable(),
  /** LONG: below the mark price · SHORT: above. */
  stopLossPrice: DecimalString.nullable(),
});

const OrderBase = z.object({
  symbol: SymbolCode,
  /** BUY opens/increases a LONG or reduces a SHORT; SELL the opposite. */
  side: OrderSide,
  quantity: PositiveDecimalString,
  /** Only reduce the current position, never open or flip. */
  reduceOnly: z.boolean().default(false),
  clientOrderId: z.string().min(1).max(36).regex(/^[\w-]+$/).optional(),
  /** Set the position's TP/SL when this order opens or increases it (ignored for reduce-only). */
  tpsl: PositionTpSl.partial().optional(),
});

export const FuturesPlaceOrderRequest = z.discriminatedUnion('type', [
  OrderBase.extend({ type: z.literal('MARKET') }),
  OrderBase.extend({ type: z.literal('LIMIT'), price: PositiveDecimalString, timeInForce: TimeInForce.default('GTC') }),
]);
export type FuturesPlaceOrderRequest = z.input<typeof FuturesPlaceOrderRequest>;

export const FuturesOrder = z.object({
  id: z.string(),
  clientOrderId: z.string(),
  symbol: SymbolCode,
  side: OrderSide,
  type: FuturesOrderType,
  purpose: FuturesOrderPurpose,
  timeInForce: TimeInForce.nullable(),
  price: DecimalString.nullable(),
  quantity: DecimalString,
  executedQty: DecimalString,
  avgPrice: DecimalString.nullable(),
  reduceOnly: z.boolean(),
  leverage: Leverage,
  status: OrderStatus,
  /** USDT still reserved by this order (margin + fee). */
  lockedAmount: DecimalString,
  fee: DecimalString,
  /** PnL realized by the closing part of this order's fills (before fees). */
  realizedPnl: DecimalString,
  /** Why it ended early: USER_CANCELED, IOC_EXPIRED, INSUFFICIENT_LIQUIDITY, REDUCE_ONLY, LIQUIDATED, ADMIN, … */
  closeReason: z.string().nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type FuturesOrder = z.infer<typeof FuturesOrder>;

export const FuturesTrade = z.object({
  id: z.string(),
  orderId: z.string(),
  symbol: SymbolCode,
  side: OrderSide,
  price: DecimalString,
  quantity: DecimalString,
  quoteQty: DecimalString,
  fee: DecimalString,
  feeAsset: z.literal('USDT'),
  liquidity: z.enum(['MAKER', 'TAKER']),
  /** PnL of the part of this fill that closed a position (before fees); "0" for opening fills. */
  realizedPnl: DecimalString,
  createdAt: IsoDateTime,
});
export type FuturesTrade = z.infer<typeof FuturesTrade>;

export const FuturesSymbolFilterQuery = z.object({ symbol: SymbolCode.optional() });
export const FuturesHistoryQuery = TimeRangeQuery.extend({ symbol: SymbolCode.optional() });

export const FuturesCancelAllResponse = z.object({ canceled: z.array(FuturesOrder) });

// ───────────────────────────── positions

export const PositionCloseReason = z.enum(['USER', 'TAKE_PROFIT', 'STOP_LOSS', 'LIQUIDATION', 'ADMIN']);

export const FuturesPosition = z.object({
  id: z.string(),
  symbol: SymbolCode,
  side: PositionSide,
  status: z.enum(['OPEN', 'CLOSED']),
  marginMode: MarginMode,
  /** Open quantity (0 when CLOSED). */
  quantity: DecimalString,
  /** Largest quantity held, for history. */
  maxQuantity: DecimalString,
  entryPrice: DecimalString,
  /** Average price of the closing fills; null if nothing closed yet. */
  closePrice: DecimalString.nullable(),
  leverage: Leverage,
  /** Isolated margin (after adjustments and funding). */
  margin: DecimalString,
  /** Live values at the mark price; null when the mark price is not live. */
  markPrice: DecimalString.nullable(),
  unrealizedPnl: DecimalString.nullable(),
  /** unrealizedPnl / margin, e.g. "0.25" = +25 %. */
  returnOnMargin: DecimalString.nullable(),
  /** Estimated; null if it can never be liquidated. */
  liquidationPrice: DecimalString.nullable(),
  maintenanceMargin: DecimalString.nullable(),
  /** Sums over the life of the position. realizedPnl excludes fees and funding. */
  realizedPnl: DecimalString,
  fees: DecimalString,
  /** Net funding: + received, − paid. */
  funding: DecimalString,
  takeProfitPrice: DecimalString.nullable(),
  stopLossPrice: DecimalString.nullable(),
  closeReason: PositionCloseReason.nullable(),
  openedAt: IsoDateTime,
  closedAt: IsoDateTime.nullable(),
  updatedAt: IsoDateTime,
});
export type FuturesPosition = z.infer<typeof FuturesPosition>;

export const PositionSymbolParam = z.object({ symbol: SymbolCode });

export const ClosePositionRequest = z.object({
  /** Partial close; omit to close all. */
  quantity: PositiveDecimalString.optional(),
});

/** Signed: "+50" adds margin from the wallet, "-20" returns margin (must stay ≥ initial margin at the mark price). */
export const AdjustMarginRequest = z.object({
  amount: DecimalString.refine((s) => /[1-9]/.test(s), 'must not be 0'),
});

export const SetPositionTpSlRequest = PositionTpSl;

export const FuturesLedgerQuery = TimeRangeQuery.extend({
  hideLocks: z.enum(['true', 'false']).default('true'),
});

export const FundingHistoryQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

// ───────────────────────────── admin

export const AdminFuturesSymbol = FuturesSymbolInfo.extend({
  sourceStatus: z.string(),
  adminEnabled: z.boolean(),
  openPositions: z.number().int(),
  openOrders: z.number().int(),
  updatedAt: IsoDateTime,
});
export type AdminFuturesSymbol = z.infer<typeof AdminFuturesSymbol>;

export const UpdateFuturesSymbolRequest = z
  .object({
    enabled: z.boolean().optional(),
    maxLeverage: Leverage.optional(),
    /** 0.001 … 0.1 */
    maintenanceMarginRate: DecimalString.optional(),
    reason: z.string().trim().min(5).max(500),
  })
  .refine((r) => r.enabled !== undefined || r.maxLeverage !== undefined || r.maintenanceMarginRate !== undefined, { message: 'change at least one field' });

