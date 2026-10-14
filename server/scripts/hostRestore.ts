/**
 * `npm run host -- restore <file> --yes` — replaces the host database with a backup (infra/host.mjs stops nothing for you:
 * the server must be stopped; it also copies the database folder first, so a restore can be undone).
 * Needs the same code version as the backup (same number of migrations): restore, then `host update` for newer code.
 */
import path from 'node:path';
import { createDatabase } from '../src/db/client.ts';
import { readBackupLines } from '../src/ops/backupFile.ts';
import { restoreDatabase } from '../src/ops/logicalBackup.ts';

const file = process.argv[2];
const url = process.env.DATABASE_URL;
if (!file || !url) throw new Error('usage: npm run host -- restore <backup file> --yes');
const db = createDatabase(url, 2);
try {
  const r = await restoreDatabase(db.pool, readBackupLines(path.resolve(file), process.env.HOST_BACKUP_PASSPHRASE || undefined));
  console.log(`[restore] done: ${r.rows} rows in ${r.tables} tables from the backup made ${r.createdAt}. Start the exchange: npm run host -- start`);
} catch (err) {
  console.error(`[restore] FAILED, nothing was changed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await db.close();
}
