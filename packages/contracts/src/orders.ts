import { z } from 'zod';
import {
  DecimalString,
  IsoDateTime,
  OrderSide,
  OrderStatus,
  OrderType,
  PositiveDecimalString,
  SymbolCode,
  TimeInForce,
} from './common.ts';

const ClientOrderId = z.string().regex(/^[A-Za-z0-9_-]{1,36}$/);

const MarketOrderInput = z
  .object({
    symbol: SymbolCode,
    side: OrderSide,
    type: z.literal('MARKET'),
    /** Base-asset quantity (e.g. BTC). Provide exactly one of quantity / quoteOrderQty. */
    quantity: PositiveDecimalString.optional(),
    /** Quote-asset amount (USDT) to spend (BUY) or receive (SELL). */
    quoteOrderQty: PositiveDecimalString.optional(),
    clientOrderId: ClientOrderId.optional(),
  })
  .refine((o) => (o.quantity === undefined) !== (o.quoteOrderQty === undefined), {
    message: 'provide exactly one of quantity or quoteOrderQty',
  });

const LimitOrderInput = z.object({
  symbol: SymbolCode,
  side: OrderSide,
  type: z.literal('LIMIT'),
  quantity: PositiveDecimalString,
  price: PositiveDecimalString,
  timeInForce: TimeInForce.default('GTC'),
  clientOrderId: ClientOrderId.optional(),
});

export const PlaceOrderRequest = z.union([MarketOrderInput, LimitOrderInput]);
export type PlaceOrderRequest = z.input<typeof PlaceOrderRequest>;

export const Order = z.object({
  id: z.string(),
  clientOrderId: z.string(),
  symbol: SymbolCode,
  side: OrderSide,
  type: OrderType,
  timeInForce: TimeInForce.nullable(),
  status: OrderStatus,
  price: DecimalString.nullable(),
  stopPrice: DecimalString.nullable(),
  /** Requested base quantity; null for a MARKET order placed by quoteOrderQty. */
  quantity: DecimalString.nullable(),
  quoteOrderQty: DecimalString.nullable(),
  executedQty: DecimalString,
  cumulativeQuoteQty: DecimalString,
  /** cumulativeQuoteQty / executedQty; null while nothing is filled. */
  avgPrice: DecimalString.nullable(),
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
  liquidity: z.enum(['MAKER', 'TAKER']),
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

export const CancelAllResponse = z.object({ canceled: z.array(Order) });
export type CancelAllResponse = z.infer<typeof CancelAllResponse>;
