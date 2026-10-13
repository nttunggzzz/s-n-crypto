import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PlaceOrderRequest } from '@cex/contracts';
import { createDatabase, runMigrations, type Database } from '../db/client.ts';
import { reconcile } from '../modules/exchange/reconciliation.ts';
import { createTestEnv, createUser, marketTrade, setBook, type TestEnv } from '../../test/helpers.ts';
import { TEST_DB_PORT } from '../../test/constants.ts';
import { BACKUP_FORMAT, dumpDatabase, restoreDatabase } from './logicalBackup.ts';

// The nightly host backup: dump a LIVE database, restore into a fresh one, and the books still balance.
const RESTORE_DB = 'cex_restore_test';
const adminUrl = `postgres://postgres:postgres@localhost:${TEST_DB_PORT}/postgres`;
const targetUrl = `postgres://postgres:postgres@localhost:${TEST_DB_PORT}/${RESTORE_DB}`;

let env: TestEnv;
let target: Database;
const dump: string[] = [];

async function freshTarget(): Promise<Database> {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${RESTORE_DB} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${RESTORE_DB} WITH ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`);
  } finally {
    await admin.end();
  }
  const db = createDatabase(targetUrl, 4);
  await runMigrations(db.db);
  return db;
}
const count = async (db: Database, table: string) => Number((await db.pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`)).rows[0]!.n);

beforeAll(async () => {
  env = await createTestEnv();
  setBook(env, 'BTCUSDT', [['99.00', '5.00000'], ['98.00', '5.00000']], [['100.00', '5.00000'], ['101.00', '5.00000']]);
  // real activity: funded users, a market buy, a resting limit order, a Vietnamese name, a decimal that float cannot hold
  const a = await createUser(env);
  const b = await createUser(env);
  await env.ex.faucet.claim(a);
  await env.ex.faucet.claim(b);
  await env.ex.orders.placeOrder(a, PlaceOrderRequest.parse({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quoteOrderQty: '1000' }));
  await env.ex.orders.placeOrder(b, PlaceOrderRequest.parse({ symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '1.23456', price: '50.5' }));
  marketTrade(env, 'BTCUSDT', '100.00');
  await env.database.pool.query(`UPDATE users SET name = 'Nguyễn Văn Ánh — kiểm thử' WHERE id = $1`, [a]);
  await dumpDatabase(env.database.pool, (l) => void dump.push(l));
  target = await freshTarget();
});
afterAll(async () => {
  await target?.close();
  await env?.close();
});

describe('logical backup', () => {
  it('dump has a header, every table, an end marker; rows are one line each', () => {
    expect(dump[0]).toMatch(new RegExp(`^H\\t${BACKUP_FORMAT}\\t\\d{4}-`));
    expect(dump.at(-1)).toMatch(/^E\t\d+$/);
    expect(dump.some((l) => l.startsWith('T\tpublic.ledger_entries'))).toBe(true);
    expect(dump.some((l) => l.startsWith('T\tdrizzle.__drizzle_migrations'))).toBe(true);
    expect(dump.every((l) => !l.includes('\n'))).toBe(true);
  });

  it('restores into a fresh database: same row counts, exact money, UTF-8, and the books balance', async () => {
    const s = await restoreDatabase(target.pool, dump);
    expect(s.rows).toBeGreaterThan(10);
    for (const t of ['users', 'balances', 'ledger_entries', 'orders', 'trades', 'drizzle.__drizzle_migrations']) {
      expect(await count(target, t), t).toBe(await count(env.database, t));
    }
    const money = (db: Database) => db.pool.query(`SELECT user_id, asset, available::text AS a, locked::text AS l FROM balances ORDER BY user_id, asset`);
    expect((await money(target)).rows).toEqual((await money(env.database)).rows);
    expect((await target.pool.query(`SELECT name FROM users WHERE name LIKE 'Nguyễn%'`)).rows[0]!.name).toBe('Nguyễn Văn Ánh — kiểm thử');
    const r = await reconcile(target.db, false);
    expect(r.mismatches).toEqual([]);
    expect(r.checkedBalances).toBeGreaterThan(0);
  });

  it('identity / sequence values are restored: the next user gets a new uid, not a duplicate', async () => {
    const maxUid = Number((await target.pool.query<{ m: string }>('SELECT max(uid)::text AS m FROM users')).rows[0]!.m);
    const ins = await target.pool.query<{ uid: string }>(`INSERT INTO users (email, name) VALUES ('after-restore@test.local', 'Sau khôi phục') RETURNING uid::text`);
    expect(Number(ins.rows[0]!.uid)).toBeGreaterThan(maxUid);
  });

  it('the restored ledger is still append-only (triggers are back after the load)', async () => {
    await expect(target.pool.query(`UPDATE ledger_entries SET asset = asset`)).rejects.toThrow(/append-only/);
  });

  it('a file cut short is refused and the target is left untouched', async () => {
    const before = await count(target, 'ledger_entries');
    const cut = dump.slice(0, Math.floor(dump.length / 2));
    await expect(restoreDatabase(target.pool, cut)).rejects.toThrow(/incomplete|cut short/);
    expect(await count(target, 'ledger_entries')).toBe(before);
  });

  it('a backup made with a different schema version is refused with a clear message', async () => {
    const other = dump.map((l, i) => (i === 0 ? l.replace(/^(H\t\d+\t[^\t]+\t)\d+/, '$1999') : l));
    await expect(restoreDatabase(target.pool, other)).rejects.toThrow(/999 migrations/);
  });

  it('a row count that does not match is refused (corrupted file)', async () => {
    const dropped = dump.findIndex((l) => l.startsWith('D\tpublic.ledger_entries\t'));
    const bad = dump.filter((_, i) => i !== dropped);
    const before = await count(target, 'ledger_entries');
    await expect(restoreDatabase(target.pool, bad)).rejects.toThrow(/ledger_entries.*rows/);
    expect(await count(target, 'ledger_entries')).toBe(before);
  });

  it('not a backup at all', async () => {
    await expect(restoreDatabase(target.pool, ['hello', 'world'])).rejects.toThrow(/not a backup/);
  });
});
