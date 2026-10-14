import { and, desc, eq, gte, lt, lte, sql, type SQL } from 'drizzle-orm';
import { TaxCategory, type AdminTaxSummary, type AdminTaxWithholding, type TaxSales, type TaxSummary, type TaxTotals, type TaxWithholding } from '@cex/contracts';
import { dec, toFixedStr, Dec } from '@cex/core';
import { taxWithholdings, trades } from '../../db/schema.ts';
import type { Db, DbOrTx } from '../../db/client.ts';
import { AppError } from '../../lib/errors.ts';
import { taxCategoryOf } from '../exchange/tax.ts';
import { periodRange, vnYearNow, yearRange } from './period.ts';

/**
 * Tax reports (module T, batch T3). They READ `tax_withholdings` (the source of truth - nothing is recomputed from
 * `trades`); only the sales block of the user summary reads `trades`. All sums are computed by SQL, come back as strings
 * and are added up with Dec - never with a JS number.
 */

const ZERO = new Dec(0);
const fx = (d: Dec) => toFixedStr(d);
const vnd = (d: Dec) => d.toFixed(0);

/** "YYYY-MM" of a timestamptz in Vietnam time (UTC+7, no DST). */
const vnMonthOf = (col: SQL | typeof taxWithholdings.createdAt | typeof trades.createdAt) => sql<string>`to_char((${col} at time zone 'UTC') + interval '7 hours', 'YYYY-MM')`;

// ───────────────────────────── aggregation of withholding records

/** Raw sums of a group of records. The VND sums only cover the records that have a VND amount (see `missing`). */
interface Agg {
  count: number;
  users: number;
  gross: Dec;
  tax: Dec;
  grossVnd: Dec;
  taxVnd: Dec;
  /** Records without a VND rate (vnd_rate IS NULL). */
  missing: number;
}

const emptyAgg = (): Agg => ({ count: 0, users: 0, gross: ZERO, tax: ZERO, grossVnd: ZERO, taxVnd: ZERO, missing: 0 });

const aggColumns = {
  n: sql<number>`count(*)::int`,
  users: sql<number>`count(distinct ${taxWithholdings.userId})::int`,
  gross: sql<string>`coalesce(sum(${taxWithholdings.grossQuote}), 0)::text`,
  tax: sql<string>`coalesce(sum(${taxWithholdings.taxAmount}), 0)::text`,
  grossVnd: sql<string>`coalesce(sum(${taxWithholdings.grossVnd}), 0)::text`,
  taxVnd: sql<string>`coalesce(sum(${taxWithholdings.taxVnd}), 0)::text`,
  missing: sql<number>`(count(*) filter (where ${taxWithholdings.vndRate} is null))::int`,
};

/** One aggregate row per value of `group` (only groups that have records); `group = null` -> one row under the key "all". */
async function aggregate(db: DbOrTx, where: SQL[], group: SQL | null): Promise<Map<string, Agg>> {
  const base = db
    .select({ g: group ?? sql<string>`'all'`, ...aggColumns })
    .from(taxWithholdings)
    .where(and(...where));
  const rows = await (group ? base.groupBy(group) : base);
  return new Map(
    rows.map((r) => [
      String(r.g),
      { count: r.n, users: r.users, gross: dec(r.gross), tax: dec(r.tax), grossVnd: dec(r.grossVnd), taxVnd: dec(r.taxVnd), missing: r.missing } satisfies Agg,
    ]),
  );
}

/** Contract TaxTotals. The VND totals are null as soon as one record of the group has no VND (a partial sum would look complete). */
function toTotals(a: Agg): TaxTotals {
  return {
    withholdingCount: a.count,
    withheldGrossQuote: fx(a.gross),
    taxAmount: fx(a.tax),
    withheldGrossVnd: a.missing > 0 ? null : vnd(a.grossVnd),
    taxVnd: a.missing > 0 ? null : vnd(a.taxVnd),
    vndMissingCount: a.missing,
  };
}

function addAgg(a: Agg, b: Agg): Agg {
  return { count: a.count + b.count, users: a.users + b.users, gross: a.gross.add(b.gross), tax: a.tax.add(b.tax), grossVnd: a.grossVnd.add(b.grossVnd), taxVnd: a.taxVnd.add(b.taxVnd), missing: a.missing + b.missing };
}

// ───────────────────────────── the user's sales (every spot SELL fill, withheld or not)

interface SalesAgg {
  count: number;
  gross: Dec;
  fees: Dec;
  pnl: Dec;
  noCost: number;
}

const emptySales = (): SalesAgg => ({ count: 0, gross: ZERO, fees: ZERO, pnl: ZERO, noCost: 0 });

async function salesByMonth(db: DbOrTx, userId: string, from: Date, to: Date): Promise<Map<string, SalesAgg>> {
  const month = vnMonthOf(trades.createdAt);
  const rows = await db
    .select({
      g: month,
      n: sql<number>`count(*)::int`,
      gross: sql<string>`coalesce(sum(${trades.quoteQty}), 0)::text`,
      fees: sql<string>`coalesce(sum(${trades.fee}), 0)::text`,
      pnl: sql<string>`coalesce(sum(${trades.realizedPnl}), 0)::text`,
      noCost: sql<number>`(count(*) filter (where ${trades.realizedPnl} is null))::int`,
    })
    .from(trades)
    .where(and(eq(trades.userId, userId), eq(trades.side, 'SELL'), gte(trades.createdAt, from), lte(trades.createdAt, to)))
    .groupBy(month);
  return new Map(rows.map((r) => [r.g, { count: r.n, gross: dec(r.gross), fees: dec(r.fees), pnl: dec(r.pnl), noCost: r.noCost } satisfies SalesAgg]));
}

function toSales(s: SalesAgg): TaxSales {
  return { sellCount: s.count, sellGrossQuote: fx(s.gross), sellFees: fx(s.fees), realizedPnl: fx(s.pnl), sellsWithoutCostBasis: s.noCost };
}

/**
 * Runs the reads of one summary in a single REPEATABLE READ, READ ONLY transaction: every query sees the same snapshot, so the
 * totals, the per-group rows and the sales block always add up. The queries run one after another (one connection).
 */
function readSnapshot<T>(db: Db, fn: (tx: Parameters<Parameters<Db['transaction']>[0]>[0]) => Promise<T>): Promise<T> {
  return db.transaction(fn, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

// ───────────────────────────── taxSummary (user)

/** Calendar year in Vietnam time: always 12 months, a month without activity is all zeros. */
export async function userTaxSummary(db: Db, userId: string, year: number = vnYearNow()): Promise<TaxSummary> {
  const { from, to } = yearRange(year);
  // one snapshot for all three reads, so a fill that commits in between cannot show up in one block and not in another
  const [withheld, sales, category] = await readSnapshot(db, async (tx) => {
    const withheld = await aggregate(tx, [eq(taxWithholdings.userId, userId), gte(taxWithholdings.createdAt, from), lte(taxWithholdings.createdAt, to)], vnMonthOf(taxWithholdings.createdAt));
    const sales = await salesByMonth(tx, userId, from, to);
    const category = await taxCategoryOf(tx, userId);
    return [withheld, sales, category] as const;
  });
  let totalW = emptyAgg();
  let totalS = emptySales();
  const months = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    const w = withheld.get(key) ?? emptyAgg();
    const s = sales.get(key) ?? emptySales();
    totalW = addAgg(totalW, w);
    totalS = { count: totalS.count + s.count, gross: totalS.gross.add(s.gross), fees: totalS.fees.add(s.fees), pnl: totalS.pnl.add(s.pnl), noCost: totalS.noCost + s.noCost };
    return { month: key, ...toTotals(w), ...toSales(s) };
  });
  return { year, asset: 'USDT', category, totals: { ...toTotals(totalW), ...toSales(totalS) }, months };
}

// ───────────────────────────── adminTaxSummary

const byTaxDesc = (a: Dec, b: Dec) => (a.gt(b) ? -1 : a.lt(b) ? 1 : 0);

export async function adminTaxSummary(db: Db, period: string): Promise<AdminTaxSummary> {
  const { from, to } = periodRange(period);
  const where = [gte(taxWithholdings.createdAt, from), lte(taxWithholdings.createdAt, to)];
  const [all, byCategory, bySymbol] = await readSnapshot(db, async (tx) => {
    const all = await aggregate(tx, where, null);
    const byCategory = await aggregate(tx, where, sql<string>`${taxWithholdings.category}`);
    const bySymbol = await aggregate(tx, where, sql<string>`${taxWithholdings.symbol}`);
    return [all, byCategory, bySymbol] as const;
  });
  const group = (a: Agg) => ({ ...toTotals(a), userCount: a.users });
  return {
    period,
    from: from.toISOString(),
    to: to.toISOString(),
    asset: 'USDT',
    totals: group(all.get('all') ?? emptyAgg()),
    // one row per category in enum order; DOMESTIC_ORG is always zero (never withheld)
    byCategory: TaxCategory.options.map((category) => ({ category, ...group(byCategory.get(category) ?? emptyAgg()) })),
    // highest tax first (compared as numbers by Dec, not as strings); ties by symbol so the order is stable
    bySymbol: [...bySymbol.entries()]
      .sort(([sa, a], [sb, b]) => byTaxDesc(a.tax, b.tax) || (sa < sb ? -1 : sa > sb ? 1 : 0))
      .map(([symbol, a]) => ({ symbol, ...group(a) })),
  };
}

// ───────────────────────────── records: list and CSV rows

interface WithholdingFilterBase {
  symbol?: string;
  from?: string;
  to?: string;
}

/** The user's endpoints: `userId` is REQUIRED (the session user) - the type cannot be left out, and an empty string is refused at runtime. */
export interface UserWithholdingFilter extends WithholdingFilterBase {
  userId: string;
}

/** The admin endpoints: `userId` is an optional filter (undefined = every user); an empty string is refused, never read as "no filter". */
export interface AdminWithholdingFilter extends WithholdingFilterBase {
  userId?: string;
}

export type WithholdingRow = typeof taxWithholdings.$inferSelect;

const emptyUserId = () => new AppError('VALIDATION_ERROR', 'userId must not be empty', { field: 'userId' });

function filterWhere(f: WithholdingFilterBase & { userId?: string }): SQL[] {
  const w: SQL[] = [];
  if (f.userId !== undefined) {
    if (f.userId === '') throw emptyUserId();
    w.push(eq(taxWithholdings.userId, f.userId));
  }
  if (f.symbol) w.push(eq(taxWithholdings.symbol, f.symbol));
  if (f.from) w.push(gte(taxWithholdings.createdAt, new Date(f.from)));
  if (f.to) w.push(lte(taxWithholdings.createdAt, new Date(f.to)));
  return w;
}

/** Newest first (id DESC). `rows` is the page + 1 (the extra row tells the caller whether there is a next page). */
function queryRows(db: Db, where: SQL[], opts: { cursor?: number; take: number }): Promise<WithholdingRow[]> {
  if (opts.cursor !== undefined) where.push(lt(taxWithholdings.id, opts.cursor));
  return db
    .select()
    .from(taxWithholdings)
    .where(and(...where))
    .orderBy(desc(taxWithholdings.id))
    .limit(opts.take);
}

/** The signed-in user's own records. */
export async function userWithholdingRows(db: Db, f: UserWithholdingFilter, opts: { cursor?: number; take: number }): Promise<WithholdingRow[]> {
  // the type already demands a string; a JS caller (or a cast) that passes nothing or '' must fail, never see every user's rows
  if (typeof f.userId !== 'string' || f.userId === '') throw emptyUserId();
  return queryRows(db, filterWhere(f), opts);
}

/** Staff view: every user's records, optionally narrowed to one user. */
export async function adminWithholdingRows(db: Db, f: AdminWithholdingFilter, opts: { cursor?: number; take: number }): Promise<WithholdingRow[]> {
  return queryRows(db, filterWhere(f), opts);
}

export function serializeWithholding(r: WithholdingRow): TaxWithholding {
  return {
    id: String(r.id),
    tradeId: String(r.tradeId),
    orderId: String(r.orderId),
    symbol: r.symbol,
    asset: r.asset,
    quantity: fx(dec(r.quantity)),
    price: fx(dec(r.price)),
    grossQuote: fx(dec(r.grossQuote)),
    taxRate: dec(r.taxRate).toFixed(),
    taxAmount: fx(dec(r.taxAmount)),
    category: r.category,
    vndRate: r.vndRate === null ? null : dec(r.vndRate).toFixed(),
    // a record's three VND columns are null together; whole dong
    grossVnd: r.grossVnd === null ? null : vnd(dec(r.grossVnd)),
    taxVnd: r.taxVnd === null ? null : vnd(dec(r.taxVnd)),
    createdAt: r.createdAt.toISOString(),
  };
}

export function serializeAdminWithholding(r: WithholdingRow): AdminTaxWithholding {
  return { ...serializeWithholding(r), userId: r.userId };
}
