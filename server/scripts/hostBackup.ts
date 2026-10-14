/**
 * `npm run host -- backup [--no-verify]` — a backup of the live exchange database, taken while it runs.
 *   1. dump (logicalBackup.ts) → host-data/backups/logical/cex-<time>.cexbak.gz  (.enc when HOST_BACKUP_PASSPHRASE is set)
 *   2. DRILL (unless --no-verify): restore that very file into a scratch database `cex_verify` on the same PostgreSQL,
 *      reconcile (ledger = balances, locked = open orders), drop it. A backup that does not restore is reported as failed.
 *   3. copy to HOST_BACKUP_COPY_DIR when set (another drive, a synced cloud folder — encrypt first, see passphrase)
 *   4. keep the newest HOST_BACKUP_KEEP (default 30) files in each folder
 * A failure alerts the operator on Telegram (when set up) and exits 1, so a scheduled run shows up red.
 * DATABASE_URL = the host database (set by infra/host.mjs). Read-only for the exchange database.
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { createDatabase, runMigrations } from '../src/db/client.ts';
import { loadConfig } from '../src/config.ts';
import { createAlerter } from '../src/ops/alerts.ts';
import { backupFileName, openBackupWriter, readBackupLines } from '../src/ops/backupFile.ts';
import { dumpDatabase, restoreDatabase } from '../src/ops/logicalBackup.ts';
import { reconcile } from '../src/modules/exchange/reconciliation.ts';

const dataDir = process.env.HOST_DATA_DIR;
const url = process.env.DATABASE_URL;
if (!dataDir || !url) throw new Error('HOST_DATA_DIR and DATABASE_URL are required — run `npm run host -- backup`');
const passphrase = process.env.HOST_BACKUP_PASSPHRASE || undefined;
const copyDir = process.env.HOST_BACKUP_COPY_DIR || undefined;
const keep = Math.max(1, Number(process.env.HOST_BACKUP_KEEP ?? 30));
const verify = !process.argv.includes('--no-verify');
const alerter = createAlerter(loadConfig());
const say = (s: string) => console.log(`[backup] ${s}`);
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(2)} MB`;

const prune = (dir: string) => {
  const files = readdirSync(dir).filter((f) => f.startsWith('cex-') && f.includes('.cexbak.gz')).sort();
  for (const old of files.slice(0, Math.max(0, files.length - keep))) rmSync(path.join(dir, old), { force: true });
};

async function drill(file: string): Promise<string> {
  const target = new URL(url!);
  const scratch = 'cex_verify';
  target.pathname = `/${scratch}`;
  const adminUrl = new URL(url!);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${scratch} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${scratch} WITH ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`);
    const db = createDatabase(target.toString(), 4);
    try {
      await runMigrations(db.db);
      const r = await restoreDatabase(db.pool, readBackupLines(file, passphrase));
      const books = await reconcile(db.db, false);
      if (books.mismatches.length > 0) throw new Error(`the restored copy does not balance: ${books.mismatches.length} mismatches (first: ${JSON.stringify(books.mismatches[0])})`);
      return `restores into a fresh database (${r.rows} rows in ${r.tables} tables), ${books.checkedBalances} balances reconcile`;
    } finally {
      await db.close();
    }
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS ${scratch} WITH (FORCE)`).catch(() => {});
    await admin.end();
  }
}

const dir = path.join(dataDir, 'backups', 'logical');
mkdirSync(dir, { recursive: true });
const file = path.join(dir, backupFileName(new Date(), Boolean(passphrase)));
const source = createDatabase(url, 2);
try {
  const writer = await openBackupWriter(file, passphrase);
  const summary = await dumpDatabase(source.pool, (line) => writer.write(line));
  await writer.finish();
  say(`${path.basename(file)}: ${summary.rows} rows in ${Object.keys(summary.tables).length} tables, ${mb(statSync(file).size)}${passphrase ? ', encrypted' : ', NOT encrypted (set HOST_BACKUP_PASSPHRASE before copying it off this machine)'}`);
  let drillNote = 'restore drill skipped (--no-verify)';
  if (verify) {
    drillNote = await drill(file);
    say(`restore drill passed: ${drillNote}`);
  }
  prune(dir);
  if (copyDir) {
    mkdirSync(copyDir, { recursive: true });
    copyFileSync(file, path.join(copyDir, path.basename(file)));
    prune(copyDir);
    say(`copied to ${copyDir}`);
  } else {
    say('no off-machine copy: set HOST_BACKUP_COPY_DIR (another drive or a synced folder) in host-data/.env.host');
  }
  say('done');
} catch (err) {
  rmSync(file, { force: true }); // never leave a half-written file that looks like a backup
  // some errors (AggregateError from a refused connection) have an empty message: show what is known
  const message = (err instanceof Error ? err.message || err.name || String(err.cause ?? '') : String(err)) || 'unknown error';
  if (err instanceof Error && err.stack) console.error(err.stack);
  console.error(`[backup] FAILED: ${message}`);
  await alerter.send('host-backup', 'critical', `Sao lưu database của sàn THẤT BẠI: ${message}`, true);
  process.exitCode = 1;
} finally {
  await source.close();
}
