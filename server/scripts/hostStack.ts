/**
 * The self-hosted server on the owner's machine (before renting Railway) — started by `npm run host -- start`
 * (infra/host.mjs) from the host worktree, never by hand:
 *   PostgreSQL (embedded, persistent: HOST_DATA_DIR/pgdata, port HOST_PG_PORT) + migrations, then the server
 *   (src/main.ts) with the environment infra/host.mjs prepared (NODE_ENV=production, real Binance prices).
 * Stops PostgreSQL cleanly when the server exits or when its stdin closes (Ctrl+C in infra/host.mjs).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startEmbeddedPostgres } from './embeddedPg.ts';
import { createDatabase, runMigrations } from '../src/db/client.ts';

const dataDir = process.env.HOST_DATA_DIR;
const pgPort = Number(process.env.HOST_PG_PORT ?? 5435);
if (!dataDir) throw new Error('HOST_DATA_DIR is not set — start the host with `npm run host -- start`');
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { pg, url } = await startEmbeddedPostgres({ dir: path.join(dataDir, 'pgdata'), port: pgPort, database: 'cex' });
const database = createDatabase(url, 1);
await runMigrations(database.db);
await database.close();
console.log(`[host] PostgreSQL ready on :${pgPort} (data: ${path.join(dataDir, 'pgdata')})`);

const api: ChildProcess = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
  cwd: serverDir,
  stdio: ['pipe', 'inherit', 'inherit'],
  env: { ...process.env, DATABASE_URL: url, SHUTDOWN_ON_STDIN_END: '1' },
});

let stopping = false;
const stop = async (code = 0) => {
  if (stopping) return;
  stopping = true;
  if (api.exitCode === null) {
    api.stdin?.end(); // clean shutdown: stop matching and feeds, close the database, release the instance lock
    for (let i = 0; i < 40 && api.exitCode === null; i++) await new Promise((r) => setTimeout(r, 250));
    if (api.exitCode === null) api.kill();
  }
  await pg.stop().catch(() => {});
  console.log('[host] PostgreSQL stopped');
  process.exit(code);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
process.stdin.on('end', () => void stop());
process.stdin.resume();
api.on('exit', (code) => {
  console.log(`[host] server exited (${code})`);
  void stop(stopping ? 0 : (code ?? 1));
});
