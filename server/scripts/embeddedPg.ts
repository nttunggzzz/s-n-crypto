import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Real PostgreSQL binaries from npm — local development and tests only.
 * Staging/production use the managed PostgreSQL on Railway (DATABASE_URL).
 */
export async function startEmbeddedPostgres(opts: { dir: string; port: number; database: string; recreate?: boolean }) {
  const pg = new EmbeddedPostgres({
    databaseDir: opts.dir,
    port: opts.port,
    user: 'postgres',
    password: 'postgres',
    persistent: true,
    onLog: () => {},
  });
  if (!fs.existsSync(path.join(opts.dir, 'PG_VERSION'))) await pg.initialise();
  await pg.start();
  if (opts.recreate) {
    try {
      await pg.dropDatabase(opts.database);
    } catch {
      // did not exist
    }
  }
  try {
    await pg.createDatabase(opts.database);
  } catch {
    // already exists
  }
  return { pg, url: `postgres://postgres:postgres@localhost:${opts.port}/${opts.database}` };
}
