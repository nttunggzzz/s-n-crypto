import http from 'node:http';
import { loadConfig } from './config.ts';
import { logger } from './logger.ts';
import { createDatabase, runMigrations } from './db/client.ts';
import { seedAssets } from './modules/market/assets.ts';
import { createApp, allowedOrigins } from './app.ts';
import { AuthService } from './modules/auth/authService.ts';
import { createEmailSender } from './modules/auth/email.ts';
import { MarketDataService } from './modules/market/marketData.ts';
import { BinanceStream, syncSymbolsFromBinance } from './modules/market/binance.ts';
import { CandleService } from './modules/market/candleService.ts';
import { ExchangeConfig } from './modules/exchange/exchangeConfig.ts';
import { createExchange } from './modules/exchange/index.ts';
import { reconcile } from './modules/exchange/reconciliation.ts';
import { RealtimeHub } from './realtime/hub.ts';

const config = loadConfig();
const database = createDatabase(config.DATABASE_URL);
await runMigrations(database.db);
await seedAssets(database.db);

const feedOn = config.MARKET_FEED === 'binance';
if (feedOn) {
  try {
    const n = await syncSymbolsFromBinance(database.db, config.BINANCE_REST_URL, config.symbols);
    logger.info({ n }, 'symbols synced from Binance exchangeInfo');
  } catch (err) {
    logger.error({ err }, 'could not sync symbols from Binance; using stored rules');
  }
}

const exchangeConfig = new ExchangeConfig(database.db);
await exchangeConfig.reload();
const market = new MarketDataService(
  exchangeConfig.allSymbols().map((s) => s.row.symbol),
  () => exchangeConfig.settings.staleThresholdMs,
);
market.startStalenessTimer();
const exchange = await createExchange(database.db, market, exchangeConfig);
logger.info({ open: exchange.index.size() }, 'open limit orders loaded');

const auth = new AuthService(database.db, config, createEmailSender(config));
const candles = new CandleService(database.db, feedOn ? config.BINANCE_REST_URL : null);
const app = createApp({ config, db: database.db, auth, market, exchange, candles, version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) });
const server = http.createServer(app);
const hub = new RealtimeHub(market, exchange, auth, allowedOrigins(config));
hub.attach(server);

const stream = feedOn ? new BinanceStream(config.BINANCE_WS_URL, market, database.db, market.symbols) : null;
stream?.start();

// Ledger reconciliation every 10 minutes (alerts are wired in P01).
const reconTimer = setInterval(() => void reconcile(database.db).catch((err) => logger.error({ err }, 'reconciliation crashed')), 10 * 60_000);
reconTimer.unref();
// Hourly account-value snapshots for the portfolio chart.
exchange.portfolio.startHourly();

server.listen(config.PORT, () => logger.info({ port: config.PORT, feed: config.MARKET_FEED }, 'server listening'));

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  stream?.stop();
  exchange.matcher.stop();
  exchange.portfolio.stop();
  hub.close();
  server.close();
  await database.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
