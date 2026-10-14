/**
 * Logical backup of the whole database, taken while the exchange is RUNNING (no pg_dump needed — the embedded
 * PostgreSQL ships without it) and restorable into a fresh database.
 *
 * Format: text lines, tab-separated, `\n` ends a line (one row = one line; the row is PostgreSQL's own `row_to_json`
 * text, never parsed in JavaScript, so `numeric(38,18)` money keeps every digit):
 *   H  <format version>  <created at ISO>  <migrations applied>  <server_version>
 *   T  <schema.table>                       one per table, before any row
 *   Q  <schema.sequence>  <last value|->    sequences (identity columns too); `-` = never used
 *   D  <schema.table>  <row json>           data rows
 *   C  <schema.table>  <row count>          counts, for the check after a restore
 *   E  <total rows>                         end marker — a file without it was cut short
 *
 * The dump runs in one REPEATABLE READ read-only transaction: a consistent snapshot, whatever the exchange does meanwhile.
 * Restore replaces EVERYTHING in the target (TRUNCATE) in one transaction, with triggers and foreign keys off for that
 * transaction (the append-only triggers on the ledger and audit log must not stop the load), then checks the counts.
 */
import type pg from 'pg';

export const BACKUP_FORMAT = 1;
/** Schemas that hold the exchange: the app tables and Drizzle's migration journal. */
const SCHEMAS = ['public', 'drizzle'];
const BATCH = 1000;

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
const qualified = (name: string) => name.split('.').map(ident).join('.');

export interface DumpSummary {
  tables: Record<string, number>;
  sequences: number;
  rows: number;
  migrations: number;
}

async function migrationCount(q: Pick<pg.PoolClient, 'query'>): Promise<number> {
  const r = await q.query<{ n: string }>('SELECT count(*)::text AS n FROM drizzle.__drizzle_migrations');
  return Number(r.rows[0]?.n ?? 0);
}

export async function dumpDatabase(pool: pg.Pool, write: (line: string) => void | Promise<void>): Promise<DumpSummary> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tables = (
      await client.query<{ name: string }>(
        `SELECT table_schema || '.' || table_name AS name FROM information_schema.tables
          WHERE table_type = 'BASE TABLE' AND table_schema = ANY($1) ORDER BY 1`,
        [SCHEMAS],
      )
    ).rows.map((r) => r.name);
    const sequences = (
      await client.query<{ name: string; last: string | null }>(
        `SELECT schemaname || '.' || sequencename AS name, last_value::text AS last FROM pg_sequences WHERE schemaname = ANY($1) ORDER BY 1`,
        [SCHEMAS],
      )
    ).rows;
    const version = (await client.query<{ v: string }>('SHOW server_version')).rows[0]!.v;
    const migrations = await migrationCount(client);

    await write(`H\t${BACKUP_FORMAT}\t${new Date().toISOString()}\t${migrations}\t${version}`);
    for (const t of tables) await write(`T\t${t}`);
    for (const s of sequences) await write(`Q\t${s.name}\t${s.last ?? '-'}`);

    const counts: Record<string, number> = {};
    let rows = 0;
    for (const t of tables) {
      let n = 0;
      await client.query(`DECLARE dump_cur NO SCROLL CURSOR FOR SELECT row_to_json(x)::text AS j FROM ${qualified(t)} x`);
      for (;;) {
        const r = await client.query<{ j: string }>(`FETCH FORWARD ${BATCH} FROM dump_cur`);
        for (const row of r.rows) await write(`D\t${t}\t${row.j}`);
        n += r.rows.length;
        if (r.rows.length < BATCH) break;
      }
      await client.query('CLOSE dump_cur');
      counts[t] = n;
      rows += n;
    }
    for (const t of tables) await write(`C\t${t}\t${counts[t]}`);
    await write(`E\t${rows}`);
    await client.query('COMMIT');
    return { tables: counts, sequences: sequences.length, rows, migrations };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export interface RestoreSummary {
  tables: number;
  rows: number;
  createdAt: string;
  migrations: number;
}

/**
 * Replaces the content of `pool`'s database with the dump. The target must already have the schema of the SAME code
 * version as the dump (same number of migrations): create it with `runMigrations` on an empty database first.
 * Throws — and changes nothing — when the file is cut short, the schema differs, or a count does not match.
 */
export async function restoreDatabase(pool: pg.Pool, lines: AsyncIterable<string> | Iterable<string>): Promise<RestoreSummary> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL session_replication_role = replica'); // no triggers, no foreign-key checks in this transaction

    let header: { createdAt: string; migrations: number } | null = null;
    const tables: string[] = [];
    const sequences: { name: string; last: string }[] = [];
    const counts: Record<string, number> = {};
    const loaded: Record<string, number> = {};
    let pending: { table: string; rows: string[] } | null = null;
    let total = 0;
    let ended = false;
    let truncated = false;

    const flush = async () => {
      if (!pending || pending.rows.length === 0) return;
      await client.query(`INSERT INTO ${qualified(pending.table)} SELECT r.* FROM json_populate_recordset(NULL::${qualified(pending.table)}, $1::json) r`, [`[${pending.rows.join(',')}]`]);
      loaded[pending.table] = (loaded[pending.table] ?? 0) + pending.rows.length;
      pending.rows = [];
    };

    for await (const line of lines) {
      if (line === '') continue;
      const parts = line.split('\t');
      const kind = parts[0];
      if (kind === 'H') {
        if (Number(parts[1]) !== BACKUP_FORMAT) throw new Error(`unknown backup format ${parts[1]}`);
        header = { createdAt: parts[2]!, migrations: Number(parts[3]) };
        const here = await migrationCount(client);
        if (here !== header.migrations) {
          throw new Error(`the backup was made with ${header.migrations} migrations, this database has ${here} — restore with the same code version that made the backup, then update`);
        }
      } else if (!header) {
        throw new Error('not a backup file (no header)');
      } else if (kind === 'T') {
        tables.push(parts[1]!);
      } else if (kind === 'Q') {
        sequences.push({ name: parts[1]!, last: parts[2]! });
      } else if (kind === 'D') {
        if (!truncated) {
          await client.query(`TRUNCATE ${tables.map(qualified).join(', ')} RESTART IDENTITY`);
          truncated = true;
        }
        const table = parts[1]!;
        const json = line.slice(line.indexOf('\t', 2) + 1); // everything after "D\t<table>\t"
        if (!pending || pending.table !== table) {
          await flush();
          pending = { table, rows: [] };
        }
        pending.rows.push(json);
        total++;
        if (pending.rows.length >= 500) await flush();
      } else if (kind === 'C') {
        counts[parts[1]!] = Number(parts[2]);
      } else if (kind === 'E') {
        ended = true;
      }
    }
    await flush();
    if (!header) throw new Error('not a backup file (empty)');
    if (!ended) throw new Error('the backup file is incomplete (no end marker) — it was cut short');
    if (!truncated) await client.query(`TRUNCATE ${tables.map(qualified).join(', ')} RESTART IDENTITY`); // an empty database

    for (const t of tables) {
      const expected = counts[t] ?? 0;
      const actual = loaded[t] ?? 0;
      if (expected !== actual) throw new Error(`${t}: the backup says ${expected} rows, ${actual} were loaded`);
      const inDb = Number((await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${qualified(t)}`)).rows[0]!.n);
      if (inDb !== expected) throw new Error(`${t}: ${expected} rows expected, ${inDb} in the database after the load`);
    }
    for (const s of sequences) {
      if (s.last !== '-') await client.query('SELECT setval($1::regclass, $2::bigint, true)', [qualified(s.name), s.last]);
    }
    await client.query('COMMIT');
    return { tables: tables.length, rows: total, createdAt: header.createdAt, migrations: header.migrations };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
