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
  // order execution
  'INSUFFICIENT_BALANCE',
  'INSUFFICIENT_LIQUIDITY',
  'DUPLICATE_CLIENT_ORDER_ID',
  'ORDER_NOT_CANCELABLE',
  // faucet
  'FAUCET_COOLDOWN',
  'FAUCET_CAP_REACHED',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

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
  TRADING_HALTED: 409,
  SYMBOL_DISABLED: 409,
  MARKET_DATA_STALE: 503,
  INVALID_PRICE: 400,
  PRICE_TICK_SIZE: 400,
  INVALID_QUANTITY: 400,
  QUANTITY_STEP_SIZE: 400,
  QUANTITY_TOO_SMALL: 400,
  QUANTITY_TOO_LARGE: 400,
  NOTIONAL_TOO_SMALL: 400,
  INSUFFICIENT_BALANCE: 400,
  INSUFFICIENT_LIQUIDITY: 400,
  DUPLICATE_CLIENT_ORDER_ID: 409,
  ORDER_NOT_CANCELABLE: 409,
  FAUCET_COOLDOWN: 429,
  FAUCET_CAP_REACHED: 409,
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
