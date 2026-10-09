import { createDatabase, runMigrations } from '../src/db/client.ts';
import { loadConfig } from '../src/config.ts';

const config = loadConfig();
const database = createDatabase(config.DATABASE_URL, 1);
await runMigrations(database.db);
await database.close();
console.log('migrations applied');
