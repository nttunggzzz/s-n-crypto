import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { Dec, ZERO, dec, hasAtMostScale, toFixedStr, AMOUNT_SCALE } from '@cex/core';
import { balances, ledgerEntries, type LedgerType, type RefType } from '../../db/schema.ts';
import type { DbOrTx, Tx } from '../../db/client.ts';
import { AppError } from '../../lib/errors.ts';

export interface BalanceChange {
  userId: string;
  asset: string;
  type: LedgerType;
  deltaAvailable?: Dec;
  deltaLocked?: Dec;
  refType?: RefType;
  refId?: string;
}

export interface BalanceState {
  userId: string;
  asset: string;
  available: Dec;
  locked: Dec;
}

const key = (userId: string, asset: string) => `${userId}|${asset}`;

/**
 * The ONLY way balances change.
 *
 * Inside the caller's transaction it locks the affected balance rows (sorted, to avoid deadlocks),
 * applies every change in order, refuses any step that would make available/locked negative
 * (INSUFFICIENT_BALANCE), updates the rows and appends one ledger row per change.
 * The CHECK constraints on `balances` are a second line of defence.
 */
export async function applyBalanceChanges(tx: Tx, changes: BalanceChange[]): Promise<Map<string, BalanceState>> {
  if (changes.length === 0) return new Map();
  for (const c of changes) {
    for (const d of [c.deltaAvailable, c.deltaLocked]) {
      if (d && !hasAtMostScale(d, AMOUNT_SCALE)) {
        throw new Error(`ledger amount ${d.toString()} has more than ${AMOUNT_SCALE} decimals (${c.type} ${c.asset})`);
      }
    }
  }

  const pairs = [...new Map(changes.map((c) => [key(c.userId, c.asset), { userId: c.userId, asset: c.asset }])).values()].sort((a, b) =>
    key(a.userId, a.asset) < key(b.userId, b.asset) ? -1 : 1,
  );

  await tx.insert(balances).values(pairs).onConflictDoNothing();

  const rows = await tx
    .select()
    .from(balances)
    .where(or(...pairs.map((p) => and(eq(balances.userId, p.userId), eq(balances.asset, p.asset)))))
    .orderBy(asc(balances.userId), asc(balances.asset))
    .for('update');

  const state = new Map<string, BalanceState>();
  for (const r of rows) state.set(key(r.userId, r.asset), { userId: r.userId, asset: r.asset, available: dec(r.available), locked: dec(r.locked) });

  const entries: (typeof ledgerEntries.$inferInsert)[] = [];
  for (const c of changes) {
    const s = state.get(key(c.userId, c.asset))!;
    const da = c.deltaAvailable ?? ZERO;
    const dl = c.deltaLocked ?? ZERO;
    const available = s.available.add(da);
    const locked = s.locked.add(dl);
    if (available.lt(0) || locked.lt(0)) {
      throw new AppError('INSUFFICIENT_BALANCE', `Insufficient ${c.asset} balance`, {
        asset: c.asset,
        available: toFixedStr(s.available),
        required: toFixedStr(da.neg()),
      });
    }
    s.available = available;
    s.locked = locked;
    entries.push({
      userId: c.userId,
      asset: c.asset,
      type: c.type,
      deltaAvailable: toFixedStr(da),
      deltaLocked: toFixedStr(dl),
      availableAfter: toFixedStr(available),
      lockedAfter: toFixedStr(locked),
      refType: c.refType ?? null,
      refId: c.refId ?? null,
    });
  }

  for (const s of state.values()) {
    await tx
      .update(balances)
      .set({ available: toFixedStr(s.available), locked: toFixedStr(s.locked), updatedAt: sql`now()` })
      .where(and(eq(balances.userId, s.userId), eq(balances.asset, s.asset)));
  }
  await tx.insert(ledgerEntries).values(entries);
  return state;
}

export async function getBalances(tx: DbOrTx, userId: string, assets?: string[]) {
  const where = assets?.length ? and(eq(balances.userId, userId), inArray(balances.asset, assets)) : eq(balances.userId, userId);
  return tx.select().from(balances).where(where).orderBy(asc(balances.asset));
}
