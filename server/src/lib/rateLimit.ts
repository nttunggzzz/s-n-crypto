import { AppError } from './errors.ts';

/**
 * Fixed-window counter in memory. Fine for the single server instance we run;
 * move to Postgres/Redis before scaling out.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Counts one hit; throws RATE_LIMITED when over the limit. */
  consume(key: string): void {
    const t = this.now();
    let h = this.hits.get(key);
    if (!h || h.resetAt <= t) {
      h = { count: 0, resetAt: t + this.windowMs };
      this.hits.set(key, h);
    }
    h.count++;
    if (h.count > this.limit) {
      throw new AppError('RATE_LIMITED', 'Too many requests', { retryAfterSeconds: Math.ceil((h.resetAt - t) / 1000) });
    }
    if (this.hits.size > 50_000) this.sweep(t);
  }

  /** Checks without counting. */
  check(key: string): void {
    const t = this.now();
    const h = this.hits.get(key);
    if (h && h.resetAt > t && h.count >= this.limit) {
      throw new AppError('RATE_LIMITED', 'Too many attempts', { retryAfterSeconds: Math.ceil((h.resetAt - t) / 1000) });
    }
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private sweep(t: number): void {
    for (const [k, h] of this.hits) if (h.resetAt <= t) this.hits.delete(k);
  }
}
