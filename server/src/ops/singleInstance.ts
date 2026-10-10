import http from 'node:http';
import pg from 'pg';
import { logger } from '../logger.ts';

/**
 * CLAUDE.md invariant 5: one server process. During a deploy the platform starts the new container
 * before stopping the old one; without this both would run the matcher, engines, bots and market feeds.
 *
 * The process holds a PostgreSQL advisory lock on a dedicated connection for its whole life. A new
 * instance first answers health checks as "standby" (so the deploy proceeds and the old one is
 * stopped), waits for the lock, then starts for real. The lock is released by PostgreSQL itself when
 * the holder's connection closes — clean shutdown, crash or kill.
 */
export const ENGINE_LOCK_KEY = 0x6365_7801; // "cex" + 1 (any constant int shared by every instance)

export interface InstanceLock {
  release(): Promise<void>;
}

export interface AcquireOptions {
  /** How often to retry while another instance holds the lock. */
  retryMs?: number;
  /** Called once when the lock is busy (another instance is still running). */
  onWait?: () => void;
  /** The lock's connection broke after it was acquired: this process can no longer be sure it is alone. */
  onLost?: (err: Error) => void;
  signal?: AbortSignal;
}

export async function acquireInstanceLock(databaseUrl: string, opts: AcquireOptions = {}): Promise<InstanceLock> {
  const retryMs = opts.retryMs ?? 2000;
  let waited = false;
  for (;;) {
    if (opts.signal?.aborted) throw new Error('aborted while waiting for the instance lock');
    const client = new pg.Client({ connectionString: databaseUrl, application_name: 'cex-instance-lock' });
    await client.connect();
    const { rows } = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [ENGINE_LOCK_KEY]);
    if (rows[0]?.ok) {
      let releasing = false;
      client.on('error', (err) => {
        if (!releasing) opts.onLost?.(err);
      });
      return {
        async release() {
          releasing = true;
          await client.end().catch(() => {});
        },
      };
    }
    await client.end().catch(() => {});
    if (!waited) {
      waited = true;
      opts.onWait?.();
    }
    await new Promise((r) => setTimeout(r, retryMs));
  }
}

/**
 * A placeholder HTTP server while waiting for the lock: health checks pass (status "ok", market
 * DISCONNECTED, version), everything else gets 503 — no request can reach half-started code.
 */
export function startStandbyServer(port: number, version: string): Promise<{ port: number; close(): Promise<void> }> {
  const server = http.createServer((req, res) => {
    if (req.url?.startsWith('/api/v1/health')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString(), version, market: 'DISCONNECTED' }));
      return;
    }
    res.writeHead(503, { 'content-type': 'application/json', 'retry-after': '5' });
    res.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Server is starting, try again in a few seconds' } }));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      logger.info({ port }, 'standby: answering health checks while waiting for the instance lock');
      resolve({
        port: (server.address() as { port: number }).port,
        close: () =>
          new Promise<void>((r) => {
            server.closeAllConnections();
            server.close(() => r());
          }),
      });
    });
  });
}
