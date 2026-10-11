/**
 * The self-hosted server on the owner's machine (before renting Railway) — started by `npm run host -- start`
 * (infra/host.mjs) from the host worktree, never by hand:
 *   PostgreSQL (embedded, persistent: HOST_DATA_DIR/pgdata, port HOST_PG_PORT) + migrations, then the server
 *   with the environment infra/host.mjs prepared (NODE_ENV=production, real Binance prices):
 *   dist/main.js (the bundle `npm run build -w @cex/server` makes; plain Node, no tsx hooks) when it exists,
 *   src/main.ts through tsx otherwise.
 * Supervisor (O1): when the server dies on its own, PostgreSQL keeps running, the operator gets a Telegram alert
 * and the server is started again (5 s → 30 s → 2 min, src/ops/restartPolicy.ts). A fatal Node error leaves a
 * diagnostic report in HOST_DATA_DIR/logs.
 * Stops everything cleanly, without restarting, on stdin close (Ctrl+C / `npm run host -- stop` in infra/host.mjs),
 * SIGINT or SIGTERM.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startEmbeddedPostgres } from './embeddedPg.ts';
import { createDatabase, runMigrations } from '../src/db/client.ts';
import { loadConfig } from '../src/config.ts';
import { createAlerter } from '../src/ops/alerts.ts';
import { describeExit, formatUptime, nextRestart } from '../src/ops/restartPolicy.ts';

const dataDir = process.env.HOST_DATA_DIR;
const pgPort = Number(process.env.HOST_PG_PORT ?? 5435);
if (!dataDir) throw new Error('HOST_DATA_DIR is not set — start the host with `npm run host -- start`');
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const alerter = createAlerter(loadConfig()); // same settings as the server (bad settings stop here, before PostgreSQL)

const { pg, url } = await startEmbeddedPostgres({ dir: path.join(dataDir, 'pgdata'), port: pgPort, database: 'cex' });
const database = createDatabase(url, 1);
await runMigrations(database.db);
await database.close();
console.log(`[host] PostgreSQL ready on :${pgPort} (data: ${path.join(dataDir, 'pgdata')})`);

const reportDir = path.join(dataDir, 'logs');
mkdirSync(reportDir, { recursive: true });
const diagnostics = ['--report-on-fatalerror', `--report-directory=${reportDir}`];
const bundle = path.join(serverDir, 'dist', 'main.js');
const serverArgs = existsSync(bundle)
  ? ['--enable-source-maps', ...diagnostics, 'dist/main.js']
  : [...diagnostics, '--import', 'tsx', 'src/main.ts'];
console.log(
  existsSync(bundle)
    ? `[host] server: dist/main.js (bundle built ${statSync(bundle).mtime.toISOString()})`
    : '[host] server: src/main.ts through tsx (no dist/main.js — `npm run build -w @cex/server` makes it)',
);

let api: ChildProcess | null = null;
let startedAt = 0;
let streak = 0; // restarts in a row without a healthy run (restartPolicy)
let restarts = 0; // since this supervisor started
let restartTimer: NodeJS.Timeout | null = null;
let stopping = false;

const startServer = () => {
  startedAt = Date.now();
  const child = spawn(process.execPath, serverArgs, {
    cwd: serverDir,
    stdio: ['pipe', 'inherit', 'inherit'],
    env: { ...process.env, DATABASE_URL: url, SHUTDOWN_ON_STDIN_END: '1' },
  });
  child.stdin?.on('error', () => {}); // the pipe breaks when the server dies; nothing to do here
  child.on('error', (err) => console.error(`[host] server process error: ${err.message}`));
  child.on('exit', (code, signal) => onServerExit(code, signal));
  api = child;
};

const onServerExit = (code: number | null, signal: NodeJS.Signals | null) => {
  api = null;
  const exit = describeExit(code, signal);
  if (stopping) {
    console.log(`[host] server exited (${exit})`);
    return; // stop() is waiting for it
  }
  const uptime = Date.now() - startedAt;
  const next = nextRestart(streak, uptime);
  streak = next.streak;
  restarts++;
  const secs = Math.round(next.delayMs / 1000);
  console.log(`[host] server exited (${exit}) — restarting in ${secs}s (#${restarts}) · at ${new Date().toISOString()} after ${formatUptime(uptime)} up`);
  // never awaited: a slow or failing Telegram must not delay the restart (send() itself never throws);
  // a crash loop alerts on its first exit, then at most once per cooldown
  void alerter.send(
    'host-restart',
    'critical',
    `Server dừng bất thường (mã thoát ${exit}) sau ${formatUptime(uptime)} chạy — tự khởi động lại sau ${secs}s (lần ${restarts}` +
      `${streak > 1 ? `, ${streak} lần liên tiếp không chạy được 10 phút` : ''}). PostgreSQL vẫn chạy.`,
    streak === 1,
  );
  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (stopping) return;
    console.log(`[host] starting the server again (#${restarts})`);
    startServer();
  }, next.delayMs);
};

const stop = async () => {
  if (stopping) return;
  stopping = true;
  if (restartTimer) clearTimeout(restartTimer);
  const child = api;
  if (child && child.exitCode === null && child.signalCode === null) {
    child.stdin?.end(); // clean shutdown: stop matching and feeds, close the database, release the instance lock
    for (let i = 0; i < 40 && api; i++) await new Promise((r) => setTimeout(r, 250));
    if (api) child.kill();
  }
  await pg.stop().catch(() => {});
  console.log('[host] PostgreSQL stopped');
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
process.stdin.on('end', () => void stop());
process.stdin.resume();
startServer();
