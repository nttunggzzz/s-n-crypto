import { describe, expect, it } from 'vitest';
import { TEST_DB_URL } from '../../test/constants.ts';
import { acquireInstanceLock, startStandbyServer } from './singleInstance.ts';

describe('one server instance at a time (deploy overlap)', () => {
  it('a second instance waits until the first releases the lock (or its connection dies)', async () => {
    const first = await acquireInstanceLock(TEST_DB_URL);
    let waiting = false;
    let secondGot = false;
    const second = acquireInstanceLock(TEST_DB_URL, { retryMs: 50, onWait: () => (waiting = true) }).then((l) => {
      secondGot = true;
      return l;
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(waiting).toBe(true);
    expect(secondGot).toBe(false);
    await first.release();
    const lock = await second;
    expect(secondGot).toBe(true);
    await lock.release();
  });

  it('standby answers health checks and refuses everything else', async () => {
    const s = await startStandbyServer(0, 'abc1234'); // 0 = any free port
    const port = s.port;
    const health = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok', version: 'abc1234', market: 'DISCONNECTED' });
    const other = await fetch(`http://127.0.0.1:${port}/api/v1/orders/open`);
    expect(other.status).toBe(503);
    expect(other.headers.get('retry-after')).toBe('5');
    await s.close();
  });
});
