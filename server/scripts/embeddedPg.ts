import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Real PostgreSQL binaries from npm — local development and tests only.
 * Staging/production use the managed PostgreSQL on Railway (DATABASE_URL), which is UTF8.
 *
 * On Windows initdb defaults to the system code page (WIN1252), which cannot store Vietnamese
 * text — so the cluster and the database are always created as UTF8 here, and checked.
 */
export async function startEmbeddedPostgres(opts: { dir: string; port: number; database: string; recreate?: boolean }) {
  const pg = new EmbeddedPostgres({
    databaseDir: opts.dir,
    port: opts.port,
    user: 'postgres',
    password: 'postgres',
    persistent: true,
    initdbFlags: ['--encoding=UTF8', '--no-locale'],
    onLog: () => {},
  });
  if (!fs.existsSync(path.join(opts.dir, 'PG_VERSION'))) await pg.initialise();
  await pg.start();

  const client = pg.getPgClient('postgres');
  await client.connect();
  try {
    const ident = `"${opts.database.replace(/"/g, '""')}"`;
    if (opts.recreate) await client.query(`DROP DATABASE IF EXISTS ${ident}`);
    const found = await client.query<{ enc: string }>('SELECT pg_encoding_to_char(encoding) AS enc FROM pg_database WHERE datname = $1', [opts.database]);
    if (found.rowCount === 0) {
      await client.query(`CREATE DATABASE ${ident} WITH ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`);
    } else if (found.rows[0]!.enc !== 'UTF8') {
      throw new Error(
        `Database "${opts.database}" in ${opts.dir} uses ${found.rows[0]!.enc}, not UTF8, so it cannot store Vietnamese text. ` +
          'Stop the server, delete that folder (local dev data only) and run `npm run db:start` again.',
      );
    }
  } finally {
    await client.end();
  }
  return { pg, url: `postgres://postgres:postgres@localhost:${opts.port}/${opts.database}` };
}
