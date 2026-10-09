import { z } from 'zod';
import { Candle, Depth, ExchangeStatus, MarketStatus, MarketTrade, Ticker } from './market.ts';
import { Balance } from './wallet.ts';
import { Order, OrderList, Trade } from './orders.ts';
import { Notification } from './notifications.ts';
import { PriceAlert } from './alerts.ts';
import { FuturesAccount, FuturesOrder, FuturesPosition, FuturesTicker, FuturesTrade, MarkPrice } from './futures.ts';

/**
 * WebSocket: connect to `/ws` (same origin; the session cookie authenticates the `user` channel).
 *
 * Channels:
 *   ticker:<SYMBOL>            -> Ticker            (every update)
 *   depth:<SYMBOL>             -> Depth             (top 20 levels, ~1/s)
 *   trades:<SYMBOL>            -> MarketTrade       (each public trade)
 *   candles:<SYMBOL>:<interval>-> Candle            (forming + closed candles)
 *   market:status              -> MarketStatus      (on change)
 *   exchange:status            -> ExchangeStatus    (snapshot on subscribe, then on admin change:
 *                                                    trading halted/resumed, pair enabled/disabled)
 *   user                       -> UserEvent         (requires sign-in)
 *
 * Futures (phase F), SYMBOL = futures symbol (e.g. BTCUSDT, 1000PEPEUSDT):
 *   futures:ticker:<SYMBOL>    -> FuturesTicker     (~1/s)
 *   futures:mark:<SYMBOL>      -> MarkPrice         (~1/s; use it for live PnL with @cex/core futures math)
 *   futures:depth:<SYMBOL>     -> Depth             (top 20, ~2/s)
 *   futures:trades:<SYMBOL>    -> MarketTrade
 *   futures:candles:<SYMBOL>:<interval> -> Candle
 *   futures:status             -> MarketStatus      (futures feed; on change)
 */
export const ClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe'), channel: z.string() }),
  z.object({ type: z.literal('unsubscribe'), channel: z.string() }),
  z.object({ type: z.literal('ping') }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export const UserEvent = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('order'), order: Order }),
  z.object({ kind: z.literal('trade'), trade: Trade }),
  z.object({ kind: z.literal('balance'), balance: Balance }),
  /** OCO state changed (a leg filled/triggered/canceled). */
  z.object({ kind: z.literal('orderList'), orderList: OrderList }),
  z.object({ kind: z.literal('notification'), notification: Notification }),
  /** A price alert changed status (e.g. TRIGGERED). */
  z.object({ kind: z.literal('alert'), alert: PriceAlert }),
  // futures (phase F)
  z.object({ kind: z.literal('futuresOrder'), order: FuturesOrder }),
  z.object({ kind: z.literal('futuresTrade'), trade: FuturesTrade }),
  /** Opened, changed (fill, margin, TP/SL, funding) or closed (incl. liquidation). */
  z.object({ kind: z.literal('futuresPosition'), position: FuturesPosition }),
  /** Futures wallet changed (transfer, fill, funding, liquidation). */
  z.object({ kind: z.literal('futuresAccount'), account: FuturesAccount }),
]);
export type UserEvent = z.infer<typeof UserEvent>;

export const ServerMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribed'), channel: z.string() }),
  z.object({ type: z.literal('unsubscribed'), channel: z.string() }),
  z.object({ type: z.literal('pong') }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string(), channel: z.string().optional() }),
  z.object({ type: z.literal('event'), channel: z.string(), data: z.unknown() }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

/** Payload schema for each channel prefix, for validating `event.data`. */
export const ChannelPayload = {
  ticker: Ticker,
  depth: Depth,
  trades: MarketTrade,
  candles: Candle,
  'market:status': MarketStatus,
  'exchange:status': ExchangeStatus,
  user: UserEvent,
  'futures:ticker': FuturesTicker,
  'futures:mark': MarkPrice,
  'futures:depth': Depth,
  'futures:trades': MarketTrade,
  'futures:candles': Candle,
  'futures:status': MarketStatus,
} as const;

export type ChannelData<C extends string> = C extends `futures:ticker:${string}`
  ? FuturesTicker
  : C extends `futures:mark:${string}`
    ? MarkPrice
    : C extends `futures:depth:${string}`
      ? Depth
      : C extends `futures:trades:${string}`
        ? MarketTrade
        : C extends `futures:candles:${string}`
          ? Candle
          : C extends 'futures:status'
            ? MarketStatus
            : SpotChannelData<C>;

type SpotChannelData<C extends string> = C extends `ticker:${string}`
  ? Ticker
  : C extends `depth:${string}`
    ? Depth
    : C extends `trades:${string}`
      ? MarketTrade
      : C extends `candles:${string}`
        ? Candle
        : C extends 'market:status'
          ? MarketStatus
          : C extends 'exchange:status'
            ? ExchangeStatus
            : C extends 'user'
              ? UserEvent
              : unknown;

export function payloadSchemaFor(channel: string): z.ZodTypeAny | null {
  if (channel === 'user') return UserEvent;
  if (channel === 'market:status') return MarketStatus;
  if (channel === 'exchange:status') return ExchangeStatus;
  if (channel === 'futures:status') return MarketStatus;
  if (channel.startsWith('futures:')) {
    switch (channel.split(':')[1]) {
      case 'ticker':
        return FuturesTicker;
      case 'mark':
        return MarkPrice;
      case 'depth':
        return Depth;
      case 'trades':
        return MarketTrade;
      case 'candles':
        return Candle;
      default:
        return null;
    }
  }
  const prefix = channel.split(':')[0];
  switch (prefix) {
    case 'ticker':
      return Ticker;
    case 'depth':
      return Depth;
    case 'trades':
      return MarketTrade;
    case 'candles':
      return Candle;
    default:
      return null;
  }
}
