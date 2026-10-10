/**
 * The stack the browser tests run against — isolated from `npm run dev`, so both can run at once:
 *   PostgreSQL :5436 (fresh every run, in .e2e/) · API :8090 (MARKET_FEED=sim, emails → .e2e/outbox.jsonl)
 *   web :5190 = the PRODUCTION build of apps/exchange (mocks off) + /api and /ws proxied to the API.
 * Started by `npm run e2e` (infra/e2e.mjs); prints "E2E STACK READY" when the web origin answers.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startEmbeddedPostgres } from './embeddedPg.ts';
import { createDatabase, runMigrations } from '../src/db/client.ts';

export const E2E = { dbPort: 5436, apiPort: 8090, webPort: 5190 };
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
    PORT: String(E2E.apiPort),
    DATABASE_URL: url,
    MARKET_FEED: 'sim',
    EMAIL_TRANSPORT: 'file',
    EMAIL_OUTBOX: path.join(state, 'outbox.jsonl'),
    APP_URL: `http://localhost:${E2E.webPort}`,
    RATE_LIMIT_SCALE: '50',
    LOG_LEVEL: 'warn',
  },
});

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json' };

const web = http.createServer((req, res) => {
  const reqUrl = req.url ?? '/';
  if (reqUrl.startsWith('/api/')) {
    const up = http.request({ host: '127.0.0.1', port: E2E.apiPort, path: reqUrl, method: req.method, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.on('error', () => (res.headersSent ? res.end() : res.writeHead(502).end()));
    req.pipe(up);
    return;
  }
  // static files; anything else is the single-page app
  let file = path.join(dist, decodeURIComponent(new URL(reqUrl, 'http://x').pathname));
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
});
// WebSocket: pass the upgrade through byte for byte (the Origin header stays the web origin)
web.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/ws')) return void socket.destroy();
  const up = net.connect(E2E.apiPort, '127.0.0.1', () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    up.write(lines.join('\r\n') + '\r\n\r\n');
    if (head.length) up.write(head);
    socket.pipe(up).pipe(socket);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
});
web.listen(E2E.webPort, () => console.log(`E2E STACK READY  web http://localhost:${E2E.webPort}  api :${E2E.apiPort}  db :${E2E.dbPort}`));

const stop = async () => {
  web.close();
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
  console.error(`[e2e] API exited (${code})`);
  void stop();
});
