import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';
import path from 'path';

// Use a local sqlite file for persistence
const dbPath = path.join(process.cwd(), 'crypto_intelligence.db');

export const sqliteClient = createClient({
  url: `file:${dbPath}`,
});

export const db = drizzle(sqliteClient, { schema });
