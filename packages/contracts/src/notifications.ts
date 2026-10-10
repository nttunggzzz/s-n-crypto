import { z } from 'zod';
import { CloseReason, DecimalString, IsoDateTime, OrderSide, OrderType, SymbolCode } from './common.ts';
import { PositionSide } from './futures.ts';

/**
 * In-app notifications for things that happen while the user is away (not for the
 * immediate result of an order they just placed). The UI builds the text from `type` + fields (i18n).
 */
const base = {
  id: z.string(),
  readAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
};

const orderFields = {
  orderId: z.string(),
  symbol: SymbolCode,
  side: OrderSide,
  orderType: OrderType,
};

export const Notification = z.discriminatedUnion('type', [
  /** A resting/triggered order finished filling. */
  z.object({ ...base, type: z.literal('ORDER_FILLED'), ...orderFields, executedQty: DecimalString, avgPrice: DecimalString }),
  /** A triggered stop could only partly fill (or not at all) in the visible book; the rest expired. */
  z.object({ ...base, type: z.literal('ORDER_EXPIRED'), ...orderFields, executedQty: DecimalString, reason: CloseReason }),
  /** A stop / trailing stop reached its trigger price. */
  z.object({ ...base, type: z.literal('STOP_TRIGGERED'), ...orderFields, stopPrice: DecimalString, lastPrice: DecimalString }),
  /** TP/SL orders were placed after the BUY finished. */
  z.object({ ...base, type: z.literal('TPSL_PLACED'), orderId: z.string(), symbol: SymbolCode, quantity: DecimalString, orderListId: z.string().nullable(), childOrderIds: z.array(z.string()) }),
  /** TP/SL could not be placed (e.g. received quantity below the pair minimum). */
  z.object({ ...base, type: z.literal('TPSL_SKIPPED'), orderId: z.string(), symbol: SymbolCode, reason: z.string() }),
  z.object({ ...base, type: z.literal('PRICE_ALERT'), alertId: z.string(), symbol: SymbolCode, condition: z.enum(['ABOVE', 'BELOW']), targetPrice: DecimalString, lastPrice: DecimalString }),
  // futures (phase F)
  /** A resting futures limit order finished filling. */
  z.object({ ...base, type: z.literal('FUTURES_ORDER_FILLED'), orderId: z.string(), symbol: SymbolCode, side: OrderSide, executedQty: DecimalString, avgPrice: DecimalString }),
  /** Position closed by its take-profit or stop-loss (mark price reached it). */
  z.object({ ...base, type: z.literal('POSITION_TPSL'), positionId: z.string(), symbol: SymbolCode, side: PositionSide, reason: z.enum(['TAKE_PROFIT', 'STOP_LOSS']), quantity: DecimalString, price: DecimalString, realizedPnl: DecimalString }),
  /** Position liquidated: margin + PnL fell to the maintenance margin. */
  z.object({ ...base, type: z.literal('POSITION_LIQUIDATED'), positionId: z.string(), symbol: SymbolCode, side: PositionSide, quantity: DecimalString, markPrice: DecimalString, lostMargin: DecimalString }),
  // phase 2.6
  /** First sign-in from this browser/device (an email with the anti-phishing code was sent too). */
  z.object({ ...base, type: z.literal('NEW_DEVICE_LOGIN'), ip: z.string().nullable(), device: z.string().nullable(), at: IsoDateTime }),
  z.object({ ...base, type: z.literal('DCA_EXECUTED'), planId: z.string(), symbol: SymbolCode, quoteSpent: DecimalString, baseBought: DecimalString, price: DecimalString }),
  z.object({ ...base, type: z.literal('DCA_SKIPPED'), planId: z.string(), symbol: SymbolCode, reason: z.string() }),
  z.object({ ...base, type: z.literal('GRID_BOT_STOPPED'), botId: z.string(), symbol: SymbolCode, reason: z.string(), gridProfit: DecimalString }),
]);
export type Notification = z.infer<typeof Notification>;
export type NotificationType = Notification['type'];

export const NotificationListQuery = z.object({
  unreadOnly: z.enum(['true', 'false']).default('false'),
});

export const MarkReadRequest = z
  .object({
    ids: z.array(z.string()).max(200).optional(),
    all: z.literal(true).optional(),
  })
  .refine((r) => (r.ids !== undefined) !== (r.all !== undefined), { message: 'provide ids or all: true' });

export const UnreadCount = z.object({ unread: z.number().int().nonnegative() });
