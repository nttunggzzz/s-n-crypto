import type { Router } from 'express';
import { route, type RouteOptions } from '../../lib/http.ts';
import { AppError } from '../../lib/errors.ts';
import type { ExchangeConfig } from '../exchange/exchangeConfig.ts';
import type { MarketDataService } from './marketData.ts';
import type { CandleService } from './candleService.ts';

export function registerMarketRoutes(router: Router, opts: RouteOptions, market: MarketDataService, config: ExchangeConfig, candles: CandleService): void {
  const known = (symbol: string) => {
    if (!config.findSymbol(symbol)) throw new AppError('NOT_FOUND', `Unknown symbol ${symbol}`);
  };

  route(router, opts, 'exchangeInfo', async () => ({
    tradingHalted: config.tradingHalted,
    feeRate: config.feeRate.toFixed(),
    symbols: config.allSymbols().map((s) => config.toSymbolInfo(s)),
    serverTime: new Date().toISOString(),
  }));

  route(router, opts, 'tickers', async () => ({ items: config.allSymbols().map((s) => market.getTicker(s.row.symbol)) }));

  route(router, opts, 'depth', async ({ params, query }) => {
    known(params.symbol);
    return market.getDepth(params.symbol, query.limit);
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
}
