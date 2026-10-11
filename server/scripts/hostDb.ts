/**
 * Only the host database (no server) — infra/host.mjs uses it for `invite` / `set-role` while the host is stopped.
 * Stops PostgreSQL when stdin closes.
 */
import path from 'node:path';
import { startEmbeddedPostgres } from './embeddedPg.ts';

const dataDir = process.env.HOST_DATA_DIR;
if (!dataDir) throw new Error('HOST_DATA_DIR is not set — use `npm run host -- …`');
const { pg } = await startEmbeddedPostgres({ dir: path.join(dataDir, 'pgdata'), port: Number(process.env.HOST_PG_PORT ?? 5435), database: 'cex' });
process.stdin.on('end', () => void pg.stop().then(() => process.exit(0)));
process.stdin.resume();
