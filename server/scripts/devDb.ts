import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startEmbeddedPostgres } from './embeddedPg.ts';
import { createDatabase, runMigrations } from '../src/db/client.ts';

// Starts a persistent local PostgreSQL on :5433 (data in /.pgdata) and applies migrations.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { pg, url } = await startEmbeddedPostgres({ dir: path.join(root, '.pgdata'), port: 5433, database: 'cex' });
const database = createDatabase(url, 1);
await runMigrations(database.db);
await database.close();
console.log(`PostgreSQL ready: ${url}  (Ctrl+C to stop)`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
