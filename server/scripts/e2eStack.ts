/**
 * A stack the browser tests run against — isolated from `npm run dev`, so both can run at once:
 *   PostgreSQL (fresh every run) · server = API + /ws + the PRODUCTION builds of apps/exchange (at /) and
 *   apps/admin (at /admin/, when it exists) — mocks off, one origin, exactly as deployed. MARKET_FEED=sim.
 * `npm run e2e` (infra/e2e.mjs) starts two of them; the environment picks which one this process is:
 *   E2E_MODE=default  db :5436, web :5190, state .e2e/        open sign-up, email verification required
 *                     (the NODE_ENV=development defaults; emails → .e2e/outbox.jsonl, the tests read the links)
 *   E2E_MODE=host     db :5437, web :5191, state .e2e/host/   what the owner's live server (`npm run host`) tells
 *                     the apps: invite-only sign-up, no email verification — GET /api/v1/config answers
 *                     registration INVITE_ONLY, emailVerificationRequired false. Still NODE_ENV=development +
 *                     the sim feed (production refuses it): only the app-facing configuration matters here.
 *   E2E_DB_PORT, E2E_WEB_PORT, E2E_STATE_DIR (relative to the repo root) override the mode's defaults.
 * `<state>/stack.json` tells the tests the database URL and the app URL (fixtures run server scripts on that
 * database as an operator would: `admin:set-role`, `admin:invite`). The server logs "server listening" when up.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startEmbeddedPostgres } from './embeddedPg.ts';
import { createDatabase, runMigrations } from '../src/db/client.ts';

/**
 * The two stacks. Everything the apps can see of the server configuration is set explicitly (not inherited
 * from the caller's shell), so each stack always behaves like the server it stands for.
 */
const E2E_MODES = {
  default: {
    dbPort: 5436,
    webPort: 5190,
    stateDir: '.e2e',
    env: { REGISTRATION: 'open', REQUIRE_EMAIL_VERIFICATION: 'true' },
  },
  host: {
    dbPort: 5437,
    webPort: 5191,
    stateDir: '.e2e/host',
    // infra/host.mjs writes EMAIL_TRANSPORT=log; the transport is invisible to the apps (not in /api/v1/config),
    // and the file transport keeps the emails readable here (the log transport prints below LOG_LEVEL=warn).
    env: { REGISTRATION: 'invite', REQUIRE_EMAIL_VERIFICATION: 'false' },
  },
} as const;
type E2eMode = keyof typeof E2E_MODES;

const mode = (process.env.E2E_MODE ?? 'default') as E2eMode;
if (!(mode in E2E_MODES)) throw new Error(`E2E_MODE=${mode} — expected one of ${Object.keys(E2E_MODES).join(', ')}`);
const preset = E2E_MODES[mode];
const dbPort = Number(process.env.E2E_DB_PORT ?? preset.dbPort);
const webPort = Number(process.env.E2E_WEB_PORT ?? preset.webPort);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const state = path.resolve(root, process.env.E2E_STATE_DIR ?? preset.stateDir);
const dist = path.join(root, 'apps/exchange/dist');
const adminDist = path.join(root, 'apps/admin/dist');
if (!existsSync(path.join(dist, 'index.html'))) throw new Error('apps/exchange/dist is missing — build the app first (npm run e2e does it)');

// only this stack's own files: the default state folder (.e2e) also holds the other stack's folder and the
// Playwright report/results (Playwright clears those itself)
mkdirSync(state, { recursive: true });
for (const f of ['pgdata', 'outbox.jsonl', 'stack.json']) rmSync(path.join(state, f), { recursive: true, force: true });

const appUrl = `http://localhost:${webPort}`;
const { pg, url } = await startEmbeddedPostgres({ dir: path.join(state, 'pgdata'), port: dbPort, database: 'cex' });
const database = createDatabase(url, 1);
await runMigrations(database.db);
await database.close();
writeFileSync(path.join(state, 'stack.json'), JSON.stringify({ mode, databaseUrl: url, appUrl }));

const api: ChildProcess = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
  cwd: path.join(root, 'server'),
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'development', // the server checks every response against the contract
    PORT: String(webPort),
    DATABASE_URL: url,
    WEB_DIST: dist,
    ADMIN_WEB_DIST: existsSync(path.join(adminDist, 'index.html')) ? adminDist : '',
    MARKET_FEED: 'sim',
    EMAIL_TRANSPORT: 'file',
    EMAIL_OUTBOX: path.join(state, 'outbox.jsonl'),
    APP_URL: appUrl,
    TURNSTILE_SECRET: '',
    TURNSTILE_SITE_KEY: '',
    ...preset.env,
    RATE_LIMIT_SCALE: '50',
    LOG_LEVEL: 'warn',
  },
});
console.log(`E2E STACK STARTING (${mode})  ${appUrl}  db :${dbPort}  state ${path.relative(root, state)}`);

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
