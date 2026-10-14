import { z } from 'zod';
import {
  CloseReason,
  DecimalString,
  IsoDateTime,
  OrderSide,
  OrderStatus,
  OrderType,
  PositiveDecimalString,
  SymbolCode,
  TimeInForce,
  TimeRangeQuery,
  TriggerDirection,
  TriggerState,
} from './common.ts';

const ClientOrderId = z.string().regex(/^[A-Za-z0-9_-]{1,36}$/);

// ───────────────────────────── attached take-profit / stop-loss (BUY only)

/**
 * TP/SL attached to a BUY order. When the BUY finishes (filled, or canceled/expired after a partial
 * fill) the server places a SELL for the base actually received (after fee, floored to stepSize):
 *   TP + SL → an OCO (limit at takeProfitPrice + stop at stopLossPrice)
 *   TP only → a LIMIT sell · SL only → a STOP_MARKET (or STOP_LIMIT when stopLossLimitPrice is set)
 */
export const TpSlInput = z
  .object({
    takeProfitPrice: PositiveDecimalString.optional(),
    /** Trigger price of the stop-loss. */
    stopLossPrice: PositiveDecimalString.optional(),
    /** If set, the stop-loss becomes a STOP_LIMIT at this price instead of STOP_MARKET. */
    stopLossLimitPrice: PositiveDecimalString.optional(),
  })
  .refine((t) => t.takeProfitPrice !== undefined || t.stopLossPrice !== undefined, { message: 'set takeProfitPrice and/or stopLossPrice' })
  .refine((t) => t.stopLossLimitPrice === undefined || t.stopLossPrice !== undefined, { message: 'stopLossLimitPrice needs stopLossPrice' });
export type TpSlInput = z.input<typeof TpSlInput>;

/** Exactly one of quantity / quoteOrderQty. */
const oneOfQty = (o: { quantity?: string; quoteOrderQty?: string }) => (o.quantity === undefined) !== (o.quoteOrderQty === undefined);
/** Stop-market & trailing: SELL by quantity (base locked), BUY by quoteOrderQty (USDT locked) so funds can be reserved exactly. */
const stopQtyRule = (o: { side: string; quantity?: string; quoteOrderQty?: string }) =>
  o.side === 'SELL' ? o.quantity !== undefined && o.quoteOrderQty === undefined : o.quoteOrderQty !== undefined && o.quantity === undefined;
const tpslOnlyOnBuy = (o: { side: string; tpsl?: unknown }) => o.tpsl === undefined || o.side === 'BUY';

const MarketOrderInput = z
  .object({
    symbol: SymbolCode,
    side: OrderSide,
    type: z.literal('MARKET'),
    /** Base-asset quantity (e.g. BTC). Provide exactly one of quantity / quoteOrderQty. */
    quantity: PositiveDecimalString.optional(),
    /** Quote-asset amount (USDT) to spend (BUY) or receive (SELL). */
    quoteOrderQty: PositiveDecimalString.optional(),
    tpsl: TpSlInput.optional(),
    clientOrderId: ClientOrderId.optional(),
  })
  .refine(oneOfQty, { message: 'provide exactly one of quantity or quoteOrderQty' })
  .refine(tpslOnlyOnBuy, { message: 'tpsl is only allowed on BUY orders' });

const LimitOrderInput = z
  .object({
    symbol: SymbolCode,
    side: OrderSide,
    type: z.literal('LIMIT'),
    quantity: PositiveDecimalString,
    price: PositiveDecimalString,
    timeInForce: TimeInForce.default('GTC'),
    tpsl: TpSlInput.optional(),
    clientOrderId: ClientOrderId.optional(),
  })
  .refine(tpslOnlyOnBuy, { message: 'tpsl is only allowed on BUY orders' });

/** Becomes a MARKET order when the last price reaches stopPrice. */
const StopMarketOrderInput = z
  .object({
    symbol: SymbolCode,
    side: OrderSide,
    type: z.literal('STOP_MARKET'),
    stopPrice: PositiveDecimalString,
    /** SELL only. */
    quantity: PositiveDecimalString.optional(),
    /** BUY only: USDT to spend when triggered (reserved now). */
    quoteOrderQty: PositiveDecimalString.optional(),
    clientOrderId: ClientOrderId.optional(),
  })
  .refine(stopQtyRule, { message: 'SELL needs quantity, BUY needs quoteOrderQty' });

/** Becomes a LIMIT order at `price` when the last price reaches stopPrice. */
const StopLimitOrderInput = z.object({
  symbol: SymbolCode,
  side: OrderSide,
  type: z.literal('STOP_LIMIT'),
  stopPrice: PositiveDecimalString,
  price: PositiveDecimalString,
  quantity: PositiveDecimalString,
  timeInForce: TimeInForce.default('GTC'),
  clientOrderId: ClientOrderId.optional(),
});

/**
 * Trailing stop (market). SELL: follows the highest price since activation and triggers when the price
 * falls trailingDeltaBips below it. BUY: follows the lowest price and triggers when it rises that much.
 * 100 bips = 1%. Without activationPrice the order is active immediately.
 */
const TrailingStopOrderInput = z
  .object({
    symbol: SymbolCode,
    side: OrderSide,
    type: z.literal('TRAILING_STOP_MARKET'),
    trailingDeltaBips: z.number().int().min(10).max(2000),
    activationPrice: PositiveDecimalString.optional(),
    quantity: PositiveDecimalString.optional(),
    quoteOrderQty: PositiveDecimalString.optional(),
    clientOrderId: ClientOrderId.optional(),
  })
  .refine(stopQtyRule, { message: 'SELL needs quantity, BUY needs quoteOrderQty' });

export const PlaceOrderRequest = z.union([MarketOrderInput, LimitOrderInput, StopMarketOrderInput, StopLimitOrderInput, TrailingStopOrderInput]);
export type PlaceOrderRequest = z.input<typeof PlaceOrderRequest>;

// ───────────────────────────── order

export const TpSlState = z.enum([
  /** waiting for the BUY to finish */
  'PENDING',
  /** child orders placed — see childOrderListId / childOrderIds */
  'PLACED',
  /** not placed: received quantity below the pair's minimum (see skippedReason) */
  'SKIPPED',
]);

export const AttachedTpSl = z.object({
  takeProfitPrice: DecimalString.nullable(),
  stopLossPrice: DecimalString.nullable(),
  stopLossLimitPrice: DecimalString.nullable(),
  state: TpSlState,
  childOrderListId: z.string().nullable(),
  childOrderIds: z.array(z.string()),
  skippedReason: z.string().nullable(),
});
export type AttachedTpSl = z.infer<typeof AttachedTpSl>;

/** Who placed the order: the user, or one of the user's bots (bot orders are managed by the bot). */
export const OrderSource = z.enum(['USER', 'GRID', 'DCA']);
export type OrderSource = z.infer<typeof OrderSource>;

export const Order = z.object({
  id: z.string(),
  clientOrderId: z.string(),
  source: OrderSource,
  /** Grid bot id / DCA plan id for bot orders; null for the user's own orders. */
  sourceId: z.string().nullable(),
  symbol: SymbolCode,
  side: OrderSide,
  type: OrderType,
  timeInForce: TimeInForce.nullable(),
  status: OrderStatus,
  /** Limit price (LIMIT, STOP_LIMIT, OCO legs). */
  price: DecimalString.nullable(),
  /** Trigger price. For trailing stops: the current trigger level (moves with the market), null before activation. */
  stopPrice: DecimalString.nullable(),
  /** Requested base quantity; null for orders placed by quoteOrderQty. */
  quantity: DecimalString.nullable(),
  quoteOrderQty: DecimalString.nullable(),
  executedQty: DecimalString,
  cumulativeQuoteQty: DecimalString,
  /** cumulativeQuoteQty / executedQty; null while nothing is filled. */
  avgPrice: DecimalString.nullable(),
  /** Stop / trailing orders only. */
  triggerState: TriggerState.nullable(),
  triggerDirection: TriggerDirection.nullable(),
  triggeredAt: IsoDateTime.nullable(),
  trailingDeltaBips: z.number().int().nullable(),
  activationPrice: DecimalString.nullable(),
  /** Highest (SELL) / lowest (BUY) price seen since activation; null before activation. */
  trailingReferencePrice: DecimalString.nullable(),
  /** OCO this order belongs to. */
  orderListId: z.string().nullable(),
  /** The BUY order whose TP/SL created this order. */
  parentOrderId: z.string().nullable(),
  /** TP/SL attached to this BUY order. */
  tpsl: AttachedTpSl.nullable(),
  /** Why the order ended CANCELED/EXPIRED; null otherwise. */
  closeReason: CloseReason.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Order = z.infer<typeof Order>;

/** One execution of one of the user's orders. */
export const Trade = z.object({
  id: z.string(),
  orderId: z.string(),
  symbol: SymbolCode,
  side: OrderSide,
  price: DecimalString,
  quantity: DecimalString,
  quoteQty: DecimalString,
  /** Fee is taken from the received asset: base on BUY, quote on SELL. */
  fee: DecimalString,
  feeAsset: z.string(),
  /**
   * Vietnam tax withheld from this fill (0.15.0), in the quote asset (= feeAsset of a SELL): roundUp8(quoteQty × taxRate)
   * on the gross value. Always present: "0.00000000" for BUY, with tax OFF, for DOMESTIC_ORG sellers and before 0.15.0.
   * USDT received by a SELL = quoteQty − fee − tax.
   */
  tax: DecimalString,
  liquidity: z.enum(['MAKER', 'TAKER']),
  /**
   * USDT profit/loss realized by this SELL against the average cost, after fee AND tax:
   * (quoteQty − fee − tax) − quantity × average cost. null for BUY, and for a SELL without a cost basis.
   */
  realizedPnl: DecimalString.nullable(),
  createdAt: IsoDateTime,
});
export type Trade = z.infer<typeof Trade>;

export const PlaceOrderResponse = z.object({
  order: Order,
  /** Fills that happened immediately (market orders, marketable limit orders). */
  fills: z.array(Trade),
});
export type PlaceOrderResponse = z.infer<typeof PlaceOrderResponse>;

export const SymbolFilterQuery = z.object({ symbol: SymbolCode.optional() });
export const HistoryQuery = SymbolFilterQuery.extend(TimeRangeQuery.shape);

export const CancelAllResponse = z.object({ canceled: z.array(Order) });
export type CancelAllResponse = z.infer<typeof CancelAllResponse>;

// ───────────────────────────── OCO (order list)

/**
 * One-Cancels-the-Other: a LIMIT leg and a STOP leg sharing the same funds.
 *   SELL: price > last price > stopPrice  (take profit above, stop loss below)
 *   BUY:  price < last price < stopPrice  (buy the dip below, or the breakout above) — BUY needs stopLimitPrice
 * When one leg fills or triggers, the other is canceled (closeReason OCO_SIBLING).
 */
export const PlaceOcoRequest = z
  .object({
    symbol: SymbolCode,
    side: OrderSide,
    quantity: PositiveDecimalString,
    /** Limit leg price. */
    price: PositiveDecimalString,
    stopPrice: PositiveDecimalString,
    /** Stop leg becomes STOP_LIMIT at this price; omitted → STOP_MARKET (SELL only). */
    stopLimitPrice: PositiveDecimalString.optional(),
    clientListId: ClientOrderId.optional(),
  })
  .refine((o) => o.side === 'SELL' || o.stopLimitPrice !== undefined, { message: 'BUY OCO needs stopLimitPrice' });
export type PlaceOcoRequest = z.input<typeof PlaceOcoRequest>;

export const OrderList = z.object({
  id: z.string(),
  clientListId: z.string(),
  symbol: SymbolCode,
  side: OrderSide,
  contingencyType: z.literal('OCO'),
  /** EXECUTING while both legs are open; ALL_DONE once one filled/triggered or the list was canceled. */
  listStatus: z.enum(['EXECUTING', 'ALL_DONE']),
  /** [limit leg, stop leg] */
  orders: z.array(Order),
  /** Set when the OCO was created from a BUY order's TP/SL. */
  parentOrderId: z.string().nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type OrderList = z.infer<typeof OrderList>;
