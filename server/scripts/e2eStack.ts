/**
 * The stack the browser tests run against — isolated from `npm run dev`, so both can run at once:
 *   PostgreSQL :5436 (fresh every run, in .e2e/) · server :5190 = API + /ws + the PRODUCTION build of
 *   apps/exchange (WEB_DIST, mocks off) on one origin, exactly as deployed. MARKET_FEED=sim, emails → .e2e/outbox.jsonl.
 * Started by `npm run e2e` (infra/e2e.mjs); the server logs "server listening" when it is up.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startEmbeddedPostgres } from './embeddedPg.ts';
import { createDatabase, runMigrations } from '../src/db/client.ts';

export const E2E = { dbPort: 5436, webPort: 5190 };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const state = path.join(root, '.e2e');
const dist = path.join(root, 'apps/exchange/dist');
if (!existsSync(path.join(dist, 'index.html'))) throw new Error('apps/exchange/dist is missing — build the app first (npm run e2e does it)');

rmSync(state, { recursive: true, force: true });
mkdirSync(state, { recursive: true });

const { pg, url } = await startEmbeddedPostgres({ dir: path.join(state, 'pgdata'), port: E2E.dbPort, database: 'cex' });
const database = createDatabase(url, 1);
await runMigrations(database.db);
await database.close();

const api: ChildProcess = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
  cwd: path.join(root, 'server'),
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'development', // the server checks every response against the contract
    PORT: String(E2E.webPort),
    DATABASE_URL: url,
    WEB_DIST: dist,
    MARKET_FEED: 'sim',
    EMAIL_TRANSPORT: 'file',
    EMAIL_OUTBOX: path.join(state, 'outbox.jsonl'),
    APP_URL: `http://localhost:${E2E.webPort}`,
    RATE_LIMIT_SCALE: '50',
    LOG_LEVEL: 'warn',
  },
});
console.log(`E2E STACK STARTING  http://localhost:${E2E.webPort}  db :${E2E.dbPort}`);

const stop = async () => {
  api.kill();
  await pg.stop().catch(() => {});
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
// infra/e2e.mjs closes our stdin when the tests are done (signals are unreliable through npx on Windows)
if (process.env.E2E_STOP_ON_STDIN_END === '1') {
  process.stdin.on('end', () => void stop());
  process.stdin.resume();
}
api.on('exit', (code) => {
  console.error(`[e2e] server exited (${code})`);
  void stop();
});
