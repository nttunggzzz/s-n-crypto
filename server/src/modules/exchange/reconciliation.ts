import { sql } from 'drizzle-orm';
import type { Db } from '../../db/client.ts';
import { reconciliationRuns } from '../../db/schema.ts';
import { logger } from '../../logger.ts';

export interface Mismatch {
  kind: 'LEDGER_VS_BALANCE' | 'LOCKED_VS_OPEN_ORDERS';
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
}

/**
 * Proves the books balance:
 *  1. for every (user, asset): sum of ledger deltas == balance row (available and locked)
 *  2. for every (user, asset): balance.locked == sum of lockedAmount of that user's open orders
 */
export async function reconcile(db: Db, persist = true): Promise<ReconciliationResult> {
  const startedAt = new Date();
  const ledgerRows = await db.execute<{
    user_id: string;
    asset: string;
    available: string | null;
    locked: string | null;
    sa: string | null;
    sl: string | null;
    bad_available: boolean;
    bad_locked: boolean;
  }>(sql`
    SELECT coalesce(b.user_id, l.user_id) AS user_id, coalesce(b.asset, l.asset) AS asset,
           b.available, b.locked, l.sa, l.sl,
           b.available IS DISTINCT FROM coalesce(l.sa, 0) AS bad_available,
           b.locked IS DISTINCT FROM coalesce(l.sl, 0) AS bad_locked
    FROM balances b
    FULL OUTER JOIN (
      SELECT user_id, asset, sum(delta_available) AS sa, sum(delta_locked) AS sl
      FROM ledger_entries GROUP BY user_id, asset
    ) l ON l.user_id = b.user_id AND l.asset = b.asset
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
    WHERE b.locked <> coalesce(o.open_locked, 0)
  `);
  const [{ n }] = (await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM balances`)).rows as [{ n: number }];

  const mismatches: Mismatch[] = [];
  for (const r of ledgerRows.rows) {
    if (r.bad_available) mismatches.push({ kind: 'LEDGER_VS_BALANCE', userId: r.user_id, asset: r.asset, field: 'available', expected: r.sa ?? '0', actual: r.available ?? 'missing' });
    if (r.bad_locked) mismatches.push({ kind: 'LEDGER_VS_BALANCE', userId: r.user_id, asset: r.asset, field: 'locked', expected: r.sl ?? '0', actual: r.locked ?? 'missing' });
  }
  for (const r of lockRows.rows) {
    mismatches.push({ kind: 'LOCKED_VS_OPEN_ORDERS', userId: r.user_id, asset: r.asset, field: 'locked', expected: String(r.open_locked), actual: r.locked });
  }
  const result: ReconciliationResult = { ok: mismatches.length === 0, checkedBalances: n, mismatches };
  if (persist) {
    await db.insert(reconciliationRuns).values({ startedAt, finishedAt: new Date(), ok: result.ok, checkedBalances: n, mismatches });
  }
  if (!result.ok) logger.error({ mismatches }, 'ledger reconciliation FAILED');
  return result;
}
