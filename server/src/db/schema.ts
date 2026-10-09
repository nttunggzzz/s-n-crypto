import { sql } from 'drizzle-orm';
import {
  bigserial,
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** All amounts: exact NUMERIC, read/written as decimal strings. */
const amount = (name: string) => numeric(name, { precision: 38, scale: 18 });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

// ───────────────────────────── accounts (P03)

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stored lower-cased. */
    email: text('email').notNull(),
    name: text('name').notNull(),
    /** null = cannot sign in (signal bot account). */
    passwordHash: text('password_hash'),
    emailVerifiedAt: ts('email_verified_at'),
    role: text('role', { enum: ['user', 'support', 'admin', 'owner'] }).notNull().default('user'),
    status: text('status', { enum: ['active', 'locked'] }).notNull().default('active'),
    isBot: boolean('is_bot').notNull().default(false),
    signalsAccess: boolean('signals_access').notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** sha256 of the opaque token; the token itself is never stored. */
    tokenHash: text('token_hash').notNull(),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: ts('created_at').notNull().defaultNow(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [uniqueIndex('sessions_token_uq').on(t.tokenHash), index('sessions_user_idx').on(t.userId)],
);

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose', { enum: ['EMAIL_VERIFY', 'PASSWORD_RESET'] }).notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: ts('expires_at').notNull(),
    usedAt: ts('used_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('verification_tokens_hash_uq').on(t.tokenHash)],
);

/** Append-only (enforced by trigger). Phase 3 writes admin actions here. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorId: uuid('actor_id').references(() => users.id),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    reason: text('reason'),
    ip: text('ip'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('audit_logs_actor_idx').on(t.actorId, t.createdAt)],
);

// ───────────────────────────── exchange config (P05)

export const symbols = pgTable('symbols', {
  symbol: text('symbol').primaryKey(),
  baseAsset: text('base_asset').notNull(),
  quoteAsset: text('quote_asset').notNull(),
  tickSize: amount('tick_size').notNull(),
  stepSize: amount('step_size').notNull(),
  minQty: amount('min_qty').notNull(),
  maxQty: amount('max_qty').notNull(),
  minNotional: amount('min_notional').notNull(),
  /** Admin switch. */
  enabled: boolean('enabled').notNull().default(true),
  /** Status reported by Binance, e.g. TRADING / BREAK. */
  sourceStatus: text('source_status').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/** Single row (id = 1). */
export const exchangeSettings = pgTable(
  'exchange_settings',
  {
    id: integer('id').primaryKey().default(1),
    tradingHalted: boolean('trading_halted').notNull().default(false),
    feeRate: amount('fee_rate').notNull().default('0.001'),
    faucetAsset: text('faucet_asset').notNull().default('USDT'),
    faucetAmount: amount('faucet_amount').notNull().default('10000'),
    faucetCooldownHours: integer('faucet_cooldown_hours').notNull().default(24),
    faucetLifetimeCap: amount('faucet_lifetime_cap').notNull().default('100000'),
    staleThresholdMs: integer('stale_threshold_ms').notNull().default(10_000),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [check('exchange_settings_singleton', sql`${t.id} = 1`)],
);

// ───────────────────────────── ledger (P05)

export const balances = pgTable(
  'balances',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    asset: text('asset').notNull(),
    available: amount('available').notNull().default('0'),
    locked: amount('locked').notNull().default('0'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.asset] }),
    // Last line of defence: a balance can never go negative.
    check('balances_available_nonneg', sql`${t.available} >= 0`),
    check('balances_locked_nonneg', sql`${t.locked} >= 0`),
  ],
);

export const LEDGER_TYPES = ['FAUCET', 'ORDER_LOCK', 'ORDER_UNLOCK', 'TRADE_DEBIT', 'TRADE_CREDIT', 'FEE', 'ADMIN_ADJUST', 'ACCOUNT_RESET'] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];
export const REF_TYPES = ['ORDER', 'TRADE', 'FAUCET', 'ADMIN'] as const;
export type RefType = (typeof REF_TYPES)[number];

/** Append-only (enforced by trigger). sum(deltas) per (user, asset) must equal the balance row. */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    asset: text('asset').notNull(),
    type: text('type', { enum: LEDGER_TYPES }).notNull(),
    deltaAvailable: amount('delta_available').notNull(),
    deltaLocked: amount('delta_locked').notNull(),
    availableAfter: amount('available_after').notNull(),
    lockedAfter: amount('locked_after').notNull(),
    refType: text('ref_type', { enum: REF_TYPES }),
    refId: text('ref_id'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('ledger_user_idx').on(t.userId, t.id), index('ledger_user_asset_idx').on(t.userId, t.asset, t.id)],
);

export const faucetClaims = pgTable(
  'faucet_claims',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    asset: text('asset').notNull(),
    amount: amount('amount').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('faucet_claims_user_idx').on(t.userId, t.createdAt)],
);

// ───────────────────────────── orders & trades (P05)

export const ORDER_STATUSES = ['NEW', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'REJECTED', 'EXPIRED'] as const;
export const OPEN_STATUSES = ['NEW', 'PARTIALLY_FILLED'] as const;

export const orders = pgTable(
  'orders',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientOrderId: text('client_order_id').notNull(),
    symbol: text('symbol')
      .notNull()
      .references(() => symbols.symbol),
    side: text('side', { enum: ['BUY', 'SELL'] }).notNull(),
    type: text('type', { enum: ['MARKET', 'LIMIT', 'STOP_MARKET', 'STOP_LIMIT'] }).notNull(),
    timeInForce: text('time_in_force', { enum: ['GTC', 'IOC'] }),
    status: text('status', { enum: ORDER_STATUSES }).notNull(),
    price: amount('price'),
    stopPrice: amount('stop_price'),
    quantity: amount('quantity'),
    quoteOrderQty: amount('quote_order_qty'),
    executedQty: amount('executed_qty').notNull().default('0'),
    cumulativeQuoteQty: amount('cumulative_quote_qty').notNull().default('0'),
    /** Asset reserved by this order and the amount still reserved. */
    lockedAsset: text('locked_asset'),
    lockedAmount: amount('locked_amount').notNull().default('0'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('orders_client_id_uq').on(t.userId, t.clientOrderId),
    index('orders_user_idx').on(t.userId, t.id),
    index('orders_open_idx')
      .on(t.symbol, t.status)
      .where(sql`${t.status} in ('NEW', 'PARTIALLY_FILLED')`),
    check('orders_locked_nonneg', sql`${t.lockedAmount} >= 0`),
  ],
);

export const trades = pgTable(
  'trades',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => orders.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    symbol: text('symbol').notNull(),
    side: text('side', { enum: ['BUY', 'SELL'] }).notNull(),
    price: amount('price').notNull(),
    quantity: amount('quantity').notNull(),
    quoteQty: amount('quote_qty').notNull(),
    fee: amount('fee').notNull(),
    feeAsset: text('fee_asset').notNull(),
    liquidity: text('liquidity', { enum: ['MAKER', 'TAKER'] }).notNull(),
    /** Time of the Binance market event that caused this fill (audit trail). */
    marketEventAt: ts('market_event_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('trades_user_idx').on(t.userId, t.id), index('trades_order_idx').on(t.orderId)],
);

export const reconciliationRuns = pgTable('reconciliation_runs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  startedAt: ts('started_at').notNull(),
  finishedAt: ts('finished_at').notNull(),
  ok: boolean('ok').notNull(),
  checkedBalances: integer('checked_balances').notNull(),
  mismatches: jsonb('mismatches').notNull(),
});

// ───────────────────────────── market data (P04)

/** Closed candles only. openTime = UTC bucket start; observedAt = when we received the closed candle. */
export const candles = pgTable(
  'candles',
  {
    symbol: text('symbol').notNull(),
    interval: text('interval').notNull(),
    openTime: ts('open_time').notNull(),
    closeTime: ts('close_time').notNull(),
    open: amount('open').notNull(),
    high: amount('high').notNull(),
    low: amount('low').notNull(),
    close: amount('close').notNull(),
    volume: amount('volume').notNull(),
    quoteVolume: amount('quote_volume').notNull(),
    tradeCount: integer('trade_count').notNull(),
    source: text('source').notNull().default('binance'),
    observedAt: ts('observed_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.interval, t.openTime] })],
);
