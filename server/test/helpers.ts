import { sql } from 'drizzle-orm';
import { createDatabase, type Database } from '../src/db/client.ts';
import { futuresSymbols, symbols, users } from '../src/db/schema.ts';
import { createFutures, type Futures } from '../src/modules/futures/index.ts';
import { createBots, type Bots } from '../src/modules/bots/index.ts';
import { seedAssets } from '../src/modules/market/assets.ts';
import { MarketDataService } from '../src/modules/market/marketData.ts';
import { ExchangeConfig } from '../src/modules/exchange/exchangeConfig.ts';
import { createExchange, type Exchange } from '../src/modules/exchange/index.ts';
import { getBalances } from '../src/modules/exchange/ledger.ts';
import { TEST_DB_URL } from './constants.ts';

/** Test clock: tests move time explicitly. */
export class Clock {
  constructor(public ms = Date.UTC(2026, 9, 9, 0, 0, 0)) {}
  now = () => this.ms;
  date = () => new Date(this.ms);
  advance(ms: number) {
    this.ms += ms;
  }
}

/** Binance-like rules for the test pairs (same filters as the real BTCUSDT / ETHUSDT). */
export const TEST_SYMBOLS = [
  { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', tickSize: '0.01', stepSize: '0.00001', minQty: '0.00001', maxQty: '9000', minNotional: '5', sourceStatus: 'TRADING', sortOrder: 1 },
  { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', tickSize: '0.01', stepSize: '0.0001', minQty: '0.0001', maxQty: '9000', minNotional: '5', sourceStatus: 'TRADING', sortOrder: 2 },
];

/** Same filters as the real BTCUSDT / ETHUSDT USDⓈ-M perpetuals (min notional lowered for tests). */
export const TEST_FUTURES = [
  { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', underlyingAsset: 'BTC', tickSize: '0.1', stepSize: '0.001', minQty: '0.001', maxQty: '1000', minNotional: '5', sourceStatus: 'TRADING', maxLeverage: 20, maintenanceMarginRate: '0.004', sortOrder: 1 },
  { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', underlyingAsset: 'ETH', tickSize: '0.01', stepSize: '0.001', minQty: '0.001', maxQty: '10000', minNotional: '5', sourceStatus: 'TRADING', maxLeverage: 20, maintenanceMarginRate: '0.004', sortOrder: 2 },
];

export interface TestEnv {
  database: Database;
  clock: Clock;
  market: MarketDataService;
  ex: Exchange;
  futures: Futures;
  bots: Bots;
  close(): Promise<void>;
}

export async function resetDb(database: Database): Promise<void> {
  await database.db.execute(sql`
    TRUNCATE grid_bot_cells, grid_bots, dca_runs, dca_plans, login_events,
             futures_funding_payments, futures_funding_events, futures_trades, futures_orders, futures_positions, futures_user_symbols, futures_symbols,
             trades, orders, order_lists, ledger_entries, balances, positions, portfolio_snapshots, price_alerts,
             notifications, user_preferences, faucet_claims, sessions, verification_tokens,
             audit_logs, reconciliation_runs, candles, symbols, assets, announcements, users RESTART IDENTITY CASCADE`);
  await database.db.execute(sql`
    UPDATE exchange_settings SET trading_halted = false, fee_rate = '0.001', faucet_asset = 'USDT',
      faucet_amount = '10000', faucet_cooldown_hours = 24, faucet_lifetime_cap = '100000', stale_threshold_ms = 10000`);
  await database.db.insert(symbols).values(TEST_SYMBOLS);
  await database.db.insert(futuresSymbols).values(TEST_FUTURES);
  await seedAssets(database.db);
}

export async function createTestEnv(poolSize = 10): Promise<TestEnv> {
  const database = createDatabase(TEST_DB_URL, poolSize);
  await resetDb(database);
  const clock = new Clock();
  const config = new ExchangeConfig(database.db);
  await config.reload();
  const market = new MarketDataService(
    TEST_SYMBOLS.map((s) => s.symbol),
    () => config.settings.staleThresholdMs,
    clock.now,
  );
  const ex = await createExchange(database.db, market, config, clock.date);
  const futures = await createFutures(database.db, config, ex.events, { restUrl: null, clock: clock.now, now: clock.date });
  await futures.engine.start();
  // bots react to their order events; tests drive DCA runs and grid sweeps explicitly (no timers)
  const bots = createBots(database.db, ex, market, clock.date);
  bots.grid.attach();
  return {
    database,
    clock,
    market,
    ex,
    futures,
    bots,
    close: async () => {
      ex.matcher.stop();
      futures.engine.stop();
      await database.close();
    },
  };
}

let userSeq = 0;
export async function createUser(env: TestEnv, opts: { verified?: boolean } = {}): Promise<string> {
  userSeq++;
  const [u] = await env.database.db
    .insert(users)
    .values({ email: `user${userSeq}-${Date.now()}@test.local`, name: `User ${userSeq}`, passwordHash: null, emailVerifiedAt: opts.verified === false ? null : new Date() })
    .returning();
  return u!.id;
}

/** Feeds an order book snapshot as if it came from Binance (test only). */
export function setBook(env: TestEnv, symbol: string, bids: [string, string][], asks: [string, string][]): void {
  env.market.ingestDepth(symbol, bids, asks, env.clock.now());
}

let tradeSeq = 0;
export function marketTrade(env: TestEnv, symbol: string, price: string): void {
  env.market.ingestTrade(symbol, { id: ++tradeSeq, price, qty: '0.01', time: env.clock.now(), isBuyerMaker: false });
}

export async function balanceOf(env: TestEnv, userId: string, asset: string): Promise<{ available: string; locked: string }> {
  const [b] = await getBalances(env.database.db, userId, [asset]);
  return { available: b ? strip(b.available) : '0', locked: b ? strip(b.locked) : '0' };
}

/** "9899.500000000000000000" -> "9899.5" */
export function strip(s: string): string {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

// ───────────────────────────── futures helpers

/** Feeds a futures order book snapshot (test only). */
export function setFuturesBook(env: TestEnv, symbol: string, bids: [string, string][], asks: [string, string][]): void {
  env.futures.market.ingestDepth(symbol, bids, asks, env.clock.now());
}

/** Feeds the mark price (and funding) as if from Binance markPrice@1s. */
export function setMark(env: TestEnv, symbol: string, markPrice: string, opts: { rate?: string; nextFundingTime?: number } = {}): void {
  env.futures.marks.ingest(symbol, { markPrice, indexPrice: markPrice, fundingRate: opts.rate ?? '0.0001', nextFundingTime: opts.nextFundingTime ?? env.clock.now() + 3_600_000, eventTime: env.clock.now() }, env.clock.now());
}

let fTradeSeq = 0;
/** A public futures trade at `price` (drives resting limit fills). */
export function futuresTrade(env: TestEnv, symbol: string, price: string): void {
  env.futures.market.ingestTrade(symbol, { id: ++fTradeSeq, price, qty: '0.001', time: env.clock.now(), isBuyerMaker: false });
}

export async function futuresBalance(env: TestEnv, userId: string): Promise<{ available: string; locked: string }> {
  const [b] = await getBalances(env.database.db, userId, ['USDT'], 'FUTURES');
  return { available: b ? b.available : '0', locked: b ? b.locked : '0' };
}
