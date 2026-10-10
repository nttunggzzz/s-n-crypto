// `npm run e2e`: browser tests of the real web app against the real server (synthetic prices).
//   1. build apps/exchange and apps/admin (production builds, mocks off)
//   2. start the isolated stack (server/scripts/e2eStack.ts: db :5436, server + web app on :5190)
//   3. run Playwright (e2e/) — extra args go to Playwright, e.g. `npm run e2e -- --headed`
// Locally the tests drive the installed Microsoft Edge (no browser download); CI installs Chromium.
import { existsSync, readdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { ROOT, run } from './workspaces.mjs';

const PORTS = { db: 5436, web: 5190 };

if (!existsSync(path.join(ROOT, 'apps/exchange/package.json'))) {
  process.stdout.write('[e2e] apps/exchange does not exist yet (the UI branch is not merged) — nothing to test\n');
  process.exit(0);
}

const busy = (port) =>
  new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => (s.destroy(), resolve(false)));
  });
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
const PGDATA = path.join(ROOT, '.e2e/pgdata');
if ((await busy(PORTS.db)) && existsSync(PGDATA) && pgCtl()) {
  process.stdout.write('[e2e] stopping a database left over by a previous run\n');
  await run(`"${pgCtl()}"`, ['stop', '-D', `"${PGDATA}"`, '-m', 'fast']);
}
for (const [name, port] of Object.entries(PORTS)) {
  if (await busy(port)) {
    process.stderr.write(`[e2e] port ${port} (${name}) is already in use — is another e2e run still going?\n`);
    process.exit(1);
  }
}

process.stdout.write('━━ build apps/exchange\n');
if ((await run('npm', ['run', 'build', '-w', '@cex/exchange-web'])) !== 0) process.exit(1);
if (existsSync(path.join(ROOT, 'apps/admin/package.json'))) {
  process.stdout.write('━━ build apps/admin\n');
  if ((await run('npm', ['run', 'build', '-w', '@cex/admin-web'])) !== 0) process.exit(1);
} else process.stdout.write('[e2e] apps/admin does not exist yet — the admin tests fail until it does (PROMPT-08)\n');

let stack;
/** Asks the stack to stop (it shuts PostgreSQL down cleanly when its stdin closes), then makes sure. */
async function stopStack() {
  if (!stack) return;
  stack.stdin?.end();
  for (let i = 0; i < 30 && (await busy(PORTS.web) || (await busy(PORTS.db))); i++) await sleep(500);
  if (process.platform === 'win32') await run('taskkill', ['/pid', String(stack.pid), '/T', '/F']);
  else stack.kill('SIGTERM');
  if ((await busy(PORTS.db)) && pgCtl()) await run(`"${pgCtl()}"`, ['stop', '-D', `"${PGDATA}"`, '-m', 'fast']);
}
process.on('SIGINT', () => void stopStack().then(() => process.exit(130)));

process.stdout.write('━━ start the e2e stack\n');
void run('npx', ['tsx', 'server/scripts/e2eStack.ts'], { prefix: '[stack] ', stdin: 'pipe', env: { E2E_STOP_ON_STDIN_END: '1' }, onSpawn: (c) => (stack = c) });

const t0 = Date.now();
for (;;) {
  try {
    const res = await fetch(`http://localhost:${PORTS.web}/api/v1/market/status`);
    if (res.ok && (await res.json()).symbols?.every((s) => s.status === 'LIVE')) break;
  } catch {
    // not up yet
  }
  if (Date.now() - t0 > 120_000) {
    process.stderr.write('[e2e] the stack did not become ready in 2 minutes\n');
    await stopStack();
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 1000));
}

process.stdout.write('━━ playwright\n');
const code = await run('npx', ['playwright', 'test', '-c', 'e2e/playwright.config.ts', ...process.argv.slice(2)]);
await stopStack();
process.stdout.write(code === 0 ? '✓ e2e passed\n' : `✗ e2e failed (exit ${code}) — report: npx playwright show-report .e2e/report\n`);
process.exit(code);
