import { z } from 'zod';
import { Candle, Depth, MarketStatus, MarketTrade, Ticker } from './market.ts';
import { Balance } from './wallet.ts';
import { Order, Trade } from './orders.ts';

/**
 * WebSocket: connect to `/ws` (same origin; the session cookie authenticates the `user` channel).
 *
 * Channels:
 *   ticker:<SYMBOL>            -> Ticker            (every update)
 *   depth:<SYMBOL>             -> Depth             (top 20 levels, ~1/s)
 *   trades:<SYMBOL>            -> MarketTrade       (each public trade)
 *   candles:<SYMBOL>:<interval>-> Candle            (forming + closed candles)
 *   market:status              -> MarketStatus      (on change)
 *   user                       -> UserEvent         (requires sign-in)
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
  user: UserEvent,
} as const;

export type ChannelData<C extends string> = C extends `ticker:${string}`
  ? Ticker
  : C extends `depth:${string}`
    ? Depth
    : C extends `trades:${string}`
      ? MarketTrade
      : C extends `candles:${string}`
        ? Candle
        : C extends 'market:status'
          ? MarketStatus
          : C extends 'user'
            ? UserEvent
            : unknown;

export function payloadSchemaFor(channel: string): z.ZodTypeAny | null {
  if (channel === 'user') return UserEvent;
  if (channel === 'market:status') return MarketStatus;
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
