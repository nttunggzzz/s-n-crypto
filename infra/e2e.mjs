// `npm run e2e`: browser tests of the real web app against the real server (synthetic prices).
//   1. build apps/exchange and apps/admin (production builds, mocks off)
//   2. start two isolated stacks (server/scripts/e2eStack.ts), each = PostgreSQL + server serving API, /ws and the apps:
//        default  db :5436, web :5190 (.e2e/)       open sign-up + email verification (development defaults)
//        host     db :5437, web :5191 (.e2e/host/)  the owner's live server config: invite-only, no email verification
//   3. run Playwright (e2e/) — extra args go to Playwright, e.g. `npm run e2e -- --headed`, `-- --project=host-mode`
// Locally the tests drive the installed Microsoft Edge (no browser download); CI installs Chromium.
// When the owner's live exchange answers on :8090, the whole run goes below-normal priority (yieldToLiveExchange).
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { ROOT, portBusy as busy, run, yieldToLiveExchange } from './workspaces.mjs';

/** Same ports and folders as E2E_MODES in server/scripts/e2eStack.ts; `config` = what GET /api/v1/config must say. */
const STACKS = [
  { mode: 'default', db: 5436, web: 5190, pgdata: path.join(ROOT, '.e2e/pgdata'), config: { registration: 'OPEN', emailVerificationRequired: true } },
  { mode: 'host', db: 5437, web: 5191, pgdata: path.join(ROOT, '.e2e/host/pgdata'), config: { registration: 'INVITE_ONLY', emailVerificationRequired: false } },
];

if (!existsSync(path.join(ROOT, 'apps/exchange/package.json'))) {
  process.stdout.write('[e2e] apps/exchange does not exist yet (the UI branch is not merged) — nothing to test\n');
  process.exit(0);
}
await yieldToLiveExchange('e2e');
// The browser tests are timing-sensitive: with `npm run dev` running (Binance prices + Vite servers) 6 tests failed that pass
// when run alone (review lan-3 K-10). Not an error — the owner may need both — but say it, so a red run is read correctly.
if ((await busy(8080)) || (await busy(5173))) {
  process.stdout.write('[e2e] WARNING: `npm run dev` seems to be running (:8080 / :5173). A red test may be only slowness: stop it, or re-run the failed file alone before calling it a bug.\n');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** pg_ctl of the embedded PostgreSQL package (stops a database left over by a crashed run). */
function pgCtl() {
  const base = path.join(ROOT, 'node_modules/@embedded-postgres');
  for (const d of existsSync(base) ? readdirSync(base) : []) {
    for (const exe of ['pg_ctl.exe', 'pg_ctl']) {
      const p = path.join(base, d, 'native/bin', exe);
      if (existsSync(p)) return p;
    }
  }
  return null;
}
const pgStop = (s) => run(`"${pgCtl()}"`, ['stop', '-D', `"${s.pgdata}"`, '-m', 'fast']);

for (const s of STACKS) {
  if ((await busy(s.db)) && existsSync(s.pgdata) && pgCtl()) {
    process.stdout.write(`[e2e] stopping a database left over by a previous run (${s.mode}, :${s.db})\n`);
    await pgStop(s);
  }
}
for (const s of STACKS) {
  for (const [name, port] of [['db', s.db], ['web', s.web]]) {
    if (await busy(port)) {
      process.stderr.write(`[e2e] port ${port} (${s.mode} ${name}) is already in use — is another e2e run still going?\n`);
      process.exit(1);
    }
  }
}

process.stdout.write('━━ build apps/exchange\n');
if ((await run('npm', ['run', 'build', '-w', '@cex/exchange-web'])) !== 0) process.exit(1);
if (existsSync(path.join(ROOT, 'apps/admin/package.json'))) {
  process.stdout.write('━━ build apps/admin\n');
  if ((await run('npm', ['run', 'build', '-w', '@cex/admin-web'])) !== 0) process.exit(1);
} else process.stdout.write('[e2e] apps/admin does not exist yet — the admin tests fail until it does (PROMPT-08)\n');

/** Asks every stack to stop (each shuts PostgreSQL down cleanly when its stdin closes), then makes sure. */
async function stopStacks() {
  const started = STACKS.filter((s) => s.child);
  for (const s of started) s.child.stdin?.end();
  for (const s of started) {
    for (let i = 0; i < 30 && ((await busy(s.web)) || (await busy(s.db))); i++) await sleep(500);
    if (process.platform === 'win32') await run('taskkill', ['/pid', String(s.child.pid), '/T', '/F']);
    else s.child.kill('SIGTERM');
    if ((await busy(s.db)) && pgCtl()) await pgStop(s);
    s.child = undefined;
  }
}
process.on('SIGINT', () => void stopStacks().then(() => process.exit(130)));

process.stdout.write('━━ start the e2e stacks\n');
for (const s of STACKS) {
  void run('npx', ['tsx', 'server/scripts/e2eStack.ts'], {
    prefix: s.mode === 'default' ? '[stack] ' : `[stack:${s.mode}] `,
    stdin: 'pipe',
    env: { E2E_STOP_ON_STDIN_END: '1', E2E_MODE: s.mode },
    onSpawn: (c) => (s.child = c),
  });
}

/** Up = every pair LIVE; then the stack must tell the apps the configuration it stands for. */
async function ready(s) {
  try {
    const res = await fetch(`http://localhost:${s.web}/api/v1/market/status`);
    if (!res.ok || !(await res.json()).symbols?.every((x) => x.status === 'LIVE')) return false;
  } catch {
    return false; // not up yet
  }
  let config;
  try {
    config = await (await fetch(`http://localhost:${s.web}/api/v1/config`)).json();
  } catch {
    return false; // went away between the two calls (or not JSON yet): ask again
  }
  for (const [key, want] of Object.entries(s.config)) {
    if (config[key] !== want) throw new Error(`the ${s.mode} stack says ${key}=${JSON.stringify(config[key])} in /api/v1/config, expected ${JSON.stringify(want)}`);
  }
  return true;
}
const t0 = Date.now();
const pending = new Set(STACKS);
try {
  while (pending.size) {
    for (const s of [...pending]) if (await ready(s)) pending.delete(s);
    if (!pending.size) break;
    if (Date.now() - t0 > 120_000) throw new Error(`stack(s) not ready in 2 minutes: ${[...pending].map((s) => s.mode).join(', ')}`);
    await sleep(1000);
  }
} catch (err) {
  process.stderr.write(`[e2e] ${err.message}\n`);
  await stopStacks();
  process.exit(1);
}

process.stdout.write('━━ playwright\n');
const code = await run('npx', ['playwright', 'test', '-c', 'e2e/playwright.config.ts', ...process.argv.slice(2)]);
await stopStacks();
process.stdout.write(code === 0 ? '✓ e2e passed\n' : `✗ e2e failed (exit ${code}) — report: npx playwright show-report .e2e/report\n`);
process.exit(code);
