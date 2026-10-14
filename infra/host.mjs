// `npm run host -- <command>`: run the exchange for real users on THIS machine (before renting Railway).
// The running copy lives in its own git worktree, so coding in this folder (or in the UI folder) never
// changes what users see until you update it on purpose:
//   host/        code being served (main + the UI branch merged, built, tested) — git-ignored
//   host-data/   .env.host (settings + secrets, never in git), pgdata/ (database), backups/, logs/ — git-ignored
//
//   npm run host -- update [ui-branch|--no-ui] [--skip-verify] [--skip-e2e]   refresh the served code (server must be stopped);
//                                           verify + browser tests (incl. the host-mode project: invite sign-up, no email check)
//   npm run host -- start [--no-tunnel]     database + server on :8090 + public HTTPS link (Cloudflare quick tunnel)
//   npm run host -- invite "<who>" [uses] [days]                 invite code + link (server running or not)
//   npm run host -- set-role <email> <user|support|admin|owner>  e.g. make yourself owner
//   npm run host -- backup [--no-verify]    backup of the database while the server RUNS (+ a drill: restore it into a scratch
//                                           database and check the books). Files: host-data/backups/logical/. Set in .env.host:
//                                           HOST_BACKUP_PASSPHRASE (encrypt), HOST_BACKUP_COPY_DIR (a second drive / synced folder), HOST_BACKUP_KEEP
//   npm run host -- schedule-backup [HH:MM] daily backup with Windows Task Scheduler (default 03:30);  unschedule-backup removes it
//   npm run host -- restore <file> --yes    replace the database with a backup (server stopped; the database folder is copied first)
//   npm run host -- stop                    clean stop from another window (same as Ctrl+C in the host window)
//   npm run host -- status
//
// The quick tunnel gives a NEW https://….trycloudflare.com address at every start (no domain needed); the
// address is printed, saved to host-data/current-url.txt and sent to Telegram when it is set up.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { ROOT, run } from './workspaces.mjs';

const WT = path.join(ROOT, 'host');
const DATA = path.resolve(process.env.HOST_DATA_DIR ?? path.join(ROOT, 'host-data'));
const ENV_FILE = path.join(DATA, '.env.host');
const PORT = 8090;
const PG_PORT = 5435;
const KEEP_BACKUPS = 7;

const [cmd, ...args] = process.argv.slice(2);
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const say = (s) => process.stdout.write(`${s}\n`);
const fail = (s) => {
  process.stderr.write(`[host] ${s}\n`);
  process.exit(1);
};
const busy = (port) =>
  new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => (s.destroy(), resolve(false)));
  });

const ENV_TEMPLATE = (key) => `# Settings of the exchange running on this machine (npm run host). NEVER commit or share this file.
# Created by \`npm run host -- start\`; edit it, then restart.

# Encrypts 2FA secrets in the database. LOSING IT = everyone's 2FA stops working. Keep a copy in a password manager.
DATA_ENCRYPTION_KEY=${key}

# Only people with an invite code can sign up (npm run host -- invite "<who>").
REGISTRATION=invite
# No mail domain yet: emails are written to the server log (host-data/logs), not sent.
# Users are not asked to verify their email. With Resend: EMAIL_TRANSPORT=resend + RESEND_API_KEY + EMAIL_FROM.
EMAIL_TRANSPORT=log
REQUIRE_EMAIL_VERIFICATION=false

# Database backups (npm run host -- backup / schedule-backup). The passphrase encrypts every file (they hold emails and
# password hashes): write it down in a password manager — lost = the backups cannot be opened.
# COPY_DIR = another drive or a synced cloud folder, so a dead disk does not take the backups with it.
HOST_BACKUP_PASSPHRASE=
HOST_BACKUP_COPY_DIR=
HOST_BACKUP_KEEP=30

# Telegram alerts (start-up with the new address, prices down, ledger mismatch, crash): set BOTH or neither.
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
ALERT_ENV_NAME=may-ca-nhan

# Cloudflare Turnstile (captcha on sign-up): set BOTH or neither. The widget's Hostnames must include the
# address users open (trycloudflare.com for the quick tunnel).
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET=

# News for the analysis system (admin only). Comments on purpose: an empty value would stop the server from starting.
# NEWS_INGEST_ENABLED = fetch news (RSS, GDELT) into the database. Default false; only "true" turns it on.
#   RSS news cannot be fetched back later, so decide after reading the N2 report.
# NEWS_INGEST_ENABLED=false
# NEWS_CALENDAR_ENABLED = load the scheduled macro events (FOMC, CPI, NFP, PCE) at start-up. Default true.
# NEWS_CALENDAR_ENABLED=true
`;

function readHostEnv() {
  if (!existsSync(ENV_FILE)) {
    mkdirSync(DATA, { recursive: true });
    writeFileSync(ENV_FILE, ENV_TEMPLATE(randomBytes(32).toString('base64')), { mode: 0o600 });
    say(`[host] created ${ENV_FILE} (a new DATA_ENCRYPTION_KEY was generated — back it up).`);
  }
  return parseEnv(readFileSync(ENV_FILE, 'utf8'));
}

function currentUrl() {
  const f = path.join(DATA, 'current-url.txt');
  return existsSync(f) ? readFileSync(f, 'utf8').trim() : `http://localhost:${PORT}`;
}

/** Runs a server script in the host worktree against the host database (invite, set-role). */
function serverScript(script, scriptArgs) {
  if (!existsSync(path.join(WT, 'server'))) fail('nothing installed yet — run: npm run host -- update');
  const env = {
    ...process.env,
    ...readHostEnv(),
    NODE_ENV: 'production',
    DATABASE_URL: `postgres://postgres:postgres@localhost:${PG_PORT}/cex`,
    APP_URL: currentUrl(),
    LOG_LEVEL: 'warn',
    HOST_DATA_DIR: DATA,
  };
  execFileSync(process.execPath, ['--import', 'tsx', script, ...scriptArgs], { cwd: path.join(WT, 'server'), env, stdio: 'inherit' });
}

/** The database must be running for invite / set-role: start it alone if the server is not up. */
async function withDatabase(fn) {
  if (await busy(PG_PORT)) return fn();
  say('[host] the server is not running — starting the database just for this command');
  const stack = spawn(process.execPath, ['--import', 'tsx', 'scripts/hostDb.ts'], {
    cwd: path.join(WT, 'server'),
    stdio: ['pipe', 'inherit', 'inherit'],
    env: { ...process.env, HOST_DATA_DIR: DATA, HOST_PG_PORT: String(PG_PORT) },
  });
  for (let i = 0; i < 60 && !(await busy(PG_PORT)); i++) await new Promise((r) => setTimeout(r, 500));
  try {
    return fn();
  } finally {
    stack.stdin.end();
    for (let i = 0; i < 30 && (await busy(PG_PORT)); i++) await new Promise((r) => setTimeout(r, 500));
  }
}
/** Copy of the database folder while PostgreSQL is stopped (consistent); keeps the newest KEEP_BACKUPS. */
function coldBackup() {
  const pgdata = path.join(DATA, 'pgdata');
  if (!existsSync(path.join(pgdata, 'PG_VERSION'))) return;
  const dir = path.join(DATA, 'backups');
  mkdirSync(dir, { recursive: true });
  const name = `pgdata-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  cpSync(pgdata, path.join(dir, name), { recursive: true, filter: (src) => !src.endsWith('postmaster.pid') });
  const all = readdirSync(dir).filter((d) => d.startsWith('pgdata-')).sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) rmSync(path.join(dir, old), { recursive: true, force: true });
  say(`[host] database backed up → backups/${name} (keeping the newest ${KEEP_BACKUPS})`);
}

function findCloudflared() {
  const candidates = [process.env.CLOUDFLARED, 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe', 'C:\\Program Files\\cloudflared\\cloudflared.exe'].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  try {
    return execFileSync(process.platform === 'win32' ? 'where' : 'which', ['cloudflared'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim() || null;
  } catch {
    return null;
  }
}

/** Starts a Cloudflare quick tunnel to the server; resolves with its https address. */
function startTunnel(exe) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => reject(new Error('the tunnel gave no address in 60 s (internet down?)')), 60_000);
    const onData = (buf) => {
      const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(buf.toString());
      if (m) {
        clearTimeout(timer);
        resolve({ child, url: m[0] });
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => reject(new Error(`cloudflared exited (${code})`)));
  });
}

async function update() {
  if (await busy(PORT)) fail(`the server is running on :${PORT} — stop it (Ctrl+C in its window) before updating`);
  const noUi = args.includes('--no-ui');
  const skipVerify = args.includes('--skip-verify');
  // browser tests need the web app; --skip-verify skips them too (a quick, unverified update)
  const skipE2e = skipVerify || args.includes('--skip-e2e');
  const branch = args.find((a) => !a.startsWith('--')) ?? 'ui/gd2-exchange';
  const main = git(ROOT, 'rev-parse', '--short', 'main');
  rmSync(path.join(DATA, 'version.json'), { force: true }); // `start` refuses until this update has passed
  if (!existsSync(WT)) {
    say(`[host] creating the host worktree ${WT}`);
    git(ROOT, 'worktree', 'add', '--detach', WT, 'main');
  } else {
    git(WT, 'reset', '--hard', '-q');
    git(WT, 'clean', '-fd', '-q');
    git(WT, 'checkout', '--detach', '-q', 'main');
  }
  let ui = null;
  if (!noUi) {
    try {
      ui = git(ROOT, 'rev-parse', '--short', branch);
    } catch {
      say(`[host] branch ${branch} not found — serving main only`);
    }
  }
  if (ui) {
    say(`[host] merging ${branch} @ ${ui} into main @ ${main}`);
    const id = ['-c', 'user.name=host', '-c', 'user.email=host@local'];
    try {
      git(WT, ...id, 'merge', '--no-edit', '-q', branch);
    } catch {
      const conflicts = git(WT, 'diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
      if (conflicts.some((f) => f !== 'package-lock.json')) {
        git(WT, 'merge', '--abort');
        fail(`merge conflicts the UI side must resolve first: ${conflicts.join(', ')}`);
      }
      git(WT, 'checkout', '--ours', 'package-lock.json');
      git(WT, 'add', '-A');
      git(WT, ...id, 'commit', '--no-edit', '-q');
    }
  }
  if ((await run('npm', ['install', '--no-audit', '--no-fund'], { cwd: WT })) !== 0) fail('npm install failed');
  if (skipVerify) {
    for (const app of ['exchange', 'admin']) {
      if (existsSync(path.join(WT, 'apps', app, 'package.json')) && (await run('npm', ['run', 'build', '-w', `apps/${app}`], { cwd: WT })) !== 0) fail(`build of apps/${app} failed`);
    }
  } else if ((await run('npm', ['run', 'verify'], { cwd: WT })) !== 0) {
    fail('verify failed — not ready to serve (start refuses); fix the problem and run update again');
  }
  // the server runs as a plain-Node bundle (server/dist/main.js), not through tsx's module-loading hooks (O1)
  if ((await run('npm', ['run', 'build', '-w', '@cex/server'], { cwd: WT })) !== 0) fail('build of the server failed');
  // the browser tests, including the `host-mode` project that runs the app with this server's settings (invite-only
  // sign-up, no email check): verify alone passed while nobody could sign up on the live exchange (C1)
  const e2e = !existsSync(path.join(WT, 'apps/exchange/package.json')) ? 'no web app' : skipE2e ? 'skipped' : 'passed';
  if (e2e === 'passed' && (await run('npm', ['run', 'e2e'], { cwd: WT })) !== 0) {
    fail(`browser tests failed — not ready to serve (start refuses). Report: ${path.join(WT, '.e2e', 'report')} (npx playwright show-report .e2e/report in ${WT}).
  To serve this code anyway (e.g. a fix that cannot wait for the failing part): npm run host -- update --skip-e2e`);
  }
  mkdirSync(DATA, { recursive: true });
  const version = { main, ui: ui ? `${branch}@${ui}` : null, verified: !skipVerify, e2e, at: new Date().toISOString() };
  writeFileSync(path.join(DATA, 'version.json'), JSON.stringify(version, null, 2));
  say(`[host] ready: main @ ${main}${ui ? ` + ${branch} @ ${ui}` : ''}${skipVerify ? ' (NOT verified)' : ' (verified)'}, browser tests: ${e2e} — start with: npm run host -- start`);
}

async function start() {
  if (!existsSync(path.join(WT, 'server'))) fail('nothing installed yet — run: npm run host -- update');
  if (!existsSync(path.join(DATA, 'version.json'))) fail('the last update did not finish (or never ran) — run: npm run host -- update');
  if (await busy(PORT)) fail(`port ${PORT} is already in use — is the host already running?`);
  if (await busy(PG_PORT)) fail(`port ${PG_PORT} (host database) is already in use`);
  const env = readHostEnv();
  if (!env.DATA_ENCRYPTION_KEY) fail(`DATA_ENCRYPTION_KEY is missing in ${ENV_FILE}`);
  coldBackup();

  let tunnel = null;
  let appUrl = `http://localhost:${PORT}`;
  if (!args.includes('--no-tunnel')) {
    const exe = findCloudflared();
    if (!exe) fail('cloudflared is not installed. Install it once:  winget install --id Cloudflare.cloudflared   (or use --no-tunnel for this machine only)');
    say('[host] opening the public link (Cloudflare quick tunnel)…');
    tunnel = await startTunnel(exe).catch((e) => fail(e.message));
    appUrl = tunnel.url;
  }
  writeFileSync(path.join(DATA, 'current-url.txt'), appUrl);

  const logDir = path.join(DATA, 'logs');
  mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `server-${new Date().toISOString().slice(0, 10)}.log`);
  const log = createWriteStream(logFile, { flags: 'a' });
  const has = (dir) => (existsSync(path.join(WT, dir, 'index.html')) ? path.join(WT, dir) : '');
  const stack = spawn(process.execPath, ['--import', 'tsx', 'scripts/hostStack.ts'], {
    cwd: path.join(WT, 'server'),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ...env,
      NODE_ENV: 'production',
      MARKET_FEED: 'binance',
      PORT: String(PORT),
      APP_URL: appUrl,
      WEB_DIST: has('apps/exchange/dist'),
      ADMIN_WEB_DIST: has('apps/admin/dist'),
      HOST_DATA_DIR: DATA,
      HOST_PG_PORT: String(PG_PORT),
    },
  });
  for (const s of [stack.stdout, stack.stderr]) s.on('data', (b) => (process.stdout.write(b), log.write(b)));

  const stop = () => {
    say('\n[host] stopping…');
    stack.stdin.end();
    tunnel?.child.kill();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  // `npm run host -- stop` from another window asks for a clean stop through this file
  const stopFile = path.join(DATA, 'stop-request');
  rmSync(stopFile, { force: true });
  const stopWatch = setInterval(() => {
    if (existsSync(stopFile)) {
      rmSync(stopFile, { force: true });
      clearInterval(stopWatch);
      stop();
    }
  }, 1000);
  stack.on('exit', (code) => {
    clearInterval(stopWatch);
    tunnel?.child.kill();
    log.end();
    say(`[host] stopped (${code})`);
    process.exit(code ?? 0);
  });

  for (let i = 0; i < 240 && !(await busy(PORT)); i++) await new Promise((r) => setTimeout(r, 500));
  const version = existsSync(path.join(DATA, 'version.json')) ? JSON.parse(readFileSync(path.join(DATA, 'version.json'), 'utf8')) : {};
  say(
    [
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `  Sàn:      ${appUrl}`,
      `  Quản trị: ${appUrl}/admin/${has('apps/admin/dist') ? '' : '   (chưa có — app admin chưa được build)'}`,
      `  Code:     main @ ${version.main ?? '?'}${version.ui ? ` + ${version.ui}` : ' (chưa có giao diện)'}`,
      `  Log:      ${logFile}`,
      '  Mời người dùng:  npm run host -- invite "<tên>"      Dừng: Ctrl+C (giữ cửa sổ này mở khi chạy)',
      tunnel ? '  Địa chỉ đổi mỗi lần khởi động; Telegram nhận địa chỉ mới nếu đã cài.' : '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
    ].join('\n'),
  );
}

async function status() {
  const version = existsSync(path.join(DATA, 'version.json')) ? readFileSync(path.join(DATA, 'version.json'), 'utf8') : '(not installed)';
  say(`host worktree: ${WT}${existsSync(WT) ? '' : ' (missing)'}\ndata: ${DATA}\nversion: ${version}`);
  say(`server :${PORT} ${(await busy(PORT)) ? 'RUNNING' : 'stopped'} · database :${PG_PORT} ${(await busy(PG_PORT)) ? 'running' : 'stopped'}`);
  say(`address: ${currentUrl()}`);
}

switch (cmd) {
  case 'update':
    await update();
    break;
  case 'start':
    await start();
    break;
  case 'invite':
    await withDatabase(() => serverScript('scripts/createInvite.ts', args));
    break;
  case 'set-role':
    await withDatabase(() => serverScript('scripts/setRole.ts', args));
    break;
  case 'backup':
    try {
      await withDatabase(() => serverScript('scripts/hostBackup.ts', args));
    } catch {
      process.exit(1); // hostBackup.ts already printed why and alerted
    }
    break;
  case 'restore': {
    const file = args.find((a) => !a.startsWith('--'));
    if (!file || !existsSync(file)) fail('usage: npm run host -- restore <backup file> --yes   (list: host-data/backups/logical/)');
    if (await busy(PORT)) fail('stop the exchange first (npm run host -- stop): a restore replaces the whole database');
    if (!args.includes('--yes')) fail(`this REPLACES the whole database with ${file}. Every account, balance and order made after that backup is lost.
[host] The database folder is copied to host-data/backups first. Run again with --yes to do it.`);
    if (await busy(PG_PORT)) fail(`database port ${PG_PORT} is in use — stop the exchange first`);
    coldBackup();
    try {
      await withDatabase(() => serverScript('scripts/hostRestore.ts', [path.resolve(file)]));
    } catch {
      process.exit(1);
    }
    break;
  }
  case 'schedule-backup': {
    if (process.platform !== 'win32') fail('schedule-backup uses Windows Task Scheduler — on other systems add a cron entry for: node infra/host.mjs backup');
    const at = args[0] ?? '03:30';
    if (!/^([01]d|2[0-3]):[0-5]d$/.test(at)) fail('time as HH:MM, e.g. 03:30');
    const task = `"${process.execPath}" "${path.join(ROOT, 'infra', 'host.mjs')}" backup`;
    execFileSync('schtasks', ['/Create', '/F', '/SC', 'DAILY', '/ST', at, '/TN', 'CEX host backup', '/TR', task], { stdio: 'inherit' });
    say(`[host] a backup runs every day at ${at} (Task Scheduler "CEX host backup"; the PC must be on and you signed in). Check it: schtasks /Query /TN "CEX host backup"`);
    break;
  }
  case 'unschedule-backup':
    execFileSync('schtasks', ['/Delete', '/F', '/TN', 'CEX host backup'], { stdio: 'inherit' });
    break;
  case 'stop':
    if (!(await busy(PORT))) fail('the host is not running');
    writeFileSync(path.join(DATA, 'stop-request'), new Date().toISOString());
    for (let i = 0; i < 60 && ((await busy(PORT)) || (await busy(PG_PORT))); i++) await new Promise((r) => setTimeout(r, 500));
    say((await busy(PORT)) || (await busy(PG_PORT)) ? '[host] still stopping — check its window' : '[host] stopped');
    break;
  case 'status':
    await status();
    break;
  default:
    say('usage: npm run host -- update [ui-branch|--no-ui] [--skip-verify] [--skip-e2e] | start [--no-tunnel] | invite "<who>" [uses] [days] | set-role <email> <role> | backup [--no-verify] | restore <file> --yes | schedule-backup [HH:MM] | unschedule-backup | stop | status');
    process.exit(cmd ? 1 : 0);
}
