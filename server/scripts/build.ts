/**
 * `npm run build -w @cex/server`: bundles src/main.ts → dist/main.js (+ main.js.map) so the self-hosted server
 * runs on plain Node — `node --enable-source-maps dist/main.js`, no tsx module-loading hooks (O1).
 *   - the workspace packages (@cex/contracts, @cex/core: TypeScript sources) go INTO the bundle;
 *   - every npm dependency of the server and of those packages stays external (loaded from node_modules);
 *   - paths next to the code (drizzle/) are found from either location (src/db/client.ts → findMigrationsDir).
 * `npm run host -- update` runs it; scripts/hostStack.ts uses dist/main.js when it exists.
 */
import { build } from 'esbuild';
import { readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(serverDir, 'dist', 'main.js');

interface Manifest {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}
const runtimeDeps = (dir: string) => {
  const m = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as Manifest;
  return [m.dependencies, m.peerDependencies, m.optionalDependencies].flatMap((d) => Object.keys(d ?? {}));
};
const isWorkspace = (name: string) => name.startsWith('@cex/');
// the workspace packages are linked into node_modules by npm (node_modules/@cex/<name> → packages/<name>)
const workspaceDirs = runtimeDeps(serverDir)
  .filter(isWorkspace)
  .map((name) => path.join(serverDir, '..', 'node_modules', ...name.split('/')));
const external = [...new Set([serverDir, ...workspaceDirs].flatMap(runtimeDeps))].filter((name) => !isWorkspace(name)).sort();

rmSync(path.dirname(outfile), { recursive: true, force: true });
const result = await build({
  entryPoints: [path.join(serverDir, 'src', 'main.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: 'linked',
  keepNames: true, // class / function names stay as written (error names, logs)
  external,
  metafile: true,
  logLevel: 'warning',
});

// An npm package imported without being declared in package.json would be copied into the bundle silently.
const inlined = Object.keys(result.metafile.inputs).filter((file) => file.includes('node_modules/'));
if (inlined.length) {
  console.error(`[build] npm code ended up inside the bundle — declare its package in package.json dependencies:\n  ${inlined.join('\n  ')}`);
  process.exit(1);
}
console.log(`[build] ${path.relative(serverDir, outfile)} (${Math.round(statSync(outfile).size / 1024)} KB) · external: ${external.join(', ')}`);
