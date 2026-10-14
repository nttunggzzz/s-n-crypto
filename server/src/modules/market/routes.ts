import type { Router } from 'express';
import { route, type RouteOptions } from '../../lib/http.ts';
import { AppError } from '../../lib/errors.ts';
import type { ExchangeConfig } from '../exchange/exchangeConfig.ts';
import type { MarketDataService } from './marketData.ts';
import type { CandleService } from './candleService.ts';
import { mergeDeepDepth, type DepthSnapshots } from './depthSnapshots.ts';
import type { SparklineService } from './sparklines.ts';

/** Levels served from the live stream; deeper requests add a REST snapshot tail. */
const LIVE_LEVELS = 20;

export interface MarketRouteDeps {
  market: MarketDataService;
  config: ExchangeConfig;
  candles: CandleService;
  depthSnapshots: DepthSnapshots;
  sparklines: SparklineService;
}

export function registerMarketRoutes(router: Router, opts: RouteOptions, deps: MarketRouteDeps): void {
  const { market, config, candles } = deps;
  const known = (symbol: string) => {
    if (!config.findSymbol(symbol)) throw new AppError('NOT_FOUND', `Unknown symbol ${symbol}`);
  };

  route(router, opts, 'exchangeInfo', async () => {
    const tax = config.taxSettings();
    return {
      tradingHalted: config.tradingHalted,
      feeRate: config.feeRate.toFixed(),
      taxMode: tax.taxMode,
      taxRate: tax.taxRate,
      taxVndRate: tax.taxVndRate,
      taxVndRateUpdatedAt: tax.taxVndRateUpdatedAt,
      symbols: config.allSymbols().map((s) => config.toSymbolInfo(s)),
      assets: config.assetInfos(),
      serverTime: new Date().toISOString(),
    };
  });

  route(router, opts, 'tickers', async () => ({ items: config.allSymbols().map((s) => market.getTicker(s.row.symbol)) }));

  route(router, opts, 'depth', async ({ params, query }) => {
    known(params.symbol);
    const live = market.getDepth(params.symbol, Math.min(query.limit, LIVE_LEVELS));
    if (query.limit <= LIVE_LEVELS) return live;
    return mergeDeepDepth(live, await deps.depthSnapshots.get(params.symbol, query.limit), query.limit);
  });

  route(router, opts, 'marketTrades', async ({ params, query }) => {
    known(params.symbol);
    return { symbol: params.symbol, items: market.getTrades(params.symbol, query.limit), status: market.getStatus(params.symbol) };
  });

  route(router, opts, 'candles', async ({ params, query }) => {
    known(params.symbol);
    return { symbol: params.symbol, interval: query.interval, items: await candles.get(params.symbol, query.interval, query.limit, query.endTime) };
  });

  route(router, opts, 'marketStatus', async () => market.getMarketStatus());

  route(router, opts, 'sparklines', async ({ query }) => deps.sparklines.get(query.range));
}
