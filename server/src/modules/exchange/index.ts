import type { Db } from '../../db/client.ts';
import type { MarketDataService } from '../market/marketData.ts';
import { ExchangeConfig } from './exchangeConfig.ts';
import { ExchangeEvents } from './events.ts';
import { FaucetService } from './faucetService.ts';
import { Matcher } from './matcher.ts';
import { OpenOrderIndex } from './openOrderIndex.ts';
import { OrderService } from './orderService.ts';

export interface Exchange {
  config: ExchangeConfig;
  events: ExchangeEvents;
  index: OpenOrderIndex;
  orders: OrderService;
  faucet: FaucetService;
  matcher: Matcher;
}

export async function createExchange(db: Db, market: MarketDataService, config: ExchangeConfig, now?: () => Date): Promise<Exchange> {
  const events = new ExchangeEvents();
  const index = new OpenOrderIndex();
  const orders = new OrderService(db, config, market, events, index, now);
  const faucet = new FaucetService(db, config, events, now);
  const matcher = new Matcher(orders, index, market, config);
  await orders.loadOpenOrders();
  matcher.attach();
  return { config, events, index, orders, faucet, matcher };
}
