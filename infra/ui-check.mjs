// `npm run ui-check [-- <branch>] [--e2e]`: is the UI branch ready to merge? Checks the branch's latest commit
// merged with main, in a throw-away worktree (the UI developer's own folder is never touched):
//   1. git worktree at <branch> (default ui/gd2-exchange) + merge main (package-lock conflict: keep the
//      branch's file, then npm install — the same fix the UI side applies)
//   2. npm run verify   3. with --e2e: npm run e2e (browser tests on the simulated feed)
// Prints a summary; exit 1 if a step fails. The worktree is removed afterwards (--keep to look inside).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, run } from './workspaces.mjs';

const args = process.argv.slice(2);
const branch = args.find((a) => !a.startsWith('--')) ?? 'ui/gd2-exchange';
const withE2e = args.includes('--e2e');
const keep = args.includes('--keep');
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const tip = git(ROOT, 'rev-parse', '--short', branch);
const main = git(ROOT, 'rev-parse', '--short', 'main');
const dir = mkdtempSync(path.join(os.tmpdir(), 'cex-ui-check-'));
rmSync(dir, { recursive: true, force: true }); // git worktree add wants a new path
const results = [];
const stepOk = async (title, fn) => {
  process.stdout.write(`\n━━ ${title}\n`);
  const ok = await fn();
  results.push(`${ok ? '✓' : '✗'} ${title}`);
  return ok;
};

process.stdout.write(`ui-check: ${branch} @ ${tip} + main @ ${main} in ${dir}\n`);
git(ROOT, 'worktree', 'add', '--detach', dir, branch);
try {
  const merged = await stepOk(`merge main into ${branch}`, async () => {
    try {
      git(dir, '-c', 'user.name=ui-check', '-c', 'user.email=ui-check@local', 'merge', '--no-edit', 'main');
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
    const verified = await stepOk('npm run verify (typecheck, lint, tests, build, endpoint report)', async () => (await run('npm', ['run', 'verify'], { cwd: dir })) === 0);
    if (verified && withE2e) await stepOk('npm run e2e (browser tests, simulated prices)', async () => (await run('npm', ['run', 'e2e'], { cwd: dir })) === 0);
  }
} finally {
  if (keep) process.stdout.write(`\n(kept: ${dir} — remove with: git worktree remove --force "${dir}")\n`);
  else {
    try {
      git(ROOT, 'worktree', 'remove', '--force', dir);
    } catch {
      rmSync(dir, { recursive: true, force: true });
      git(ROOT, 'worktree', 'prune');
    }
  }
}
process.stdout.write(`\nui-check ${branch} @ ${tip} + main @ ${main}\n${results.join('\n')}\n`);
process.exit(results.every((r) => r.startsWith('✓')) ? 0 : 1);
