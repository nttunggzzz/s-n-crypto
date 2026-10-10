// `npm run typecheck`: type-checks EVERY workspace that has a tsconfig.json — core, contracts, server
// and (once merged) packages/ui and apps/*. A contract change that breaks the UI fails here.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, run, workspaces } from './workspaces.mjs';

let failed = 0;
// workspaces + the browser tests (e2e/ is not a workspace but imports nothing that is not typed)
for (const { dir } of [...workspaces(), { dir: 'e2e' }]) {
  if (!existsSync(path.join(ROOT, dir, 'tsconfig.json'))) continue;
  process.stdout.write(`▶ tsc ${dir}\n`);
  const code = await run('npx', ['tsc', '-p', dir, '--noEmit']);
  if (code !== 0) {
    failed++;
    process.stdout.write(`✗ ${dir}\n`);
  }
}
if (failed) {
  process.stdout.write(`\n${failed} workspace(s) failed the type check\n`);
  process.exit(1);
}
process.stdout.write('\n✓ all workspaces type-check\n');
