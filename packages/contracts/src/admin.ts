import { z } from 'zod';
import { AssetCode, DecimalString, IsoDateTime, Role, SymbolCode, TimeRangeQuery } from './common.ts';
import { AssetTag, MarketStatus, SymbolInfo } from './market.ts';
import { Balance, LedgerEntry, WalletAccount } from './wallet.ts';
import { FuturesAccount, FuturesFees } from './futures.ts';
import { DcaPlan, GridBot } from './bots.ts';
import { TaxCategory } from './tax.ts';

/** Every admin action that changes data must say why (stored in the audit log). */
export const Reason = z.string().trim().min(5, 'at least 5 characters').max(500);

export const AdminUserSummary = z.object({
  id: z.string(),
  /** Public 8-digit account number (what users quote to support). */
  uid: z.string(),
  email: z.string(),
  name: z.string(),
  role: Role,
  status: z.enum(['active', 'locked']),
  emailVerified: z.boolean(),
  twoFactorEnabled: z.boolean(),
  signalsAccess: z.boolean(),
  /** Signal bot account: balances and status cannot be changed by anyone. */
  isBot: z.boolean(),
  createdAt: IsoDateTime,
  /** Most recent activity of any session; null if never signed in. */
  lastSeenAt: IsoDateTime.nullable(),
});
export type AdminUserSummary = z.infer<typeof AdminUserSummary>;

export const AdminUserListQuery = z.object({
  /** Matches email (contains), exact UID (8 digits) or exact user id. */
  q: z.string().trim().max(254).optional(),
  role: Role.optional(),
  status: z.enum(['active', 'locked']).optional(),
});

/** Tax overview of one user for the admin screen (module T, 0.18.0). Sums cover ALL time; the records are `adminTaxWithholdings`. */
export const AdminUserTax = z.object({
  /** Self-declared category; INDIVIDUAL when the user never chose (updatedAt null). */
  category: TaxCategory,
  categoryUpdatedAt: IsoDateTime.nullable(),
  /** Number of withheld SELL fills and the sum of their tax, in USDT. 0 / "0.00000000" while tax was never on. */
  withheldCount: z.number().int(),
  withheldTotal: DecimalString,
});
export type AdminUserTax = z.infer<typeof AdminUserTax>;

export const AdminUserDetail = z.object({
  user: AdminUserSummary,
  balances: z.array(Balance),
  totalValueUsdt: DecimalString,
  unpricedAssets: z.array(AssetCode),
  openOrders: z.number().int(),
  activeSessions: z.number().int(),
  faucetTotalClaimed: DecimalString,
  /** Futures wallet (unrealized PnL at the live mark). */
  futures: FuturesAccount,
  bots: z.object({ runningGrid: z.number().int(), activeDca: z.number().int() }),
  tax: AdminUserTax,
});
export type AdminUserDetail = z.infer<typeof AdminUserDetail>;

/** Futures positions of a user: open (default) or closed (newest first). */
export const AdminUserPositionsQuery = z.object({ open: z.enum(['true', 'false']).default('true') });

/** Every grid bot and recurring buy of a user (running first). */
export const AdminUserBots = z.object({ grid: z.array(GridBot), dca: z.array(DcaPlan) });
export type AdminUserBots = z.infer<typeof AdminUserBots>;

export const AdminStopGridBotRequest = z.object({
  reason: Reason,
  /** Sell the base the bot holds at market after canceling its orders. */
  sellBase: z.boolean().default(false),
});

export const AdminUserOrdersQuery = z.object({ open: z.enum(['true', 'false']).default('true') });

export const ReasonBody = z.object({ reason: Reason });
export const SignalsAccessRequest = z.object({ enabled: z.boolean(), reason: Reason });
/** Owner only. Nobody can change their own role; the last owner cannot be demoted; bots cannot get a role. */
export const SetRoleRequest = z.object({ role: Role, reason: Reason });

/** amount > 0 credits, < 0 debits the available balance. A debit larger than available → INSUFFICIENT_BALANCE. */
export const BalanceAdjustmentRequest = z.object({
  asset: AssetCode,
  amount: DecimalString.refine((s) => /[1-9]/.test(s), 'must not be zero').refine((s) => !s.includes('.') || s.split('.')[1]!.length <= 8, 'at most 8 decimals'),
  reason: Reason,
});
export const BalanceAdjustmentResult = z.object({
  /** Balance after the adjustment. */
  balance: Balance,
  entry: LedgerEntry,
  auditLogId: z.string(),
});
export type BalanceAdjustmentResult = z.infer<typeof BalanceAdjustmentResult>;

/**
 * Cancels all open orders, sets every balance to 0 (ledger ACCOUNT_RESET), clears faucet history,
 * cost basis and value history. `confirm` must be the literal "RESET".
 */
export const ResetAccountRequest = z.object({ reason: Reason, confirm: z.literal('RESET') });

export const ExchangeSettings = z.object({
  tradingHalted: z.boolean(),
  feeRate: DecimalString,
  faucet: z.object({ asset: AssetCode, amount: DecimalString, cooldownHours: z.number().int(), lifetimeCap: DecimalString }),
  futures: FuturesFees,
  /** Market data older than this → STALE → no new orders, no matching. */
  staleThresholdMs: z.number().int(),
  updatedAt: IsoDateTime,
});
export type ExchangeSettings = z.infer<typeof ExchangeSettings>;

export const UpdateSettingsRequest = z
  .object({
    /** 0 … 0.01 (1%) */
    feeRate: DecimalString.optional(),
    faucetAmount: DecimalString.optional(),
    faucetCooldownHours: z.number().int().min(0).max(24 * 30).optional(),
    faucetLifetimeCap: DecimalString.optional(),
    staleThresholdMs: z.number().int().min(2_000).max(120_000).optional(),
    /** Futures fees, 0 … 0.01 each (liquidation fee 0 … 0.05). */
    futuresMakerFee: DecimalString.optional(),
    futuresTakerFee: DecimalString.optional(),
    futuresLiquidationFee: DecimalString.optional(),
    reason: Reason,
  })
  .refine((r) => Object.keys(r).some((k) => k !== 'reason'), { message: 'change at least one setting' });

/** Two-step confirmation: the UI makes the admin type the word, the server checks it too. */
export const HaltRequest = z.object({ reason: Reason, confirm: z.literal('HALT') });
export const ResumeRequest = z.object({ reason: Reason, confirm: z.literal('RESUME') });

export const AdminSymbol = SymbolInfo.extend({
  /** Status reported by Binance (TRADING, BREAK…). A pair is tradable only if TRADING and enabled. */
  sourceStatus: z.string(),
  /** Admin switch. */
  adminEnabled: z.boolean(),
  openOrders: z.number().int(),
  updatedAt: IsoDateTime,
});
export type AdminSymbol = z.infer<typeof AdminSymbol>;

export const UpdateSymbolRequest = z.object({
  enabled: z.boolean(),
  /** When disabling: also cancel every open order on the pair (closeReason ADMIN). */
  cancelOpenOrders: z.boolean().default(false),
  reason: Reason,
});

export const AuditAction = z.enum([
  'USER_LOCK',
  'USER_UNLOCK',
  'USER_SIGNALS_ACCESS',
  'USER_ROLE',
  'BALANCE_ADJUST',
  'ACCOUNT_RESET',
  'SETTINGS_UPDATE',
  'TRADING_HALT',
  'TRADING_RESUME',
  'SYMBOL_UPDATE',
  'RECONCILIATION_RUN',
  'TWO_FACTOR_ENABLE',
  'TWO_FACTOR_DISABLE',
  /** role set from the server command line (first owner) */
  'ROLE_BOOTSTRAP',
  'ASSET_UPDATE',
  'ANNOUNCEMENT_CREATE',
  'ANNOUNCEMENT_UPDATE',
  'FUTURES_SYMBOL_UPDATE',
  'GRID_BOT_STOP',
  'DCA_PLAN_CANCEL',
  // closed staging (0.10.0)
  'INVITE_CREATE',
  'INVITE_REVOKE',
  // Vietnam tax (0.15.0): taxMode / taxRate / taxVndRate changed
  'TAX_SETTINGS_UPDATE',
]);
export type AuditAction = z.infer<typeof AuditAction>;

export const AuditTargetType = z.enum(['USER', 'EXCHANGE', 'SYMBOL', 'ASSET', 'ANNOUNCEMENT', 'INVITE']);
export type AuditTargetType = z.infer<typeof AuditTargetType>;

/** Append-only: entries can never be edited or deleted (enforced by the database). */
export const AuditLogEntry = z.object({
  id: z.string(),
  /** null for actions run from the server command line. */
  actor: z.object({ id: z.string(), email: z.string() }).nullable(),
  action: AuditAction,
  targetType: AuditTargetType.nullable(),
  targetId: z.string().nullable(),
  before: z.unknown(),
  after: z.unknown(),
  reason: z.string().nullable(),
  ip: z.string().nullable(),
  createdAt: IsoDateTime,
});
export type AuditLogEntry = z.infer<typeof AuditLogEntry>;

export const AuditLogQuery = z
  .object({
    actorId: z.string().optional(),
    action: AuditAction.optional(),
    targetType: AuditTargetType.optional(),
    targetId: z.string().optional(),
  })
  .extend(TimeRangeQuery.shape);

export const ReconciliationMismatch = z.object({
  /**
   * LOCKED_VS_FUTURES: futures locked ≠ open futures orders' reservations + open positions' margin.
   * Vietnam tax (0.15.0), per (user, quote asset), field `available`, expected = Σ tax_withholdings.taxAmount:
   * TAX_LEDGER_VS_WITHHOLDINGS: actual = −Σ ledger TAX_WITHHOLDING; TAX_TRADES_VS_WITHHOLDINGS: actual = Σ Trade.tax
   * of the SELL fills (a BUY fill with tax ≠ 0 is reported here too, with its fee asset and expected "0").
   */
  kind: z.enum(['LEDGER_VS_BALANCE', 'LOCKED_VS_OPEN_ORDERS', 'LOCKED_VS_FUTURES', 'TAX_LEDGER_VS_WITHHOLDINGS', 'TAX_TRADES_VS_WITHHOLDINGS']),
  account: WalletAccount,
  userId: z.string(),
  asset: z.string(),
  field: z.enum(['available', 'locked']),
  expected: z.string(),
  actual: z.string(),
});

export const ReconciliationRun = z.object({
  id: z.string(),
  startedAt: IsoDateTime,
  finishedAt: IsoDateTime,
  ok: z.boolean(),
  checkedBalances: z.number().int(),
  mismatches: z.array(ReconciliationMismatch),
});
export type ReconciliationRun = z.infer<typeof ReconciliationRun>;

export const AdminOverview = z.object({
  users: z.object({ total: z.number().int(), newLast24h: z.number().int(), locked: z.number().int(), staff: z.number().int() }),
  orders: z.object({ open: z.number().int(), placedLast24h: z.number().int() }),
  trades: z.object({ last24h: z.number().int() }),
  tradingHalted: z.boolean(),
  market: MarketStatus,
  /** null until the first run. */
  lastReconciliation: ReconciliationRun.nullable(),
  serverTime: IsoDateTime,
});
export type AdminOverview = z.infer<typeof AdminOverview>;

export const UserIdParam = z.object({ userId: z.uuid() });
export const UserBotParam = UserIdParam.extend({ botId: z.string().regex(/^\d+$/) });
export const UserDcaParam = UserIdParam.extend({ planId: z.string().regex(/^\d+$/) });
export const SymbolParam = z.object({ symbol: SymbolCode });

export const AssetParam = z.object({ asset: AssetCode });

/** PATCH coin display info; only the fields sent change. */
export const UpdateAssetRequest = z.object({
  name: z.string().trim().min(1).max(60).nullable().optional(),
  tags: z.array(AssetTag).max(5).optional(),
  description: z.string().trim().min(1).max(1000).nullable().optional(),
  reason: Reason,
});
