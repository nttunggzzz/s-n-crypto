import { z } from 'zod';

/** Every error code the API can return. The UI maps codes to i18n messages. */
export const ErrorCode = z.enum([
  // generic
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'RATE_LIMITED',
  'CONFLICT',
  'INTERNAL_ERROR',
  // account
  'EMAIL_NOT_VERIFIED',
  'ACCOUNT_LOCKED',
  /** sign-up needs a valid invite code (registration INVITE_ONLY); details.reason: InviteRefusal */
  'INVALID_INVITE',
  /** staff must enable 2FA (and sign in with it) before using the admin API */
  'TWO_FACTOR_REQUIRED',
  'INVALID_TWO_FACTOR_CODE',
  /** the signal bot account cannot be modified */
  'BOT_ACCOUNT_PROTECTED',
  // exchange state
  'TRADING_HALTED',
  'SYMBOL_DISABLED',
  'MARKET_DATA_STALE',
  // order validation (Binance-style lot rules)
  'INVALID_PRICE',
  'PRICE_TICK_SIZE',
  'INVALID_QUANTITY',
  'QUANTITY_STEP_SIZE',
  'QUANTITY_TOO_SMALL',
  'QUANTITY_TOO_LARGE',
  'NOTIONAL_TOO_SMALL',
  // advanced orders (phase 2)
  /** stop price on the wrong side of the market (would trigger immediately) */
  'INVALID_STOP_PRICE',
  /** OCO prices must satisfy SELL: price > last > stopPrice, BUY: price < last < stopPrice */
  'INVALID_OCO_PRICES',
  /** take-profit must be above and stop-loss below the entry */
  'INVALID_TPSL',
  'INVALID_TRAILING_DELTA',
  /** too many open orders / active alerts; details.limit */
  'LIMIT_EXCEEDED',
  // futures (phase F)
  /** leverage can only change with no open position and no open orders on the symbol */
  'LEVERAGE_LOCKED',
  /** leverage above the contract's maxLeverage; details.maxLeverage */
  'INVALID_LEVERAGE',
  /** reduce-only order with no opposite position, or larger than it */
  'REDUCE_ONLY_REJECTED',
  /** removing margin would leave less than the initial margin at the mark price; details.maxRemovable */
  'MARGIN_TOO_LOW',
  // bots (phase 2.6)
  /** grid params impossible: range, price outside, levels collapse, investment below details.minInvestment */
  'INVALID_GRID',
  // order execution
  'INSUFFICIENT_BALANCE',
  'INSUFFICIENT_LIQUIDITY',
  'DUPLICATE_CLIENT_ORDER_ID',
  'ORDER_NOT_CANCELABLE',
  // faucet
  'FAUCET_COOLDOWN',
  'FAUCET_CAP_REACHED',
  // uploads (0.14.0: trading journal images)
  /** body or file too large, or the user's storage quota is used up; details.reason: PayloadTooLargeReason, details.limitBytes */
  'PAYLOAD_TOO_LARGE',
  /** not one of the accepted file types, or the bytes are not really that type (checked by file signature) */
  'UNSUPPORTED_MEDIA_TYPE',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** details.reason of PAYLOAD_TOO_LARGE. */
export const PayloadTooLargeReason = z.enum([
  /** the JSON body is above the server's limit for this path (32 KB; journal image upload 1.5 MB) */
  'BODY_TOO_LARGE',
  /** one journal image above JOURNAL_LIMITS.attachmentBytes (1 MB) after base64 decoding */
  'ATTACHMENT_TOO_LARGE',
  /** the user's journal images would exceed JOURNAL_LIMITS.userQuotaBytes (50 MB) */
  'ATTACHMENT_QUOTA',
]);
export type PayloadTooLargeReason = z.infer<typeof PayloadTooLargeReason>;

export const ApiErrorBody = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
  EMAIL_NOT_VERIFIED: 403,
  ACCOUNT_LOCKED: 403,
  INVALID_INVITE: 400,
  TWO_FACTOR_REQUIRED: 403,
  INVALID_TWO_FACTOR_CODE: 400,
  BOT_ACCOUNT_PROTECTED: 403,
  TRADING_HALTED: 409,
  SYMBOL_DISABLED: 409,
  MARKET_DATA_STALE: 503,
  LEVERAGE_LOCKED: 409,
  INVALID_LEVERAGE: 400,
  REDUCE_ONLY_REJECTED: 400,
  MARGIN_TOO_LOW: 400,
  INVALID_GRID: 400,
  INVALID_PRICE: 400,
  PRICE_TICK_SIZE: 400,
  INVALID_QUANTITY: 400,
  QUANTITY_STEP_SIZE: 400,
  QUANTITY_TOO_SMALL: 400,
  QUANTITY_TOO_LARGE: 400,
  NOTIONAL_TOO_SMALL: 400,
  INVALID_STOP_PRICE: 400,
  INVALID_OCO_PRICES: 400,
  INVALID_TPSL: 400,
  INVALID_TRAILING_DELTA: 400,
  LIMIT_EXCEEDED: 409,
  INSUFFICIENT_BALANCE: 400,
  INSUFFICIENT_LIQUIDITY: 400,
  DUPLICATE_CLIENT_ORDER_ID: 409,
  ORDER_NOT_CANCELABLE: 409,
  FAUCET_COOLDOWN: 429,
  FAUCET_CAP_REACHED: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
};

/** Error thrown by the typed API client. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
