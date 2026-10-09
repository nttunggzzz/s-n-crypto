import type { Db } from '../../db/client.ts';
import type { ExchangeConfig } from '../exchange/exchangeConfig.ts';
import type { ExchangeEvents } from '../exchange/events.ts';
import { CandleService } from '../market/candleService.ts';
import { MarketDataService } from '../market/marketData.ts';
import { FuturesConfig } from './config.ts';
import { FuturesEngine } from './engine.ts';
import { FuturesMarkService } from './markData.ts';
import { FuturesEvents } from './serializers.ts';
import { FuturesService } from './service.ts';

export interface Futures {
  config: FuturesConfig;
  market: MarketDataService;
  marks: FuturesMarkService;
  candles: CandleService;
  events: FuturesEvents;
  service: FuturesService;
  engine: FuturesEngine;
}

export interface FuturesOptions {
  /** Binance USDⓈ-M REST base (null = no REST: tests / feed off). */
  restUrl: string | null;
  /** Clock for market-data freshness (tests move it). */
  clock?: () => number;
  now?: () => Date;
}

/** Wires the futures module. Call `futures.engine.start()` once market data flows. */
export async function createFutures(db: Db, exchange: ExchangeConfig, exchangeEvents: ExchangeEvents, opts: FuturesOptions): Promise<Futures> {
  const config = new FuturesConfig(db, exchange);
  await config.reload();
  const stale = () => exchange.settings.staleThresholdMs;
  const market = new MarketDataService(
    config.all().map((c) => c.row.symbol),
    stale,
    opts.clock,
  );
  const marks = new FuturesMarkService(stale, opts.clock);
  const candles = new CandleService(db, opts.restUrl, { path: '/fapi/v1/klines', storedFallback: false });
  const events = new FuturesEvents();
  const service = new FuturesService(db, config, market, marks, events, exchangeEvents, opts.now);
  const engine = new FuturesEngine(service, marks);
  return { config, market, marks, candles, events, service, engine };
}
