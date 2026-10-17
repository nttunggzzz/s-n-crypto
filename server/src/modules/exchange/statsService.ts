import { and, eq, gte, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import type { AccountTradingStats, TaxCategory, VolumeBucket } from '@cex/contracts';
import { dec, toFixedStr } from '@cex/core';
import { futuresTrades, symbols, taxWithholdings, trades, userTaxProfiles } from '../../db/schema.ts';
import type { Db } from '../../db/client.ts';
import { vnDayStart, vnMonthLabel, vnMonthOf, vnMonthStart } from '../tax/period.ts';
import type { ExchangeConfig } from './exchangeConfig.ts';

const DAY = 86_400_000;

/** The windows of `AccountTradingStats`, all as UTC instants. Days and months are Vietnam time (GMT+7). */
export interface StatsWindows {
  today: Date;
  last7d: Date;
  last30d: Date;
  thisMonth: Date;
  previousMonth: Date;
  thisMonthLabel: string;
  previousMonthLabel: string;
}

/**
 * Where each window starts at `now`. Days are the PnL analysis rule (calendar days GMT+7: today + the N-1 before it),
 * months are the tax rule (`vnMonthStart`). `previousMonth` ends where `thisMonth` starts; the other windows are open-ended.
 */
export function statsWindows(now: Date): StatsWindows {
  const today = vnDayStart(now);
  const { year, month } = vnMonthOf(now);
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  return {
    today,
    last7d: new Date(today.getTime() - 6 * DAY),
    last30d: new Date(today.getTime() - 29 * DAY),
    thisMonth: vnMonthStart(year, month),
    previousMonth: vnMonthStart(prev.year, prev.month),
    thisMonthLabel: vnMonthLabel(year, month),
    previousMonthLabel: vnMonthLabel(prev.year, prev.month),
  };
}

const at = (d: Date) => sql`${d.toISOString()}::timestamptz`;

/** `col` inside each window, as SQL conditions. */
function windowConditions(col: AnyColumn, w: StatsWindows) {
  const since = (d: Date) => sql`${col} >= ${at(d)}`;
  return {
    today: since(w.today),
    last7d: since(w.last7d),
    last30d: since(w.last30d),
    thisMonth: since(w.thisMonth),
    previousMonth: sql`(${col} >= ${at(w.previousMonth)} and ${col} < ${at(w.thisMonth)})`,
  };
}

/** Sum (as text, 0 when nothing matches) and count of the rows matching `cond`: one aggregate pass can hold many of these. */
const sumWhere = (amount: AnyColumn, cond: SQL) => sql<string>`coalesce(sum(${amount}) filter (where ${cond}), 0)::text`;
const countWhere = (cond: SQL) => sql<number>`(count(*) filter (where ${cond}))::int`;

/** The 10 columns (sum + count for each window) of one fills table; `only` narrows every window (e.g. USDT-quoted pairs). */
function volumeColumns(amount: AnyColumn, createdAt: AnyColumn, w: StatsWindows, only?: SQL) {
  const c = windowConditions(createdAt, w);
  const cond = (k: keyof typeof c): SQL => (only ? sql`(${only} and ${c[k]})` : c[k]);
  return {
    todaySum: sumWhere(amount, cond('today')),
    todayN: countWhere(cond('today')),
    last7dSum: sumWhere(amount, cond('last7d')),
    last7dN: countWhere(cond('last7d')),
    last30dSum: sumWhere(amount, cond('last30d')),
    last30dN: countWhere(cond('last30d')),
    thisMonthSum: sumWhere(amount, cond('thisMonth')),
    thisMonthN: countWhere(cond('thisMonth')),
    previousMonthSum: sumWhere(amount, cond('previousMonth')),
    previousMonthN: countWhere(cond('previousMonth')),
  };
}

type VolumeRow = Record<`${'today' | 'last7d' | 'last30d' | 'thisMonth' | 'previousMonth'}${'Sum' | 'N'}`, string | number>;

/** Spot + futures of one window as a contract bucket (Decimal addition; the strings come from SQL `sum`). */
function bucket(spot: VolumeRow, futures: VolumeRow, k: 'today' | 'last7d' | 'last30d' | 'thisMonth' | 'previousMonth'): VolumeBucket {
  const s = dec(String(spot[`${k}Sum`]));
  const f = dec(String(futures[`${k}Sum`]));
  return { spot: toFixedStr(s), futures: toFixedStr(f), total: toFixedStr(s.add(f)), fills: Number(spot[`${k}N`]) + Number(futures[`${k}N`]) };
}

/**
 * Trading volume and withheld tax of one user (`AccountTradingStats`), read-only. One aggregate query per table
 * (`trades`, `futures_trades`, `tax_withholdings`) covers every window with `FILTER (WHERE ...)`; the rows scanned are
 * only the user's, from the earlier of (start of last month, 30 days ago) on. Used by the user's own endpoint and by
 * `AdminService.getUser`, so both show the same numbers. Nothing is cached: a number is as fresh as the committed fills.
 */
export class AccountStatsService {
  constructor(
    private readonly db: Db,
    private readonly config: Pick<ExchangeConfig, 'tax'>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async forUser(userId: string): Promise<AccountTradingStats> {
    const now = this.now();
    const w = statsWindows(now);
    // the oldest instant any window needs (previous month start vs 30 days ago); older rows are never read
    const lower = w.previousMonth < w.last30d ? w.previousMonth : w.last30d;

    const [[spot], [fut], [tax], [profile]] = await Promise.all([
      this.db
        .select({
          ...volumeColumns(trades.quoteQty, trades.createdAt, w, sql`${symbols.quoteAsset} = 'USDT'`),
          // not USDT-quoted, or a pair the exchange no longer lists (LEFT JOIN gives NULL): never summed, never converted
          excluded: countWhere(sql`${symbols.quoteAsset} is distinct from 'USDT' and ${trades.createdAt} >= ${at(w.last30d)}`),
        })
        .from(trades)
        .leftJoin(symbols, eq(symbols.symbol, trades.symbol))
        .where(and(eq(trades.userId, userId), gte(trades.createdAt, lower))),
      // futures contracts are all USDT-margined perpetuals (futures/config.ts), so every fill is USDT notional
      this.db
        .select(volumeColumns(futuresTrades.quoteQty, futuresTrades.createdAt, w))
        .from(futuresTrades)
        .where(and(eq(futuresTrades.userId, userId), gte(futuresTrades.createdAt, lower))),
      this.db
        .select({
          thisN: countWhere(sql`${taxWithholdings.createdAt} >= ${at(w.thisMonth)}`),
          thisSum: sumWhere(taxWithholdings.taxAmount, sql`${taxWithholdings.createdAt} >= ${at(w.thisMonth)}`),
          prevN: countWhere(sql`(${taxWithholdings.createdAt} >= ${at(w.previousMonth)} and ${taxWithholdings.createdAt} < ${at(w.thisMonth)})`),
          prevSum: sumWhere(taxWithholdings.taxAmount, sql`(${taxWithholdings.createdAt} >= ${at(w.previousMonth)} and ${taxWithholdings.createdAt} < ${at(w.thisMonth)})`),
        })
        .from(taxWithholdings)
        .where(and(eq(taxWithholdings.userId, userId), gte(taxWithholdings.createdAt, w.previousMonth))),
      this.db.select({ category: userTaxProfiles.category }).from(userTaxProfiles).where(eq(userTaxProfiles.userId, userId)),
    ]);

    // an aggregate without GROUP BY always returns exactly one row
    const s = spot!;
    const f = fut!;
    const t = tax!;
    const category: TaxCategory = profile?.category ?? 'INDIVIDUAL';
    return {
      asOf: now.toISOString(),
      volume: {
        today: bucket(s, f, 'today'),
        last7d: bucket(s, f, 'last7d'),
        last30d: bucket(s, f, 'last30d'),
        thisMonth: bucket(s, f, 'thisMonth'),
        previousMonth: bucket(s, f, 'previousMonth'),
        excludedNonUsdtFills: s.excluded,
      },
      tax: {
        taxMode: this.config.tax.mode,
        category,
        thisMonth: { month: w.thisMonthLabel, withheldCount: t.thisN, withheldAmount: toFixedStr(dec(t.thisSum)) },
        previousMonth: { month: w.previousMonthLabel, withheldCount: t.prevN, withheldAmount: toFixedStr(dec(t.prevSum)) },
      },
    };
  }
}
