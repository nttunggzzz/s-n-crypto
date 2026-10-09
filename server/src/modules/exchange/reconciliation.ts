import { sql } from 'drizzle-orm';
import type { Db } from '../../db/client.ts';
import { reconciliationRuns } from '../../db/schema.ts';
import { logger } from '../../logger.ts';

export interface Mismatch {
  kind: 'LEDGER_VS_BALANCE' | 'LOCKED_VS_OPEN_ORDERS' | 'LOCKED_VS_FUTURES';
  account: 'SPOT' | 'FUTURES';
  userId: string;
  asset: string;
  expected: string;
  actual: string;
  field: 'available' | 'locked';
}

export interface ReconciliationResult {
  ok: boolean;
  checkedBalances: number;
  mismatches: Mismatch[];
  /** Stored run (when persisted). */
  run?: typeof reconciliationRuns.$inferSelect;
}

/**
 * Proves the books balance:
 *  1. for every (user, account, asset): sum of ledger deltas == balance row (available and locked)
 *  2. SPOT: balance.locked == sum of lockedAmount of that user's open spot orders
 *  3. FUTURES USDT: balance.locked == open futures orders' (marginLocked + feeLocked) + open positions' margin
 */
export async function reconcile(db: Db, persist = true): Promise<ReconciliationResult> {
  const startedAt = new Date();
  const ledgerRows = await db.execute<{
    user_id: string;
    account: 'SPOT' | 'FUTURES';
    asset: string;
    available: string | null;
    locked: string | null;
    sa: string | null;
    sl: string | null;
    bad_available: boolean;
    bad_locked: boolean;
  }>(sql`
    SELECT coalesce(b.user_id, l.user_id) AS user_id, coalesce(b.account, l.account) AS account, coalesce(b.asset, l.asset) AS asset,
           b.available, b.locked, l.sa, l.sl,
           b.available IS DISTINCT FROM coalesce(l.sa, 0) AS bad_available,
           b.locked IS DISTINCT FROM coalesce(l.sl, 0) AS bad_locked
    FROM balances b
    FULL OUTER JOIN (
      SELECT user_id, account, asset, sum(delta_available) AS sa, sum(delta_locked) AS sl
      FROM ledger_entries GROUP BY user_id, account, asset
    ) l ON l.user_id = b.user_id AND l.account = b.account AND l.asset = b.asset
    WHERE b.available IS DISTINCT FROM coalesce(l.sa, 0)
       OR b.locked IS DISTINCT FROM coalesce(l.sl, 0)
  `);
  const lockRows = await db.execute<{ user_id: string; asset: string; locked: string; open_locked: string }>(sql`
    SELECT b.user_id, b.asset, b.locked, coalesce(o.open_locked, 0) AS open_locked
    FROM balances b
    LEFT JOIN (
      SELECT user_id, locked_asset AS asset, sum(locked_amount) AS open_locked
      FROM orders WHERE status IN ('NEW', 'PARTIALLY_FILLED') AND locked_asset IS NOT NULL
      GROUP BY user_id, locked_asset
    ) o ON o.user_id = b.user_id AND o.asset = b.asset
    WHERE b.account = 'SPOT' AND b.locked <> coalesce(o.open_locked, 0)
  `);
  const futuresRows = await db.execute<{ user_id: string; asset: string; locked: string; expected: string }>(sql`
    SELECT b.user_id, b.asset, b.locked, coalesce(o.l, 0) + coalesce(p.m, 0) AS expected
    FROM balances b
    LEFT JOIN (
      SELECT user_id, sum(margin_locked + fee_locked) AS l
      FROM futures_orders WHERE status IN ('NEW', 'PARTIALLY_FILLED') GROUP BY user_id
    ) o ON o.user_id = b.user_id
    LEFT JOIN (
      SELECT user_id, sum(margin) AS m FROM futures_positions WHERE status = 'OPEN' GROUP BY user_id
    ) p ON p.user_id = b.user_id
    WHERE b.account = 'FUTURES' AND b.asset = 'USDT' AND b.locked <> coalesce(o.l, 0) + coalesce(p.m, 0)
  `);
  // locked futures money with no FUTURES balance row at all
  const orphanRows = await db.execute<{ user_id: string; expected: string }>(sql`
    SELECT x.user_id, sum(x.v) AS expected FROM (
      SELECT user_id, margin_locked + fee_locked AS v FROM futures_orders WHERE status IN ('NEW', 'PARTIALLY_FILLED')
      UNION ALL SELECT user_id, margin FROM futures_positions WHERE status = 'OPEN'
    ) x
    WHERE NOT EXISTS (SELECT 1 FROM balances b WHERE b.user_id = x.user_id AND b.account = 'FUTURES' AND b.asset = 'USDT')
    GROUP BY x.user_id HAVING sum(x.v) <> 0
  `);
  const [{ n }] = (await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM balances`)).rows as [{ n: number }];

  const mismatches: Mismatch[] = [];
  for (const r of ledgerRows.rows) {
    if (r.bad_available) mismatches.push({ kind: 'LEDGER_VS_BALANCE', account: r.account, userId: r.user_id, asset: r.asset, field: 'available', expected: r.sa ?? '0', actual: r.available ?? 'missing' });
    if (r.bad_locked) mismatches.push({ kind: 'LEDGER_VS_BALANCE', account: r.account, userId: r.user_id, asset: r.asset, field: 'locked', expected: r.sl ?? '0', actual: r.locked ?? 'missing' });
  }
  for (const r of lockRows.rows) {
    mismatches.push({ kind: 'LOCKED_VS_OPEN_ORDERS', account: 'SPOT', userId: r.user_id, asset: r.asset, field: 'locked', expected: String(r.open_locked), actual: r.locked });
  }
  for (const r of futuresRows.rows) {
    mismatches.push({ kind: 'LOCKED_VS_FUTURES', account: 'FUTURES', userId: r.user_id, asset: r.asset, field: 'locked', expected: String(r.expected), actual: r.locked });
  }
  for (const r of orphanRows.rows) {
    mismatches.push({ kind: 'LOCKED_VS_FUTURES', account: 'FUTURES', userId: r.user_id, asset: 'USDT', field: 'locked', expected: String(r.expected), actual: 'missing' });
  }
  const result: ReconciliationResult = { ok: mismatches.length === 0, checkedBalances: n, mismatches };
  if (persist) {
    const [run] = await db.insert(reconciliationRuns).values({ startedAt, finishedAt: new Date(), ok: result.ok, checkedBalances: n, mismatches }).returning();
    result.run = run;
  }
  if (!result.ok) logger.error({ mismatches }, 'ledger reconciliation FAILED');
  return result;
}
