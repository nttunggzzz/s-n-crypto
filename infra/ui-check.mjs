// `npm run ui-check [-- <branch>] [--base <ref>] [--e2e] [--no-verify] [--keep]`: is the UI branch ready to merge?
// Checks the branch's latest commit merged with <ref> (default main), in a throw-away worktree (the UI
// developer's own folder is never touched):
//   1. git worktree at <branch> (default ui/gd2-exchange) + merge <ref> (package-lock conflict: keep the
//      branch's file, then npm install — the same fix the UI side applies)
//   2. npm run verify (skipped with --no-verify)   3. with --e2e: npm run e2e (browser tests on the simulated
//      feed, both stacks: default + host mode); a failed run's report is copied to .e2e/ui-check/ here
// --base <ref>: merge another branch/commit instead of main (e.g. a backend branch not merged yet).
// Prints a summary; exit 1 if a step fails. The worktree is removed afterwards (--keep to look inside).
// When the owner's live exchange answers on :8090, everything runs at below-normal priority.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, run, yieldToLiveExchange } from './workspaces.mjs';

const args = process.argv.slice(2);
const flags = new Set();
let branch;
let base = 'main';
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--base') base = args[++i];
  else if (a.startsWith('--base=')) base = a.slice('--base='.length);
  else if (a.startsWith('--')) flags.add(a);
  else branch ??= a;
}
branch ??= 'ui/gd2-exchange';
const unknown = [...flags].filter((f) => !['--e2e', '--no-verify', '--keep'].includes(f));
if (!base || unknown.length) {
  process.stderr.write(`usage: npm run ui-check -- [<branch>] [--base <ref>] [--e2e] [--no-verify] [--keep]${unknown.length ? ` (unknown: ${unknown.join(' ')})` : ''}\n`);
  process.exit(1);
}
const withE2e = flags.has('--e2e');
const withVerify = !flags.has('--no-verify');
const keep = flags.has('--keep');
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

await yieldToLiveExchange('ui-check');
const tip = git(ROOT, 'rev-parse', '--short', branch);
const baseTip = git(ROOT, 'rev-parse', '--short', base);
const dir = mkdtempSync(path.join(os.tmpdir(), 'cex-ui-check-'));
rmSync(dir, { recursive: true, force: true }); // git worktree add wants a new path
const results = [];
const stepOk = async (title, fn) => {
  process.stdout.write(`\n━━ ${title}\n`);
  const ok = await fn();
  results.push(`${ok ? '✓' : '✗'} ${title}`);
  return ok;
};

process.stdout.write(`ui-check: ${branch} @ ${tip} + ${base} @ ${baseTip} in ${dir}\n`);
git(ROOT, 'worktree', 'add', '--detach', dir, branch);
try {
  const merged = await stepOk(`merge ${base} into ${branch}`, async () => {
    try {
      git(dir, '-c', 'user.name=ui-check', '-c', 'user.email=ui-check@local', 'merge', '--no-edit', base);
    } catch {
      const conflicts = git(dir, 'diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
      if (conflicts.some((f) => f !== 'package-lock.json')) {
        process.stdout.write(`conflicts the UI side must resolve: ${conflicts.join(', ')}\n`);
        return false;
      }
      git(dir, 'checkout', '--ours', 'package-lock.json');
    }
    if ((await run('npm', ['install', '--no-audit', '--no-fund'], { cwd: dir })) !== 0) return false;
    git(dir, 'add', '-A');
    try {
      git(dir, '-c', 'user.name=ui-check', '-c', 'user.email=ui-check@local', 'commit', '--no-edit', '-q');
    } catch {
      // nothing left to commit (the merge was clean)
    }
    return true;
  });
  if (merged) {
    let verified = true;
    if (withVerify) verified = await stepOk('npm run verify (typecheck, lint, tests, build, endpoint report)', async () => (await run('npm', ['run', 'verify'], { cwd: dir })) === 0);
    else process.stdout.write('\n(--no-verify: npm run verify skipped)\n');
    if (verified && withE2e) {
      await stepOk('npm run e2e (browser tests, simulated prices)', async () => {
        if ((await run('npm', ['run', 'e2e'], { cwd: dir })) === 0) return true;
        // the throw-away worktree goes away: keep the Playwright report + error contexts of the failed run
        const out = path.join(ROOT, '.e2e/ui-check');
        rmSync(out, { recursive: true, force: true });
        for (const d of ['report', 'results']) if (existsSync(path.join(dir, '.e2e', d))) cpSync(path.join(dir, '.e2e', d), path.join(out, d), { recursive: true });
        process.stdout.write(`e2e report kept: npx playwright show-report ${path.relative(ROOT, path.join(out, 'report'))} (error contexts in ${path.relative(ROOT, path.join(out, 'results'))})\n`);
        return false;
      });
    }
  }
} finally {
  if (keep) process.stdout.write(`\n(kept: ${dir} — remove with: git worktree remove --force "${dir}")\n`);
  else {
    try {
      git(ROOT, 'worktree', 'remove', '--force', dir);
    } catch {
      // removed below, then pruned
    }
    // git leaves npm's workspace links behind (node_modules/@cex/*, junctions on Windows): rmSync removes the links, not their targets
    rmSync(dir, { recursive: true, force: true });
    git(ROOT, 'worktree', 'prune');
  }
}
process.stdout.write(`\nui-check ${branch} @ ${tip} + ${base} @ ${baseTip}\n${results.join('\n')}\n`);
process.exit(results.every((r) => r.startsWith('✓')) ? 0 : 1);
