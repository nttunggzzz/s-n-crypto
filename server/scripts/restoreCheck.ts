/**
 * Restore drill: run against a database restored from a backup (DATABASE_URL) to prove the backup is usable.
 *   npm run restore:check -w @cex/server      (the nightly backup workflow runs it on every dump)
 * Fails (exit 1) when migrations are missing or the books do not balance (reconciliation: ledger = balances,
 * locked = open orders / futures margin). Read-only: the reconciliation result is not stored.
 */
import { readdirSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { createDatabase, MIGRATIONS_DIR } from '../src/db/client.ts';
import { reconcile } from '../src/modules/exchange/reconciliation.ts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL (the restored copy) is required');
const database = createDatabase(url, 2);
const problems: string[] = [];
try {
  const expected = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).length;
  const applied = await database.db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM drizzle.__drizzle_migrations`);
  const n = Number(applied.rows[0]?.n ?? 0);
  if (n < expected) problems.push(`only ${n} of ${expected} migrations applied`);

  const counts: Record<string, number> = {};
  for (const table of ['users', 'balances', 'ledger_entries', 'orders', 'trades', 'audit_logs', 'futures_positions', 'grid_bots', 'dca_plans']) {
    const r = await database.db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM ${sql.identifier(table)}`);
    counts[table] = Number(r.rows[0]?.n ?? 0);
  }
  console.log('rows:', JSON.stringify(counts));

  const result = await reconcile(database.db, false);
  console.log(`reconciliation: ${result.checkedBalances} balances checked, ${result.mismatches.length} mismatches`);
  for (const m of result.mismatches.slice(0, 20)) problems.push(`${m.kind} ${m.account} user ${m.userId} ${m.asset} ${m.field}: expected ${m.expected}, got ${m.actual}`);
} finally {
  await database.close();
}
if (problems.length) {
  console.error('✗ restore check failed:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('✓ restore check passed: the backup restores into a consistent exchange');
