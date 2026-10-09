import { z } from 'zod';
import { AssetCode, DecimalString, IsoDateTime, TimeRangeQuery } from './common.ts';

export const Balance = z.object({
  asset: AssetCode,
  available: DecimalString,
  /** Reserved by open orders. */
  locked: DecimalString,
  total: DecimalString,
  /** Value of `total` in USDT at the last price; null when no fresh price is available. */
  valueUsdt: DecimalString.nullable(),
});
export type Balance = z.infer<typeof Balance>;

export const Balances = z.object({
  items: z.array(Balance),
  /** Sum of valueUsdt over assets that could be priced. */
  totalValueUsdt: DecimalString,
  /** Assets left out of totalValueUsdt because no price was available. Empty = total is complete. */
  unpricedAssets: z.array(AssetCode),
});
export type Balances = z.infer<typeof Balances>;

/** Which wallet a balance / ledger row belongs to. */
export const WalletAccount = z.enum(['SPOT', 'FUTURES']);
export type WalletAccount = z.infer<typeof WalletAccount>;

export const LedgerEntryType = z.enum([
  'FAUCET',
  'ORDER_LOCK',
  'ORDER_UNLOCK',
  'TRADE_DEBIT',
  'TRADE_CREDIT',
  'FEE',
  'ADMIN_ADJUST',
  'ACCOUNT_RESET',
  // futures (phase F)
  /** Spot ↔ Futures wallet transfer (one row in each wallet). */
  'TRANSFER',
  /** Closing part of a position: margin released + PnL (both sides of the change in one row). */
  'REALIZED_PNL',
  'FUNDING_FEE',
  'LIQUIDATION',
  /** Margin added to / removed from an isolated position. */
  'MARGIN_ADJUST',
]);
export type LedgerEntryType = z.infer<typeof LedgerEntryType>;

export const LedgerEntry = z.object({
  id: z.string(),
  account: WalletAccount,
  asset: AssetCode,
  type: LedgerEntryType,
  /** Change of available balance (signed). */
  deltaAvailable: DecimalString,
  /** Change of locked balance (signed). */
  deltaLocked: DecimalString,
  availableAfter: DecimalString,
  lockedAfter: DecimalString,
  /** What caused it: an order, a trade, a faucet claim, an admin action. */
  refType: z.enum(['ORDER', 'TRADE', 'FAUCET', 'ADMIN', 'TRANSFER', 'FUTURES_ORDER', 'FUTURES_POSITION']).nullable(),
  refId: z.string().nullable(),
  createdAt: IsoDateTime,
});
export type LedgerEntry = z.infer<typeof LedgerEntry>;

export const LedgerQuery = z
  .object({
    asset: AssetCode.optional(),
    /** Hide ORDER_LOCK / ORDER_UNLOCK rows (default true for a cleaner history). */
    hideLocks: z.enum(['true', 'false']).default('true'),
  })
  .extend(TimeRangeQuery.shape);

export const FaucetStatus = z.object({
  asset: AssetCode,
  /** Amount given per claim. */
  amount: DecimalString,
  cooldownHours: z.number().int(),
  /** Lifetime total a user can claim (reset only by an admin account reset). */
  lifetimeCap: DecimalString,
  totalClaimed: DecimalString,
  canClaim: z.boolean(),
  /** When the next claim is allowed; null if allowed now or cap reached. */
  nextAvailableAt: IsoDateTime.nullable(),
});
export type FaucetStatus = z.infer<typeof FaucetStatus>;

export const FaucetClaimResult = z.object({
  claimed: DecimalString,
  balance: Balance,
  status: FaucetStatus,
});
export type FaucetClaimResult = z.infer<typeof FaucetClaimResult>;
