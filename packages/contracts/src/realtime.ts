import { z } from 'zod';
import { Candle, Depth, ExchangeStatus, MarketStatus, MarketTrade, Ticker } from './market.ts';
import { Balance } from './wallet.ts';
import { Order, OrderList, Trade } from './orders.ts';
import { Notification } from './notifications.ts';
import { PriceAlert } from './alerts.ts';
import { FuturesAccount, FuturesOrder, FuturesPosition, FuturesTicker, FuturesTrade, MarkPrice } from './futures.ts';
import { DcaPlan, GridBot } from './bots.ts';

/**
 * WebSocket: connect to `/ws` (same origin; the session cookie authenticates the `user` channel).
 *
 * At most REALTIME_MAX_CHANNELS channels per connection; more → `error` RATE_LIMITED (the channel is not subscribed).
 *
 * Channels:
 *   tickers                    -> TickerBatch       (ALL pairs: snapshot of every pair on subscribe, then ≤ 1/s with the
 *                                                    pairs that changed — use this for lists/headers, not 50 ticker:<SYMBOL>)
 *   ticker:<SYMBOL>            -> Ticker            (≤ 1/s)
 *   depth:<SYMBOL>             -> Depth             (top 20 levels, ~1/s)
 *   trades:<SYMBOL>            -> MarketTrade       (each public trade)
 *   candles:<SYMBOL>:<interval>-> Candle            (forming + closed candles)
 *   market:status              -> MarketStatus      (on change)
 *   exchange:status            -> ExchangeStatus    (snapshot on subscribe, then on admin change:
 *                                                    trading halted/resumed, pair enabled/disabled)
 *   user                       -> UserEvent         (requires sign-in)
 *
 * Futures (phase F), SYMBOL = futures symbol (e.g. BTCUSDT, 1000PEPEUSDT):
 *   futures:tickers            -> FuturesTickerBatch (all contracts, like `tickers`; also sent when mark/funding moves)
 *   futures:ticker:<SYMBOL>    -> FuturesTicker     (~1/s)
 *   futures:mark:<SYMBOL>      -> MarkPrice         (~1/s; use it for live PnL with @cex/core futures math)
 *   futures:depth:<SYMBOL>     -> Depth             (top 20, ~2/s)
 *   futures:trades:<SYMBOL>    -> MarketTrade
 *   futures:candles:<SYMBOL>:<interval> -> Candle
 *   futures:status             -> MarketStatus      (futures feed; on change)
 */
/** Subscriptions allowed per WebSocket connection (server and mock enforce it). */
export const REALTIME_MAX_CHANNELS = 100;

/** `tickers`: every pair on subscribe, then only the pairs that changed since the last batch. */
export const TickerBatch = z.object({ items: z.array(Ticker) });
export type TickerBatch = z.infer<typeof TickerBatch>;
export const FuturesTickerBatch = z.object({ items: z.array(FuturesTicker) });
export type FuturesTickerBatch = z.infer<typeof FuturesTickerBatch>;

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
  // bots (phase 2.6)
  /** A grid bot changed (fill, round completed, stopped). */
  z.object({ kind: z.literal('gridBot'), bot: GridBot }),
  /** A recurring-buy plan ran / was paused / changed. */
  z.object({ kind: z.literal('dcaPlan'), plan: DcaPlan }),
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
  tickers: TickerBatch,
  ticker: Ticker,
  depth: Depth,
  trades: MarketTrade,
  candles: Candle,
  'market:status': MarketStatus,
  'exchange:status': ExchangeStatus,
  user: UserEvent,
  'futures:tickers': FuturesTickerBatch,
  'futures:ticker': FuturesTicker,
  'futures:mark': MarkPrice,
  'futures:depth': Depth,
  'futures:trades': MarketTrade,
  'futures:candles': Candle,
  'futures:status': MarketStatus,
} as const;

export type ChannelData<C extends string> = C extends 'futures:tickers'
  ? FuturesTickerBatch
  : C extends `futures:ticker:${string}`
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

type SpotChannelData<C extends string> = C extends 'tickers'
  ? TickerBatch
  : C extends `ticker:${string}`
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
  if (channel === 'futures:tickers') return FuturesTickerBatch;
  if (channel === 'tickers') return TickerBatch;
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
