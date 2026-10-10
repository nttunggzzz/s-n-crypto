// `npm run dev`: the whole exchange on this machine — PostgreSQL (:5433), API + realtime (:8080)
// and every web app in apps/* against the REAL server (mocks off). Ctrl+C stops everything.
//   npm run dev                 → db + server + all apps
//   npm run dev -- --no-apps    → db + server only
import net from 'node:net';
import { run, workspaces } from './workspaces.mjs';

const children = [];
const track = (c) => children.push(c);
const stop = () => {
  for (const c of children) {
    try {
      process.platform === 'win32' ? run('taskkill', ['/pid', String(c.pid), '/T', '/F']) : c.kill('SIGINT');
    } catch {
      // already gone
    }
  }
  setTimeout(() => process.exit(0), 1500);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const waitForPort = (port, timeoutMs = 60_000) =>
  new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tryOnce = () => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => (s.destroy(), resolve()));
      s.once('error', () => {
        s.destroy();
        if (Date.now() - t0 > timeoutMs) reject(new Error(`port ${port} did not open`));
        else setTimeout(tryOnce, 500);
      });
    };
    tryOnce();
  });

void run('npm', ['run', 'db:start'], { prefix: '[db]     ', onSpawn: track });
await waitForPort(5433);
void run('npm', ['run', 'dev:server'], { prefix: '[server] ', onSpawn: track });
await waitForPort(8080);

if (!process.argv.includes('--no-apps')) {
  const apps = workspaces().filter(({ dir, pkg }) => dir.startsWith('apps/') && pkg.scripts?.dev);
  if (apps.length === 0) process.stdout.write('[dev]    no web app in apps/ yet (the UI branch is not merged)\n');
  for (const { dir, pkg } of apps) {
    void run('npm', ['run', 'dev', '-w', pkg.name], { prefix: `[${dir.split('/')[1]}] `.padEnd(9), env: { VITE_USE_MOCKS: 'false' }, onSpawn: track });
  }
}
process.stdout.write('[dev]    API http://localhost:8080 · WebSocket ws://localhost:8080/ws · Ctrl+C to stop\n');
