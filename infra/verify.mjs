// `npm run verify`: the gate before anything is merged into main (both sides run it).
//   1. type-check every workspace (incl. UI)  2. all tests (real PostgreSQL)  3. production build of every app
import { ROOT, run, workspaces } from './workspaces.mjs';

const step = async (title, cmd, args) => {
  process.stdout.write(`\n━━ ${title}\n`);
  const code = await run(cmd, args, { cwd: ROOT });
  if (code !== 0) {
    process.stdout.write(`\n✗ verify failed at: ${title}\n`);
    process.exit(code);
  }
};

await step('typecheck (all workspaces)', 'node', ['infra/typecheck-all.mjs']);
await step('tests', 'npx', ['vitest', 'run']);
for (const { dir, pkg } of workspaces()) {
  if (dir.startsWith('apps/') && pkg.scripts?.build) await step(`build ${pkg.name}`, 'npm', ['run', 'build', '-w', pkg.name]);
}
process.stdout.write('\n✓ verify passed — safe to merge\n');
