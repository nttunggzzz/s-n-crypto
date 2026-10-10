// `npm test` (and the tests step of `npm run verify`): vitest, but the run only passes when EVERY collected
// test passed. Vitest can exit 0 after a worker process crashed mid-file (seen on Windows: exit 0xC0000409,
// "Tests 183 passed (187)") — the 4 tests that never ran must fail the gate, not slip through.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, run } from './workspaces.mjs';

const out = path.join(os.tmpdir(), `cex-vitest-${process.pid}.json`);
rmSync(out, { force: true });
const code = await run('npx', ['vitest', 'run', '--reporter=default', '--reporter=json', `--outputFile.json="${out}"`, ...process.argv.slice(2)], { cwd: ROOT });

const fail = (why) => {
  process.stdout.write(`\n✗ tests: ${why}\n`);
  process.exit(code || 1);
};
if (!existsSync(out)) fail(`vitest wrote no result (exit ${code})`);
const r = JSON.parse(readFileSync(out, 'utf8'));
rmSync(out, { force: true });
const accounted = r.numPassedTests + r.numPendingTests + (r.numTodoTests ?? 0);
if (code !== 0) fail(`vitest exited with ${code}`);
if (!r.success) fail('vitest reported a failure (an unhandled error or a crashed worker)');
if (r.numFailedTests > 0 || r.numFailedTestSuites > 0) fail(`${r.numFailedTests} test(s) / ${r.numFailedTestSuites} file(s) failed`);
if (accounted !== r.numTotalTests) fail(`${r.numTotalTests - accounted} of ${r.numTotalTests} tests did not run (crashed worker?)`);
process.stdout.write(`\n✓ ${r.numPassedTests}/${r.numTotalTests} tests passed\n`);
