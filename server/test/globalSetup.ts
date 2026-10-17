import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startEmbeddedPostgres } from '../scripts/embeddedPg.ts';
import { createDatabase, runMigrations } from '../src/db/client.ts';
import { TEST_DB_PORT } from './constants.ts';

export default async function setup() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const { pg, url } = await startEmbeddedPostgres({
    // one data directory per port, so a run on CEX_TEST_DB_PORT never touches the default run's files
    dir: path.join(root, TEST_DB_PORT === 5434 ? '.pgdata-test' : `.pgdata-test-${TEST_DB_PORT}`),
    port: TEST_DB_PORT,
    database: 'cex_test',
    recreate: true,
  });
  const database = createDatabase(url, 1);
  await runMigrations(database.db);
  await database.close();
  return async () => {
    await pg.stop();
  };
}
