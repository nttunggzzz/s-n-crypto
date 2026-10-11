// Shared helpers for the infra scripts: discover the npm workspaces that exist right now
// (apps/* and packages/ui appear once the UI branch is merged).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Does something accept connections on 127.0.0.1:`port`? */
export const portBusy = (port) =>
  new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => (s.destroy(), resolve(false)));
  });

/** Port of the exchange the owner runs for real users on this machine (`npm run host`). */
export const LIVE_EXCHANGE_PORT = 8090;

/**
 * Heavy runs (install, tests, builds, browsers) on the machine that serves real users: when the live exchange
 * answers on :8090, this process drops to below-normal priority — every child inherits it (Windows: the
 * BELOW_NORMAL class; elsewhere: the nice value) — so the live server keeps its CPU. Only looks at the port.
 */
export async function yieldToLiveExchange(tag) {
  if (!(await portBusy(LIVE_EXCHANGE_PORT))) return;
  const below = os.constants.priority.PRIORITY_BELOW_NORMAL;
  try {
    if (os.getPriority() >= below) return; // already lowered (e.g. by ui-check, which starts this script)
    os.setPriority(below);
    process.stdout.write(`[${tag}] the live exchange answers on :${LIVE_EXCHANGE_PORT} — running at below-normal priority so it keeps its CPU\n`);
  } catch (err) {
    process.stdout.write(`[${tag}] the live exchange answers on :${LIVE_EXCHANGE_PORT}; could not lower this run's priority (${err.message})\n`);
  }
}

/** Every workspace directory with a package.json, in dependency-friendly order. */
export function workspaces() {
  const dirs = [];
  for (const group of ['packages', 'server', 'apps']) {
    const abs = path.join(ROOT, group);
    if (!existsSync(abs)) continue;
    if (existsSync(path.join(abs, 'package.json'))) dirs.push(group);
    else for (const d of readdirSync(abs, { withFileTypes: true })) if (d.isDirectory() && existsSync(path.join(abs, d.name, 'package.json'))) dirs.push(`${group}/${d.name}`);
  }
  // core and contracts first: everything else imports them
  const rank = (d) => (d === 'packages/core' ? 0 : d === 'packages/contracts' ? 1 : d.startsWith('packages/') ? 2 : d === 'server' ? 3 : 4);
  return dirs.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map((dir) => ({ dir, pkg: JSON.parse(readFileSync(path.join(ROOT, dir, 'package.json'), 'utf8')) }));
}

/**
 * Runs a command, streaming output (optionally prefixed); resolves with the exit code.
 * Only for the fixed commands of these scripts (no user input): the line goes through the shell
 * so `npm`/`npx` resolve on Windows too.
 */
export function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn([cmd, ...args].join(' '), { cwd: opts.cwd ?? ROOT, env: { ...process.env, ...opts.env }, shell: true, stdio: opts.prefix ? [opts.stdin ?? 'ignore', 'pipe', 'pipe'] : 'inherit' });
    if (opts.prefix) {
      const out = (stream) => (buf) => stream.write(buf.toString().replace(/^(?=.)/gm, opts.prefix));
      child.stdout.on('data', out(process.stdout));
      child.stderr.on('data', out(process.stderr));
    }
    child.on('exit', (code) => resolve(code ?? 1));
    opts.onSpawn?.(child);
  });
}
