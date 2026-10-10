// `npm run ui-coverage`: which API endpoints each app does not call yet (a feature the backend has but the UI
// does not show). Part of `npm run verify` as a report; `--strict` fails when a required endpoint is unused.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './workspaces.mjs';

/** Which endpoints (by `auth`) each app is expected to cover. */
const APPS = {
  'apps/exchange': ['public', 'user', 'verified'],
  'apps/admin': ['staff'],
};

/** Endpoints an app may leave unused on purpose — with the reason. */
const OPTIONAL = {
  'apps/exchange': {
    health: 'for monitoring, not users',
    marketStatus: 'the UI follows `market:status` over WebSocket',
    futuresMarketStatus: 'the UI follows `futures:status` / mark status over WebSocket',
    getOrder: 'order detail drawer is optional (rows already carry the order)',
    getOrderList: 'OCO detail is optional (rows already carry the list)',
    getGridBot: 'cards come from the list + `gridBot` events',
  },
};

const source = readFileSync(path.join(ROOT, 'packages/contracts/src/endpoints.ts'), 'utf8');
const endpoints = [...source.matchAll(/^\s{2}([a-zA-Z0-9]+): ep\(\{ method: '(\w+)', path: '([^']+)', auth: '(\w+)'/gm)].map((m) => ({
  name: m[1],
  method: m[2],
  path: m[3],
  auth: m[4],
}));

const walk = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) return f === 'node_modules' || f === 'dist' ? [] : walk(p);
    return /\.(tsx?|jsx?)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });

const strict = process.argv.includes('--strict');
let missingTotal = 0;
let checked = 0;
for (const [app, auths] of Object.entries(APPS)) {
  const dir = path.join(ROOT, app, 'src');
  if (!existsSync(dir)) continue;
  checked++;
  const code = walk(dir).map((f) => readFileSync(f, 'utf8')).join('\n');
  const optional = OPTIONAL[app] ?? {};
  const wanted = endpoints.filter((e) => auths.includes(e.auth));
  // the typed client is called as api.<name>(…) — any `.name(` counts
  const unused = wanted.filter((e) => !new RegExp(`\\.${e.name}\\(`).test(code));
  const missing = unused.filter((e) => !(e.name in optional));
  missingTotal += missing.length;
  process.stdout.write(`\n${app}: uses ${wanted.length - unused.length}/${wanted.length} endpoints`);
  process.stdout.write(missing.length ? ` — ${missing.length} not used yet:\n` : ' — nothing missing\n');
  for (const e of missing) process.stdout.write(`  · ${e.name.padEnd(28)} ${e.method.padEnd(6)} ${e.path}\n`);
  const skipped = unused.filter((e) => e.name in optional);
  if (skipped.length) process.stdout.write(`  (optional, unused: ${skipped.map((e) => e.name).join(', ')})\n`);
}
if (checked === 0) process.stdout.write('ui-coverage: no app in this checkout (apps/* arrive with the UI branch)\n');
if (strict && missingTotal > 0) process.exit(1);
