import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.ts';

export type Db = NodePgDatabase<typeof schema>;
/** A transaction handle; every exchange mutation receives one. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

export interface Database {
  db: Db;
  pool: pg.Pool;
  close(): Promise<void>;
}

export function createDatabase(url: string, poolSize = 10): Database {
  const pool = new pg.Pool({ connectionString: url, max: poolSize });
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}

/**
 * server/drizzle, found by walking up from where this code runs: src/db/client.ts (tsx, tests, scripts) or the
 * bundle dist/main.js (scripts/build.ts) — a fixed relative path is right for only one of them.
 */
export function findMigrationsDir(from: string): string {
  for (let dir = from; ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, 'drizzle', 'meta', '_journal.json'))) return path.join(dir, 'drizzle');
    if (path.dirname(dir) === dir) return path.resolve(from, '../../drizzle'); // not found: migrate() reports it
  }
}

export const MIGRATIONS_DIR = findMigrationsDir(path.dirname(fileURLToPath(import.meta.url)));

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
