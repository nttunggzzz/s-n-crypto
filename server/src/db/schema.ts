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
    /** Short public account number (like an exchange UID); existing users get one on migration. */
    uid: bigint('uid', { mode: 'number' }).generatedByDefaultAsIdentity({ startWith: 10000001 }).notNull(),
    /** Preset avatar key (contracts AvatarId); null = initials. */
    avatar: text('avatar'),
    /** Shown in every email we send (not a secret — it proves the email is from us). */
    antiPhishingCode: text('anti_phishing_code'),
    passwordChangedAt: ts('password_changed_at'),
    /** Invite used to sign up (closed staging); null when registration was open. */
    inviteId: bigint('invite_id', { mode: 'number' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email), uniqueIndex('users_uid_uq').on(t.uid)],
);

/**
 * Sign-up invite codes (REGISTRATION=invite). Only a sha256 of the code is stored; the code is shown once.
 * A sign-up takes one use in the same transaction that creates the user (`uses < max_uses` guard).
 */
export const invites = pgTable(
  'invites',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    codeHash: text('code_hash').notNull(),
    /** First 4 characters, to recognise a code in lists. */
    codePrefix: text('code_prefix').notNull(),
    note: text('note').notNull(),
    maxUses: integer('max_uses').notNull(),
    uses: integer('uses').notNull().default(0),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
    /** null = created from the server command line. */
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('invites_code_uq').on(t.codeHash), check('invites_uses_le_max', sql`${t.uses} >= 0 and ${t.uses} <= ${t.maxUses}`)],
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
    targetType: text('target_type', { enum: ['USER', 'EXCHANGE', 'SYMBOL', 'ASSET', 'ANNOUNCEMENT', 'INVITE'] }),
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

/** Coin display info (name, sector tags, description). Seeded from ASSET_CATALOG; admins edit it. */
export const assets = pgTable('assets', {
  asset: text('asset').primaryKey(),
  name: text('name'),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  description: text('description'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/** Exchange news. publishedAt null = draft; hidden = soft-deleted (kept for the audit log). */
export const announcements = pgTable(
  'announcements',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    level: text('level', { enum: ['INFO', 'IMPORTANT', 'MAINTENANCE'] }).notNull(),
    pinned: boolean('pinned').notNull().default(false),
    publishedAt: ts('published_at'),
    expiresAt: ts('expires_at'),
    hidden: boolean('hidden').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('announcements_public_idx').on(t.pinned, t.publishedAt).where(sql`${t.hidden} = false and ${t.publishedAt} is not null`)],
);

export const TAX_MODES = ['OFF', 'WITHHOLD'] as const;
export const TAX_CATEGORIES = ['INDIVIDUAL', 'FOREIGN_ORG', 'DOMESTIC_ORG'] as const;
export type TaxCategoryValue = (typeof TAX_CATEGORIES)[number];

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
    futuresMakerFee: amount('futures_maker_fee').notNull().default('0.0002'),
    futuresTakerFee: amount('futures_taker_fee').notNull().default('0.0005'),
    futuresLiquidationFee: amount('futures_liquidation_fee').notNull().default('0.005'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    // Vietnam tax (module T): OFF by default — an admin turns it on (audited TAX_SETTINGS_UPDATE).
    taxMode: text('tax_mode', { enum: TAX_MODES }).notNull().default('OFF'),
    /** 0 < rate ≤ 0.01 (checked by the contract and the service), applied to spot SELL fills. */
    taxRate: amount('tax_rate').notNull().default('0.001'),
    /** VND per 1 USDT typed by the admin; null = not set → every VND amount is null. */
    taxVndRate: amount('tax_vnd_rate'),
    taxVndRateUpdatedAt: ts('tax_vnd_rate_updated_at'),
    /** Last change of the tax settings (TaxSettings.updatedAt). */
    taxUpdatedAt: ts('tax_updated_at').notNull().defaultNow(),
  },
  (t) => [
    check('exchange_settings_singleton', sql`${t.id} = 1`),
    check('exchange_settings_tax_mode', sql`${t.taxMode} in ('OFF', 'WITHHOLD')`),
    check('exchange_settings_tax_rate', sql`${t.taxRate} > 0 and ${t.taxRate} <= 0.01`),
  ],
);

// ───────────────────────────── ledger (P05)

/** SPOT wallet and FUTURES wallet (USDT margin). Every balance row and ledger row belongs to one. */
export const ACCOUNTS = ['SPOT', 'FUTURES'] as const;
export type Account = (typeof ACCOUNTS)[number];

export const balances = pgTable(
  'balances',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    account: text('account', { enum: ACCOUNTS }).notNull().default('SPOT'),
    asset: text('asset').notNull(),
    available: amount('available').notNull().default('0'),
    locked: amount('locked').notNull().default('0'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.account, t.asset] }),
    // Last line of defence: a balance can never go negative.
    check('balances_available_nonneg', sql`${t.available} >= 0`),
    check('balances_locked_nonneg', sql`${t.locked} >= 0`),
  ],
);

export const LEDGER_TYPES = [
  'FAUCET',
  'ORDER_LOCK',
  'ORDER_UNLOCK',
  'TRADE_DEBIT',
  'TRADE_CREDIT',
  'FEE',
  'ADMIN_ADJUST',
  'ACCOUNT_RESET',
  'TRANSFER',
  'REALIZED_PNL',
  'FUNDING_FEE',
  'LIQUIDATION',
  'MARGIN_ADJUST',
  /** Vietnam tax withheld from a spot SELL fill (quote asset, ref ORDER) — module T. */
  'TAX_WITHHOLDING',
] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];
export const REF_TYPES = ['ORDER', 'TRADE', 'FAUCET', 'ADMIN', 'TRANSFER', 'FUTURES_ORDER', 'FUTURES_POSITION'] as const;
export type RefType = (typeof REF_TYPES)[number];

/** Append-only (enforced by trigger). sum(deltas) per (user, asset) must equal the balance row. */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    account: text('account', { enum: ACCOUNTS }).notNull().default('SPOT'),
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
  (t) => [index('ledger_user_idx').on(t.userId, t.id), index('ledger_user_asset_idx').on(t.userId, t.asset, t.id), index('ledger_user_account_idx').on(t.userId, t.account, t.id)],
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
export const CLOSE_REASONS = ['USER_CANCELED', 'OCO_SIBLING', 'IOC_REMAINDER', 'ADMIN', 'BOT_STOPPED'] as const;

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
    /** USER, or the bot that placed it (bot orders can only be canceled by the bot). */
    source: text('source', { enum: ['USER', 'GRID', 'DCA'] }).notNull().default('USER'),
    sourceId: bigint('source_id', { mode: 'number' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('orders_source_idx').on(t.source, t.sourceId).where(sql`${t.source} <> 'USER'`),
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
    /** SELL only: USDT received after fee and tax minus quantity × average cost; null if no cost basis. */
    realizedPnl: amount('realized_pnl'),
    /** Time of the Binance market event that caused this fill (audit trail). */
    marketEventAt: ts('market_event_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    /** Vietnam tax withheld from this fill, quote asset (SELL only; 0 otherwise and for fills before module T). */
    tax: amount('tax').notNull().default('0'),
    /**
     * SELL only: the seller's tax category AT THE FILL (also while taxMode = OFF and for DOMESTIC_ORG). null for a BUY and
     * for fills before migration 0009. Internal, for the tax reports - not part of the API contract.
     */
    taxCategory: text('tax_category', { enum: TAX_CATEGORIES }),
  },
  (t) => [index('trades_user_idx').on(t.userId, t.id), index('trades_order_idx').on(t.orderId)],
);

/**
 * Vietnam tax (module T): one row per withheld spot SELL fill — never two (unique trade_id), never edited or deleted
 * (append-only trigger, migration 0008). Written in the fill's transaction with the TAX_WITHHOLDING ledger row.
 * Rate, category and the VND reference rate are snapshots taken at the fill.
 */
export const taxWithholdings = pgTable(
  'tax_withholdings',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tradeId: bigint('trade_id', { mode: 'number' })
      .notNull()
      .references(() => trades.id),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => orders.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    symbol: text('symbol').notNull(),
    /** Quote asset of the pair (asset of grossQuote and taxAmount). */
    asset: text('asset').notNull(),
    quantity: amount('quantity').notNull(),
    price: amount('price').notNull(),
    grossQuote: amount('gross_quote').notNull(),
    taxRate: amount('tax_rate').notNull(),
    taxAmount: amount('tax_amount').notNull(),
    category: text('category', { enum: TAX_CATEGORIES }).notNull(),
    /** VND per 1 USDT at the fill; the three VND columns are null together. */
    vndRate: amount('vnd_rate'),
    /** floor(grossQuote × vndRate), whole dong. */
    grossVnd: amount('gross_vnd'),
    /** ceil(taxAmount × vndRate), whole dong. */
    taxVnd: amount('tax_vnd'),
    /** = the trade's createdAt. */
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('tax_withholdings_trade_uq').on(t.tradeId),
    index('tax_withholdings_user_idx').on(t.userId, t.createdAt),
    index('tax_withholdings_created_idx').on(t.createdAt),
    check('tax_withholdings_amount_pos', sql`${t.taxAmount} > 0`),
    check('tax_withholdings_category', sql`${t.category} in ('INDIVIDUAL', 'FOREIGN_ORG')`),
  ],
);

/** Self-declared taxpayer category (module T §3.3). No identity document column — on purpose. No row = INDIVIDUAL. */
export const userTaxProfiles = pgTable(
  'user_tax_profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: text('category', { enum: TAX_CATEGORIES }).notNull().default('INDIVIDUAL'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [check('user_tax_profiles_category', sql`${t.category} in ('INDIVIDUAL', 'FOREIGN_ORG', 'DOMESTIC_ORG')`)],
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

// ───────────────────────────── futures (phase F): USDT-M perpetuals, isolated margin, one-way mode

/** Contract rules from Binance USDⓈ-M exchangeInfo + admin switches. */
export const futuresSymbols = pgTable('futures_symbols', {
  symbol: text('symbol').primaryKey(),
  /** e.g. BTC, 1000PEPE */
  baseAsset: text('base_asset').notNull(),
  quoteAsset: text('quote_asset').notNull(),
  /** the coin behind it, e.g. PEPE (for name/icon) */
  underlyingAsset: text('underlying_asset').notNull(),
  multiplier: integer('multiplier').notNull().default(1),
  tickSize: amount('tick_size').notNull(),
  stepSize: amount('step_size').notNull(),
  minQty: amount('min_qty').notNull(),
  maxQty: amount('max_qty').notNull(),
  minNotional: amount('min_notional').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  sourceStatus: text('source_status').notNull(),
  maxLeverage: integer('max_leverage').notNull().default(20),
  maintenanceMarginRate: amount('maintenance_margin_rate').notNull().default('0.005'),
  sortOrder: integer('sort_order').notNull().default(0),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/**
 * The user's settings per contract — and the per-(user, symbol) lock: every futures operation on a
 * symbol locks this row FIRST (SELECT … FOR UPDATE), so they run one at a time.
 */
export const futuresUserSymbols = pgTable(
  'futures_user_symbols',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    symbol: text('symbol').notNull(),
    leverage: integer('leverage').notNull().default(10),
    marginMode: text('margin_mode', { enum: ['ISOLATED', 'CROSS'] }).notNull().default('ISOLATED'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.symbol] }), check('futures_leverage_range', sql`${t.leverage} between 1 and 20`)],
);

export const FUTURES_POSITION_CLOSE_REASONS = ['USER', 'TAKE_PROFIT', 'STOP_LOSS', 'LIQUIDATION', 'ADMIN'] as const;

export const futuresPositions = pgTable(
  'futures_positions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    symbol: text('symbol').notNull(),
    side: text('side', { enum: ['LONG', 'SHORT'] }).notNull(),
    status: text('status', { enum: ['OPEN', 'CLOSED'] }).notNull().default('OPEN'),
    marginMode: text('margin_mode', { enum: ['ISOLATED', 'CROSS'] }).notNull().default('ISOLATED'),
    quantity: amount('quantity').notNull(),
    maxQuantity: amount('max_quantity').notNull(),
    entryPrice: amount('entry_price').notNull(),
    leverage: integer('leverage').notNull(),
    /** Isolated margin — part of the FUTURES USDT `locked` balance. */
    margin: amount('margin').notNull(),
    realizedPnl: amount('realized_pnl').notNull().default('0'),
    fees: amount('fees').notNull().default('0'),
    funding: amount('funding').notNull().default('0'),
    closedQuantity: amount('closed_quantity').notNull().default('0'),
    closedNotional: amount('closed_notional').notNull().default('0'),
    takeProfitPrice: amount('take_profit_price'),
    stopLossPrice: amount('stop_loss_price'),
    closeReason: text('close_reason', { enum: FUTURES_POSITION_CLOSE_REASONS }),
    openedAt: ts('opened_at').notNull().defaultNow(),
    closedAt: ts('closed_at'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    // one-way mode: at most one open position per user and symbol
    uniqueIndex('futures_positions_one_open').on(t.userId, t.symbol).where(sql`${t.status} = 'OPEN'`),
    index('futures_positions_open_symbol_idx').on(t.symbol).where(sql`${t.status} = 'OPEN'`),
    index('futures_positions_user_idx').on(t.userId, t.id),
    check('futures_positions_qty_nonneg', sql`${t.quantity} >= 0`),
    check('futures_positions_margin_nonneg', sql`${t.margin} >= 0`),
  ],
);

export const FUTURES_ORDER_PURPOSES = ['TRADE', 'CLOSE', 'TAKE_PROFIT', 'STOP_LOSS', 'LIQUIDATION', 'ADMIN'] as const;

export const futuresOrders = pgTable(
  'futures_orders',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientOrderId: text('client_order_id').notNull(),
    symbol: text('symbol').notNull(),
    side: text('side', { enum: ['BUY', 'SELL'] }).notNull(),
    type: text('type', { enum: ['MARKET', 'LIMIT'] }).notNull(),
    purpose: text('purpose', { enum: FUTURES_ORDER_PURPOSES }).notNull().default('TRADE'),
    timeInForce: text('time_in_force', { enum: ['GTC', 'IOC'] }),
    price: amount('price'),
    quantity: amount('quantity').notNull(),
    executedQty: amount('executed_qty').notNull().default('0'),
    /** Σ price × qty of fills (avg = executedNotional / executedQty). */
    executedNotional: amount('executed_notional').notNull().default('0'),
    reduceOnly: boolean('reduce_only').notNull().default(false),
    leverage: integer('leverage').notNull(),
    status: text('status', { enum: ORDER_STATUSES }).notNull(),
    /** Initial margin reserved for the not-yet-filled quantity (part of FUTURES locked). */
    marginLocked: amount('margin_locked').notNull().default('0'),
    /** Fee reserved for the not-yet-filled quantity, at the taker rate (part of FUTURES locked). */
    feeLocked: amount('fee_locked').notNull().default('0'),
    fee: amount('fee').notNull().default('0'),
    realizedPnl: amount('realized_pnl').notNull().default('0'),
    /** TP/SL to set on the position when this order opens/increases it. */
    takeProfitPrice: amount('take_profit_price'),
    stopLossPrice: amount('stop_loss_price'),
    closeReason: text('close_reason'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('futures_orders_client_id').on(t.userId, t.clientOrderId),
    index('futures_orders_user_idx').on(t.userId, t.id),
    index('futures_orders_open_idx').on(t.symbol, t.side, t.price).where(sql`${t.status} in ('NEW', 'PARTIALLY_FILLED')`),
    check('futures_orders_exec_le_qty', sql`${t.executedQty} <= ${t.quantity}`),
    check('futures_orders_locks_nonneg', sql`${t.marginLocked} >= 0 and ${t.feeLocked} >= 0`),
  ],
);

export const futuresTrades = pgTable(
  'futures_trades',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => futuresOrders.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    positionId: bigint('position_id', { mode: 'number' }),
    symbol: text('symbol').notNull(),
    side: text('side', { enum: ['BUY', 'SELL'] }).notNull(),
    price: amount('price').notNull(),
    quantity: amount('quantity').notNull(),
    quoteQty: amount('quote_qty').notNull(),
    fee: amount('fee').notNull(),
    liquidity: text('liquidity', { enum: ['MAKER', 'TAKER'] }).notNull(),
    realizedPnl: amount('realized_pnl').notNull().default('0'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('futures_trades_user_idx').on(t.userId, t.id), index('futures_trades_order_idx').on(t.orderId)],
);

/** One row per settled funding time and symbol (rate and mark used). */
export const futuresFundingEvents = pgTable(
  'futures_funding_events',
  {
    symbol: text('symbol').notNull(),
    fundingTime: ts('funding_time').notNull(),
    rate: amount('rate').notNull(),
    markPrice: amount('mark_price').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.fundingTime] })],
);

/** Idempotency of funding: a position is paid at most once per funding time. */
export const futuresFundingPayments = pgTable(
  'futures_funding_payments',
  {
    positionId: bigint('position_id', { mode: 'number' })
      .notNull()
      .references(() => futuresPositions.id),
    fundingTime: ts('funding_time').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    symbol: text('symbol').notNull(),
    /** + received, − paid */
    amount: amount('amount').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.positionId, t.fundingTime] })],
);

// ───────────────────────────── phase 2.6: security, DCA, grid bots

/** Sign-in attempts for known accounts (shown in Security → login history; kept 180 days). */
export const loginEvents = pgTable(
  'login_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    at: ts('at').notNull().defaultNow(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    /** sha256 of the user agent — "device" for the new-device alert. */
    deviceKey: text('device_key'),
    success: boolean('success').notNull(),
    result: text('result', { enum: ['OK', 'BAD_PASSWORD', 'BAD_2FA', 'LOCKED'] }).notNull(),
    newDevice: boolean('new_device').notNull().default(false),
  },
  (t) => [index('login_events_user_idx').on(t.userId, t.id)],
);

export const dcaPlans = pgTable(
  'dca_plans',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    symbol: text('symbol').notNull(),
    quoteAmount: amount('quote_amount').notNull(),
    interval: text('interval', { enum: ['DAILY', 'WEEKLY', 'MONTHLY'] }).notNull(),
    hour: integer('hour').notNull(),
    dayOfWeek: integer('day_of_week'),
    dayOfMonth: integer('day_of_month'),
    status: text('status', { enum: ['ACTIVE', 'PAUSED', 'CANCELED'] }).notNull().default('ACTIVE'),
    nextRunAt: ts('next_run_at'),
    lastRunAt: ts('last_run_at'),
    runs: integer('runs').notNull().default(0),
    skipped: integer('skipped').notNull().default(0),
    totalSpent: amount('total_spent').notNull().default('0'),
    totalBought: amount('total_bought').notNull().default('0'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('dca_plans_due_idx').on(t.nextRunAt).where(sql`${t.status} = 'ACTIVE'`), index('dca_plans_user_idx').on(t.userId, t.id)],
);

export const dcaRuns = pgTable(
  'dca_runs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    planId: bigint('plan_id', { mode: 'number' })
      .notNull()
      .references(() => dcaPlans.id, { onDelete: 'cascade' }),
    /** The scheduled time this run is for — unique per plan, so a run can never happen twice. */
    scheduledAt: ts('scheduled_at').notNull(),
    executedAt: ts('executed_at'),
    status: text('status', { enum: ['PENDING', 'FILLED', 'SKIPPED'] }).notNull(),
    orderId: bigint('order_id', { mode: 'number' }),
    quoteSpent: amount('quote_spent').notNull().default('0'),
    baseBought: amount('base_bought').notNull().default('0'),
    price: amount('price'),
    reason: text('reason'),
  },
  (t) => [uniqueIndex('dca_runs_once').on(t.planId, t.scheduledAt), index('dca_runs_plan_idx').on(t.planId, t.id)],
);

export const gridBots = pgTable(
  'grid_bots',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    symbol: text('symbol').notNull(),
    lowerPrice: amount('lower_price').notNull(),
    upperPrice: amount('upper_price').notNull(),
    gridCount: integer('grid_count').notNull(),
    mode: text('mode', { enum: ['ARITHMETIC', 'GEOMETRIC'] }).notNull(),
    investment: amount('investment').notNull(),
    quantityPerGrid: amount('quantity_per_grid').notNull(),
    status: text('status', { enum: ['STARTING', 'RUNNING', 'STOPPED', 'ERROR'] }).notNull(),
    stopReason: text('stop_reason'),
    gridProfit: amount('grid_profit').notNull().default('0'),
    completedRounds: integer('completed_rounds').notNull().default(0),
    /** Owned by the bot but not in an order (rounding dust, extracted profit). */
    freeBase: amount('free_base').notNull().default('0'),
    freeQuote: amount('free_quote').notNull().default('0'),
    /** Value when the bot stopped (base sold at market, or valued at the live price then); null = no live price. */
    finalValue: amount('final_value'),
    createdAt: ts('created_at').notNull().defaultNow(),
    stoppedAt: ts('stopped_at'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('grid_bots_user_idx').on(t.userId, t.id), index('grid_bots_running_idx').on(t.status).where(sql`${t.status} = 'RUNNING'`)],
);

/**
 * One cell of a grid = the band [buyPrice, sellPrice]. It holds either quote (waits to BUY at buyPrice)
 * or base (waits to SELL at sellPrice); orderId is its current open order (null = to be placed).
 */
export const gridBotCells = pgTable(
  'grid_bot_cells',
  {
    botId: bigint('bot_id', { mode: 'number' })
      .notNull()
      .references(() => gridBots.id, { onDelete: 'cascade' }),
    idx: integer('idx').notNull(),
    buyPrice: amount('buy_price').notNull(),
    sellPrice: amount('sell_price').notNull(),
    side: text('side', { enum: ['BUY', 'SELL'] }).notNull(),
    /** Base to buy (BUY) or to sell (SELL). */
    quantity: amount('quantity').notNull(),
    /** Quote paid for the base it holds (to measure the round's profit). */
    costQuote: amount('cost_quote').notNull().default('0'),
    orderId: bigint('order_id', { mode: 'number' }),
    rounds: integer('rounds').notNull().default(0),
    profit: amount('profit').notNull().default('0'),
  },
  (t) => [primaryKey({ columns: [t.botId, t.idx] }), index('grid_bot_cells_order_idx').on(t.orderId)],
);

// ───────────────────────────── Module N: news and scheduled macro events (N2b)

/**
 * One row per ingestion source (catalogue in modules/news/sources.ts, synced at start-up).
 * `enabled` follows the configuration (NEWS_INGEST_ENABLED / NEWS_CALENDAR_ENABLED), not an admin switch.
 */
export const newsSources = pgTable(
  'news_sources',
  {
    /** Stable key, e.g. `rss-coindesk`, `gdelt-gkg`, `official-calendar`. */
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['GDELT', 'RSS', 'OFFICIAL_CALENDAR', 'FRED'] }).notNull(),
    url: text('url').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    pollIntervalSec: integer('poll_interval_sec').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [check('news_sources_kind', sql`${t.kind} in ('GDELT', 'RSS', 'OFFICIAL_CALENDAR', 'FRED')`)],
);

/** One attempt of a source (RSS fetch, GDELT file, calendar load); the source of truth for source health. */
export const newsIngestRuns = pgTable(
  'news_ingest_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: text('source_id')
      .notNull()
      .references(() => newsSources.id),
    startedAt: ts('started_at').notNull(),
    /** null while running (or when the process died mid-run). */
    finishedAt: ts('finished_at'),
    /** NOT_PUBLISHED_YET = the source pointed at a file that is not there yet (GDELT 404): not a failure. */
    status: text('status', { enum: ['OK', 'ERROR', 'NOT_PUBLISHED_YET'] }).notNull(),
    itemsSeen: integer('items_seen').notNull().default(0),
    itemsInserted: integer('items_inserted').notNull().default(0),
    /** Median of firstSeenAt - publishedAt of the run's new items (ms, may be negative); null = no item had a publishedAt. */
    medianLagMs: bigint('median_lag_ms', { mode: 'number' }),
    error: text('error'),
  },
  (t) => [
    index('news_ingest_runs_source_idx').on(t.sourceId, t.startedAt.desc()),
    // latest OK / latest ERROR of one source straight from the index (source health), however long the history is
    index('news_ingest_runs_source_status_idx').on(t.sourceId, t.status, t.startedAt.desc()),
    check('news_ingest_runs_status', sql`${t.status} in ('OK', 'ERROR', 'NOT_PUBLISHED_YET')`),
  ],
);

/**
 * A news item as the analysis system first saw it. Only title, URL, source, times and derived labels are stored, never the
 * article text. Point-in-time is `first_seen_at` (ours), never `published_at` (the publisher's, may be null). `first_seen_at`
 * has no default and is always written from a JS Date (millisecond precision) - the admin list cursor relies on it.
 */
export const newsItems = pgTable(
  'news_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: text('source_id')
      .notNull()
      .references(() => newsSources.id),
    /** http(s) only and at most 2048 characters (CHECK; the contract says the same). */
    url: text('url').notNull(),
    /** Canonical form of `url` (tracking parameters removed): one row per story URL. */
    urlCanonical: text('url_canonical').notNull(),
    title: text('title').notNull(),
    /** Normalised title hash, to spot the same story under another URL. */
    titleFingerprint: text('title_fingerprint').notNull(),
    publishedAt: ts('published_at'),
    /** Millisecond precision (the API cursor is in milliseconds): a value written with now() is rounded to the millisecond too. */
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true, precision: 3, mode: 'date' }).notNull(),
    /**
     * LIVE = stored by an ingest job as the news appeared; BACKFILL = loaded later from history (N3). No default: whoever
     * writes must say which. Only LIVE rows are ever cleaned up.
     */
    origin: text('origin', { enum: ['LIVE', 'BACKFILL'] }).notNull(),
    /** Listed pairs the item is about (`BTCUSDT`); empty = market-wide. */
    symbols: text('symbols').array().notNull().default(sql`'{}'::text[]`),
    /** At least one; `OTHER` when the classifier is not sure. */
    eventTypes: text('event_types').array().notNull(),
    /** Source-provided score (GDELT only); NULL is "unscored", never 0. */
    tone: amount('tone'),
    classifierVersion: text('classifier_version').notNull(),
    /** Run that first stored it; null for items without a run (backfill). */
    ingestRunId: uuid('ingest_run_id').references(() => newsIngestRuns.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('news_items_url_canonical_uq').on(t.urlCanonical),
    index('news_items_title_fingerprint_idx').on(t.titleFingerprint),
    index('news_items_first_seen_idx').on(t.firstSeenAt.desc(), t.id.desc()),
    index('news_items_symbols_gin').using('gin', t.symbols),
    index('news_items_source_seen_idx').on(t.sourceId, t.firstSeenAt.desc()),
    check('news_items_event_types_nonempty', sql`cardinality(${t.eventTypes}) >= 1`),
    check('news_items_url_http', sql`${t.url} ~ '^https?://' and length(${t.url}) <= 2048`),
    check('news_items_url_canonical_http', sql`${t.urlCanonical} ~ '^https?://' and length(${t.urlCanonical}) <= 2048`),
    check('news_items_origin', sql`${t.origin} in ('LIVE', 'BACKFILL')`),
  ],
);

/**
 * Scheduled macro releases, loaded from modules/news/data/macro-calendar.csv at start-up. Future rows follow the file;
 * past rows are evidence and are never changed or deleted by the loader. All times UTC.
 */
export const macroEvents = pgTable(
  'macro_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code', { enum: ['FOMC_DECISION', 'CPI', 'NFP', 'PCE', 'OTHER'] }).notNull(),
    name: text('name').notNull(),
    scheduledAt: ts('scheduled_at').notNull(),
    importance: text('importance', { enum: ['HIGH', 'MEDIUM', 'LOW'] }).notNull(),
    referencePeriod: text('reference_period').notNull(),
    sourceUrl: text('source_url').notNull(),
    note: text('note'),
    /** Published value; null until known (v0 never fills it - FRED comes with N-D3). */
    actual: amount('actual'),
    actualKnownAt: ts('actual_known_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('macro_events_code_at_uq').on(t.code, t.scheduledAt),
    index('macro_events_at_idx').on(t.scheduledAt),
    check('macro_events_code', sql`${t.code} in ('FOMC_DECISION', 'CPI', 'NFP', 'PCE', 'OTHER')`),
    check('macro_events_importance', sql`${t.importance} in ('HIGH', 'MEDIUM', 'LOW')`),
  ],
);
