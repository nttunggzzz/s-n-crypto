import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { Dec, ZERO, dec, hasAtMostScale, toFixedStr, AMOUNT_SCALE } from '@cex/core';
import { balances, ledgerEntries, type Account, type LedgerType, type RefType } from '../../db/schema.ts';
import type { DbOrTx, Tx } from '../../db/client.ts';
import { AppError } from '../../lib/errors.ts';

export interface BalanceChange {
  userId: string;
  /** Wallet (default SPOT). */
  account?: Account;
  asset: string;
  type: LedgerType;
  deltaAvailable?: Dec;
  deltaLocked?: Dec;
  refType?: RefType;
  refId?: string;
}

export interface BalanceState {
  userId: string;
  account: Account;
  asset: string;
  available: Dec;
  locked: Dec;
}

const key = (userId: string, account: Account, asset: string) => `${userId}|${account}|${asset}`;

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

  const pairs = [
    ...new Map(changes.map((c) => [key(c.userId, c.account ?? 'SPOT', c.asset), { userId: c.userId, account: c.account ?? 'SPOT', asset: c.asset }])).values(),
  ].sort((a, b) => (key(a.userId, a.account, a.asset) < key(b.userId, b.account, b.asset) ? -1 : 1));

  await tx.insert(balances).values(pairs).onConflictDoNothing();

  const rows = await tx
    .select()
    .from(balances)
    .where(or(...pairs.map((p) => and(eq(balances.userId, p.userId), eq(balances.account, p.account), eq(balances.asset, p.asset)))))
    .orderBy(asc(balances.userId), asc(balances.account), asc(balances.asset))
    .for('update');

  const state = new Map<string, BalanceState>();
  for (const r of rows) state.set(key(r.userId, r.account, r.asset), { userId: r.userId, account: r.account, asset: r.asset, available: dec(r.available), locked: dec(r.locked) });

  const entries: (typeof ledgerEntries.$inferInsert)[] = [];
  for (const c of changes) {
    const account = c.account ?? 'SPOT';
    const s = state.get(key(c.userId, account, c.asset))!;
    const da = c.deltaAvailable ?? ZERO;
    const dl = c.deltaLocked ?? ZERO;
    const available = s.available.add(da);
    const locked = s.locked.add(dl);
    if (available.lt(0) || locked.lt(0)) {
      throw new AppError('INSUFFICIENT_BALANCE', `Insufficient ${account === 'FUTURES' ? 'futures ' : ''}${c.asset} balance`, {
        account,
        asset: c.asset,
        available: toFixedStr(s.available),
        required: toFixedStr(da.neg()),
      });
    }
    s.available = available;
    s.locked = locked;
    entries.push({
      userId: c.userId,
      account,
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
      .where(and(eq(balances.userId, s.userId), eq(balances.account, s.account), eq(balances.asset, s.asset)));
  }
  await tx.insert(ledgerEntries).values(entries);
  return state;
}

/** Balances of one wallet (default SPOT). */
export async function getBalances(tx: DbOrTx, userId: string, assets?: string[], account: Account = 'SPOT') {
  const own = and(eq(balances.userId, userId), eq(balances.account, account));
  const where = assets?.length ? and(own, inArray(balances.asset, assets)) : own;
  return tx.select().from(balances).where(where).orderBy(asc(balances.asset));
}
