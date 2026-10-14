import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.ts';
import { createHttpServer } from './lib/httpServer.ts';
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
import { checkTaxQuoteInvariant } from './modules/tax/taxService.ts';
import { createExchange } from './modules/exchange/index.ts';
import { reconcile } from './modules/exchange/reconciliation.ts';
import { RealtimeHub } from './realtime/hub.ts';
import { createFutures } from './modules/futures/index.ts';
import { syncFuturesFromBinance } from './modules/futures/config.ts';
import { createBots } from './modules/bots/index.ts';
import { seedSimRules, SimFeed, simSpecs } from './modules/market/sim/feed.ts';
import { acquireInstanceLock, startStandbyServer } from './ops/singleInstance.ts';
import { createAlerter, FeedWatcher } from './ops/alerts.ts';
import { startMemoryLog } from './ops/memoryLog.ts';

const config = loadConfig();
const version = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev';
const alerter = createAlerter(config);
// a crash restarts the container (Railway restart policy); the operator hears about it
const crash = (what: string) => (err: unknown) => {
  logger.fatal({ err }, what);
  void alerter.send('crash', 'critical', `Server dừng vì lỗi (${what}): ${err instanceof Error ? err.message : String(err)} — đang khởi động lại.`, true).finally(() => process.exit(1));
};
process.on('uncaughtException', crash('uncaughtException'));
process.on('unhandledRejection', crash('unhandledRejection'));

// Invariant 5 — one instance: during a deploy the old container is still running. Answer health checks
// as "standby" until it has stopped (it holds the lock), then start everything (migrations included).
const standby = await startStandbyServer(config.PORT, version);
const instanceLock = await acquireInstanceLock(config.DATABASE_URL, {
  onWait: () => logger.warn('another instance is running (deploy in progress?) — waiting for it to stop'),
  onLost: (err) => {
    logger.fatal({ err }, 'lost the instance lock — exiting so that two instances never run together');
    void alerter.send('lock', 'critical', 'Mất khóa một-bản-duy-nhất (kết nối DB đứt) — server tự thoát để khởi động lại.', true).finally(() => process.exit(1));
  },
});
await standby.close();

const database = createDatabase(config.DATABASE_URL);
await runMigrations(database.db);
await seedAssets(database.db);

const feedOn = config.MARKET_FEED === 'binance';
const sim = config.MARKET_FEED === 'sim';
if (sim) {
  const n = await seedSimRules(database.db, config.symbols);
  logger.warn(n, 'MARKET_FEED=sim: SYNTHETIC prices on real pair rules (dev / e2e only)');
}
if (feedOn) {
  try {
    const n = await syncSymbolsFromBinance(database.db, config.BINANCE_REST_URL, config.symbols);
    logger.info({ n }, 'symbols synced from Binance exchangeInfo');
  } catch (err) {
    logger.error({ err }, 'could not sync symbols from Binance; using stored rules');
  }
}

const exchangeConfig = new ExchangeConfig(database.db, { alerter });
await exchangeConfig.reload();
await checkTaxQuoteInvariant(exchangeConfig, alerter);
const market = new MarketDataService(
  exchangeConfig.allSymbols().map((s) => s.row.symbol),
  () => exchangeConfig.settings.staleThresholdMs,
);
market.startStalenessTimer();
const exchange = await createExchange(database.db, market, exchangeConfig);
const spotSim = sim ? new SimFeed(market, simSpecs('spot', exchangeConfig.allSymbols().map((s) => ({ symbol: s.row.symbol, tick: s.tick.toFixed(), step: s.step.toFixed() })))) : null;

// ── futures (simulated USDT-M perpetuals): one contract per listed spot coin
if (feedOn) {
  try {
    const n = await syncFuturesFromBinance(database.db, config.BINANCE_FUTURES_REST_URL, exchangeConfig.allSymbols().map((s) => s.row.baseAsset));
    logger.info({ n }, 'futures contracts synced from Binance');
  } catch (err) {
    logger.error({ err }, 'could not sync futures contracts from Binance; using stored rules');
  }
}
let futuresSim: SimFeed | null = null;
const futures = await createFutures(database.db, exchangeConfig, exchange.events, {
  restUrl: feedOn ? config.BINANCE_FUTURES_REST_URL : null,
  candleHistory: sim ? (symbol, interval, limit, endTime) => futuresSim?.history(symbol, interval, limit, endTime) ?? [] : undefined,
});
futuresSim = sim
  ? new SimFeed(futures.market, simSpecs('futures', futures.config.all().map((c) => ({ symbol: c.row.symbol, tick: c.tick.toFixed(), step: c.step.toFixed() }))), { onMark: (s, m) => futures.marks.ingest(s, m) })
  : null;
futures.market.startStalenessTimer();
const bots = createBots(database.db, exchange, market);
logger.info({ open: exchange.index.size() }, 'open limit orders loaded');

const auth = new AuthService(database.db, config, createEmailSender(config));
const candles = new CandleService(database.db, feedOn ? config.BINANCE_REST_URL : null, { history: spotSim ? (s, i, l, e) => spotSim.history(s, i, l, e) : undefined });
/** A web app build to serve, or undefined (with a warning) when the variable points at nothing built. */
const builtApp = (name: string, dir: string) => {
  if (dir && existsSync(path.join(dir, 'index.html'))) return dir;
  if (dir) logger.warn({ [name]: dir }, `${name} has no index.html — not serving that app`);
  return undefined;
};
const webDist = builtApp('WEB_DIST', config.WEB_DIST);
const adminWebDist = builtApp('ADMIN_WEB_DIST', config.ADMIN_WEB_DIST);
const app = createApp({ config, db: database.db, auth, market, exchange, candles, futures, bots, version, webDist, adminWebDist });
const server = createHttpServer(app);
const hub = new RealtimeHub(market, exchange, auth, allowedOrigins(config), futures, bots);
hub.attach(server);

const stream = feedOn ? new BinanceStream(config.BINANCE_WS_URL, market, market.symbols, { db: database.db }) : null;
stream?.start();
const futuresStream = feedOn
  ? new BinanceStream(config.BINANCE_FUTURES_WS_URL, futures.market, futures.config.all().map((c) => c.row.symbol), { kind: 'futures', onMark: (s, m) => futures.marks.ingest(s, m) })
  : null;
futuresStream?.start();
spotSim?.start();
futuresSim?.start();
await futures.engine.start();
bots.start();

// Ledger reconciliation every 10 minutes; a mismatch means money is wrong somewhere → alert.
const reconTimer = setInterval(
  () =>
    void reconcile(database.db)
      .then((r) => {
        if (!r.ok) {
          const first = r.mismatches.slice(0, 3).map((m) => `${m.kind} ${m.account} ${m.asset} user ${m.userId}: ${m.field} ${m.actual} ≠ ${m.expected}`);
          return alerter.send('recon', 'critical', `Đối soát sổ cái LỆCH: ${r.mismatches.length} chỗ.\n${first.join('\n')}`);
        }
      })
      .catch((err) => {
        logger.error({ err }, 'reconciliation crashed');
        return alerter.send('recon-crash', 'warn', `Đối soát sổ cái không chạy được: ${err instanceof Error ? err.message : String(err)}`);
      }),
  10 * 60_000,
);
reconTimer.unref();
// Market feeds: alert after 2 minutes of no live prices (orders and liquidations wait for live prices).
const feedWatchers = [new FeedWatcher('Giá Spot', () => market.getMarketStatus(), alerter), new FeedWatcher('Giá Futures', () => futures.market.getMarketStatus(), alerter)];
const feedTimer = setInterval(() => void Promise.all(feedWatchers.map((w) => w.check())), 30_000);
feedTimer.unref();
// Hourly account-value snapshots for the portfolio chart.
exchange.portfolio.startHourly();
// Process memory in the log every 10 minutes (a leak shows up before it kills the process).
const stopMemoryLog = startMemoryLog();

server.listen(config.PORT, () => {
  logger.info({ port: config.PORT, feed: config.MARKET_FEED }, 'server listening');
  void alerter.send('start', 'info', `Server đã chạy — phiên bản ${version}, giá ${config.MARKET_FEED}, đăng ký ${config.REGISTRATION}.\nĐịa chỉ: ${config.APP_URL}`, true);
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  stream?.stop();
  futuresStream?.stop();
  spotSim?.stop();
  futuresSim?.stop();
  futures.engine.stop();
  bots.stop();
  exchange.matcher.stop();
  exchange.portfolio.stop();
  exchangeConfig.stop();
  stopMemoryLog();
  hub.close();
  server.close();
  await database.close();
  await instanceLock.release();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
// a supervisor that cannot send signals (Windows: npm run host) asks for a clean stop by closing stdin
if (process.env.SHUTDOWN_ON_STDIN_END === '1') {
  process.stdin.on('end', () => void shutdown('stdin closed'));
  process.stdin.resume();
}
