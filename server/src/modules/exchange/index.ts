import type { Db } from '../../db/client.ts';
import type { MarketDataService } from '../market/marketData.ts';
import { AlertService } from './alertService.ts';
import { ExchangeConfig } from './exchangeConfig.ts';
import { ExchangeEvents } from './events.ts';
import { FaucetService } from './faucetService.ts';
import { Matcher } from './matcher.ts';
import { NotificationService } from './notificationService.ts';
import { OpenOrderIndex } from './openOrderIndex.ts';
import { OrderService } from './orderService.ts';
import { PortfolioService } from './portfolioService.ts';
import { PreferencesService } from './preferencesService.ts';
import { PnlService } from './pnlService.ts';

export interface Exchange {
  config: ExchangeConfig;
  events: ExchangeEvents;
  index: OpenOrderIndex;
  orders: OrderService;
  faucet: FaucetService;
  matcher: Matcher;
  alerts: AlertService;
  notifications: NotificationService;
  portfolio: PortfolioService;
  preferences: PreferencesService;
  pnl: PnlService;
}

export async function createExchange(db: Db, market: MarketDataService, config: ExchangeConfig, now?: () => Date): Promise<Exchange> {
  const events = new ExchangeEvents();
  const index = new OpenOrderIndex();
  const notifications = new NotificationService(db);
  const orders = new OrderService(db, config, market, events, index, notifications, now);
  const faucet = new FaucetService(db, config, events, now);
  const alerts = new AlertService(db, config, market, notifications, events, index);
  const matcher = new Matcher(orders, index, market, config, alerts);
  const portfolio = new PortfolioService(db, market, now);
  const preferences = new PreferencesService(db, config);
  const pnl = new PnlService(db, now);
  await orders.loadOpenOrders();
  await alerts.load();
  matcher.attach();
  return { config, events, index, orders, faucet, matcher, alerts, notifications, portfolio, preferences, pnl };
}
