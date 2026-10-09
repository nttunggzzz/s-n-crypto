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
    /** TOTP secret, encrypted (SecretBox). Set when 2FA is on. */
    twoFactorSecret: text('two_factor_secret'),
    /** Secret being set up, not yet confirmed with a code. */
    twoFactorPendingSecret: text('two_factor_pending_secret'),
    twoFactorEnabledAt: ts('two_factor_enabled_at'),
    /** Last accepted TOTP time step — a code can be used once. */
    twoFactorLastStep: bigint('two_factor_last_step', { mode: 'number' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)],
);

/** One-time 2FA recovery codes (sha256), 10 per user. */
export const recoveryCodes = pgTable(
  'recovery_codes',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: ts('used_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('recovery_codes_user_idx').on(t.userId)],
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
    /** Signed in with a second factor (or turned 2FA on in this session). Required for the admin API. */
    mfaVerified: boolean('mfa_verified').notNull().default(false),
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
    purpose: text('purpose', { enum: ['EMAIL_VERIFY', 'PASSWORD_RESET', 'LOGIN_2FA'] }).notNull(),
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
    targetType: text('target_type', { enum: ['USER', 'EXCHANGE', 'SYMBOL'] }),
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
export const ORDER_TYPES = ['MARKET', 'LIMIT', 'STOP_MARKET', 'STOP_LIMIT', 'TRAILING_STOP_MARKET'] as const;
export const CLOSE_REASONS = ['USER_CANCELED', 'OCO_SIBLING', 'IOC_REMAINDER', 'ADMIN'] as const;

/** TP/SL attached to a BUY order (stored on the parent). */
export interface TpSlData {
  takeProfitPrice: string | null;
  stopLossPrice: string | null;
  stopLossLimitPrice: string | null;
  state: 'PENDING' | 'PLACED' | 'SKIPPED';
  childOrderListId: string | null;
  childOrderIds: string[];
  skippedReason: string | null;
}

/** OCO: two orders sharing one reservation (held by whichever leg is live). */
export const orderLists = pgTable(
  'order_lists',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientListId: text('client_list_id').notNull(),
    symbol: text('symbol')
      .notNull()
      .references(() => symbols.symbol),
    side: text('side', { enum: ['BUY', 'SELL'] }).notNull(),
    contingencyType: text('contingency_type', { enum: ['OCO'] }).notNull(),
    listStatus: text('list_status', { enum: ['EXECUTING', 'ALL_DONE'] }).notNull(),
    parentOrderId: bigint('parent_order_id', { mode: 'number' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('order_lists_client_id_uq').on(t.userId, t.clientListId), index('order_lists_user_idx').on(t.userId, t.id)],
);

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
    type: text('type', { enum: ORDER_TYPES }).notNull(),
    timeInForce: text('time_in_force', { enum: ['GTC', 'IOC'] }),
    status: text('status', { enum: ORDER_STATUSES }).notNull(),
    price: amount('price'),
    /** Trigger price; for trailing stops the current (moving) trigger level. */
    stopPrice: amount('stop_price'),
    quantity: amount('quantity'),
    quoteOrderQty: amount('quote_order_qty'),
    executedQty: amount('executed_qty').notNull().default('0'),
    cumulativeQuoteQty: amount('cumulative_quote_qty').notNull().default('0'),
    /** Asset reserved by this order and the amount still reserved. */
    lockedAsset: text('locked_asset'),
    lockedAmount: amount('locked_amount').notNull().default('0'),
    /** BUY by quantity: USDT reserved per unit of remaining quantity (limit price, or max of both OCO prices). */
    lockPrice: amount('lock_price'),
    triggerState: text('trigger_state', { enum: ['WAITING', 'TRIGGERED'] }),
    triggerDirection: text('trigger_direction', { enum: ['UP', 'DOWN'] }),
    triggeredAt: ts('triggered_at'),
    trailingDeltaBips: integer('trailing_delta_bips'),
    activationPrice: amount('activation_price'),
    trailingReferencePrice: amount('trailing_reference_price'),
    orderListId: bigint('order_list_id', { mode: 'number' }).references(() => orderLists.id),
    parentOrderId: bigint('parent_order_id', { mode: 'number' }),
    tpsl: jsonb('tpsl').$type<TpSlData>(),
    closeReason: text('close_reason', { enum: CLOSE_REASONS }),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('orders_client_id_uq').on(t.userId, t.clientOrderId),
    index('orders_user_idx').on(t.userId, t.id),
    index('orders_open_idx')
      .on(t.symbol, t.status)
      .where(sql`${t.status} in ('NEW', 'PARTIALLY_FILLED')`),
    index('orders_list_idx').on(t.orderListId),
    index('orders_parent_idx').on(t.parentOrderId),
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
    /** SELL only: USDT received after fee minus quantity × average cost; null if no cost basis. */
    realizedPnl: amount('realized_pnl'),
    /** Time of the Binance market event that caused this fill (audit trail). */
    marketEventAt: ts('market_event_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('trades_user_idx').on(t.userId, t.id), index('trades_order_idx').on(t.orderId)],
);

/**
 * Average-cost book per (user, base asset), updated in the same transaction as each fill.
 * quantity follows trades only (not faucet/admin moves); avgCost is null when quantity is 0.
 */
export const positions = pgTable(
  'positions',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    asset: text('asset').notNull(),
    quantity: amount('quantity').notNull().default('0'),
    avgCost: amount('avg_cost'),
    realizedPnl: amount('realized_pnl').notNull().default('0'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.asset] })],
);

/** Hourly account value. `time` = hour bucket (UTC); value null when an asset had no live price. */
export const portfolioSnapshots = pgTable(
  'portfolio_snapshots',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    time: ts('time').notNull(),
    totalValueUsdt: amount('total_value_usdt'),
    takenAt: ts('taken_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.time] })],
);

export const priceAlerts = pgTable(
  'price_alerts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    symbol: text('symbol')
      .notNull()
      .references(() => symbols.symbol),
    condition: text('condition', { enum: ['ABOVE', 'BELOW'] }).notNull(),
    targetPrice: amount('target_price').notNull(),
    note: text('note'),
    status: text('status', { enum: ['ACTIVE', 'TRIGGERED', 'CANCELED'] }).notNull().default('ACTIVE'),
    triggeredPrice: amount('triggered_price'),
    triggeredAt: ts('triggered_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('price_alerts_user_idx').on(t.userId, t.id),
    index('price_alerts_active_idx')
      .on(t.symbol)
      .where(sql`${t.status} = 'ACTIVE'`),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    /** Type-specific fields of the contract Notification (without id/type/readAt/createdAt). */
    payload: jsonb('payload').notNull(),
    readAt: ts('read_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_idx').on(t.userId, t.id),
    index('notifications_unread_idx')
      .on(t.userId)
      .where(sql`${t.readAt} is null`),
  ],
);

export const userPreferences = pgTable('user_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  data: jsonb('data').notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

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
