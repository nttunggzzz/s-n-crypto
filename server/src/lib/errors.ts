import { ERROR_HTTP_STATUS, type ErrorCode } from '@cex/contracts';

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message ?? code);
    this.name = 'AppError';
    this.status = ERROR_HTTP_STATUS[code];
  }
}

/** Postgres unique_violation. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = findPgError(err);
  return !!e && e.code === '23505' && (!constraint || e.constraint === constraint);
}

/** Postgres check_violation (e.g. balance would go negative). */
export function isCheckViolation(err: unknown): boolean {
  return findPgError(err)?.code === '23514';
}

function findPgError(err: unknown): { code?: string; constraint?: string } | null {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur && typeof cur === 'object'; i++) {
    const c = cur as { code?: unknown; constraint?: string; cause?: unknown };
    if (typeof c.code === 'string' && /^[0-9A-Z]{5}$/.test(c.code)) return c as { code: string; constraint?: string };
    cur = c.cause;
  }
  return null;
}
