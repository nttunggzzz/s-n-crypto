import { sql } from 'drizzle-orm';
import { type AdminMetrics, type AdminMetricsQuery, type MetricsDay } from '@cex/contracts';
import { dec, toFixedStr, type Dec } from '@cex/core';
import type { Db } from '../../db/client.ts';
import { vnDayStart } from '../tax/period.ts';

const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;
const ZERO = dec('0');

/** The Vietnam (GMT+7) date label of a timestamptz column: same day boundary as `vnDayStart`. */
const day = (col: string) => sql.raw(`to_char((${col} at time zone 'UTC') + interval '7 hours', 'YYYY-MM-DD')`);

const asTimestamptz = (d: Date) => sql`${d.toISOString()}::timestamptz`;

/**
 * Exchange numbers per Vietnam calendar day (`adminMetrics`), read-only. Four grouped queries over the range
 * (`trades`+`symbols`+`users`, `futures_trades`+`users`, `users`, `futures_positions`+`users`) plus one for the distinct
 * traders; every day of the range is present, a day without rows is all zeros. Signal-bot accounts (`users.is_bot`) are left
 * out of every number. A Spot fee paid in the base coin is valued at the price of its own fill (as `portfolioService`
 * does); Spot volume, fees and tax only count USDT-quoted pairs - other fills are counted in `excludedNonUsdtFills`.
 */
export class AdminMetricsService {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async metrics(q: AdminMetricsQuery): Promise<AdminMetrics> {
    const t = this.now();
    const n = q.range === '7d' ? 7 : q.range === '30d' ? 30 : 90;
    const first = new Date(vnDayStart(t).getTime() - (n - 1) * DAY_MS);
    const [from, to] = [asTimestamptz(first), asTimestamptz(t)];

    const [spot, fut, newUsers, liq, traders] = await Promise.all([
      this.db.execute<{ d: string; volume: string; fees: string; tax: string; excluded: number }>(sql`
        SELECT ${day('t.created_at')} AS d,
               coalesce(sum(t.quote_qty) FILTER (WHERE s.quote_asset = 'USDT'), 0)::text AS volume,
               coalesce(sum(CASE WHEN t.fee_asset = 'USDT' THEN t.fee ELSE t.fee * t.price END) FILTER (WHERE s.quote_asset = 'USDT'), 0)::text AS fees,
               coalesce(sum(t.tax) FILTER (WHERE s.quote_asset = 'USDT'), 0)::text AS tax,
               (count(*) FILTER (WHERE s.quote_asset IS DISTINCT FROM 'USDT'))::int AS excluded
        FROM trades t
        JOIN users u ON u.id = t.user_id
        LEFT JOIN symbols s ON s.symbol = t.symbol
        WHERE NOT u.is_bot AND t.created_at >= ${from} AND t.created_at <= ${to}
        GROUP BY 1`),
      this.db.execute<{ d: string; volume: string; fees: string }>(sql`
        SELECT ${day('t.created_at')} AS d, coalesce(sum(t.quote_qty), 0)::text AS volume, coalesce(sum(t.fee), 0)::text AS fees
        FROM futures_trades t
        JOIN users u ON u.id = t.user_id
        WHERE NOT u.is_bot AND t.created_at >= ${from} AND t.created_at <= ${to}
        GROUP BY 1`),
      this.db.execute<{ d: string; n: number }>(sql`
        SELECT ${day('u.created_at')} AS d, count(*)::int AS n
        FROM users u
        WHERE NOT u.is_bot AND u.created_at >= ${from} AND u.created_at <= ${to}
        GROUP BY 1`),
      this.db.execute<{ d: string; n: number }>(sql`
        SELECT ${day('p.closed_at')} AS d, count(*)::int AS n
        FROM futures_positions p
        JOIN users u ON u.id = p.user_id
        WHERE NOT u.is_bot AND p.status = 'CLOSED' AND p.close_reason = 'LIQUIDATION' AND p.closed_at >= ${from} AND p.closed_at <= ${to}
        GROUP BY 1`),
      // d IS NULL is the grand total: distinct users over the whole range (not the sum of the days)
      this.db.execute<{ d: string | null; n: number }>(sql`
        SELECT x.d, count(DISTINCT x.user_id)::int AS n
        FROM (
          SELECT t.user_id, ${day('t.created_at')} AS d FROM trades t JOIN users u ON u.id = t.user_id
            WHERE NOT u.is_bot AND t.created_at >= ${from} AND t.created_at <= ${to}
          UNION ALL
          SELECT t.user_id, ${day('t.created_at')} AS d FROM futures_trades t JOIN users u ON u.id = t.user_id
            WHERE NOT u.is_bot AND t.created_at >= ${from} AND t.created_at <= ${to}
        ) x
        GROUP BY GROUPING SETS ((x.d), ())`),
    ]);

    const spotBy = new Map(spot.rows.map((r) => [r.d, r]));
    const futBy = new Map(fut.rows.map((r) => [r.d, r]));
    const usersBy = new Map(newUsers.rows.map((r) => [r.d, r.n]));
    const liqBy = new Map(liq.rows.map((r) => [r.d, r.n]));
    const tradersBy = new Map(traders.rows.filter((r) => r.d !== null).map((r) => [r.d as string, r.n]));
    const distinctTraders = traders.rows.find((r) => r.d === null)?.n ?? 0;

    const days: MetricsDay[] = [];
    const sums = { spotVolume: ZERO, futuresVolume: ZERO, spotFees: ZERO, futuresFees: ZERO, taxWithheld: ZERO } satisfies Record<string, Dec>;
    let newTotal = 0;
    let liqTotal = 0;
    for (let i = 0; i < n; i++) {
      const date = new Date(first.getTime() + i * DAY_MS + VN_OFFSET_MS).toISOString().slice(0, 10);
      const s = spotBy.get(date);
      const f = futBy.get(date);
      const row: MetricsDay = {
        date,
        spotVolume: toFixedStr(dec(s?.volume ?? '0')),
        futuresVolume: toFixedStr(dec(f?.volume ?? '0')),
        spotFees: toFixedStr(dec(s?.fees ?? '0')),
        futuresFees: toFixedStr(dec(f?.fees ?? '0')),
        taxWithheld: toFixedStr(dec(s?.tax ?? '0')),
        newUsers: usersBy.get(date) ?? 0,
        activeTraders: tradersBy.get(date) ?? 0,
        liquidations: liqBy.get(date) ?? 0,
      };
      days.push(row);
      // totals add the exact SQL sums, not the already-rounded day strings
      sums.spotVolume = sums.spotVolume.add(dec(s?.volume ?? '0'));
      sums.futuresVolume = sums.futuresVolume.add(dec(f?.volume ?? '0'));
      sums.spotFees = sums.spotFees.add(dec(s?.fees ?? '0'));
      sums.futuresFees = sums.futuresFees.add(dec(f?.fees ?? '0'));
      sums.taxWithheld = sums.taxWithheld.add(dec(s?.tax ?? '0'));
      newTotal += row.newUsers;
      liqTotal += row.liquidations;
    }
    return {
      range: q.range,
      from: first.toISOString(),
      to: t.toISOString(),
      days,
      totals: {
        spotVolume: toFixedStr(sums.spotVolume),
        futuresVolume: toFixedStr(sums.futuresVolume),
        spotFees: toFixedStr(sums.spotFees),
        futuresFees: toFixedStr(sums.futuresFees),
        taxWithheld: toFixedStr(sums.taxWithheld),
        newUsers: newTotal,
        activeTraders: distinctTraders,
        liquidations: liqTotal,
      },
      excludedNonUsdtFills: spot.rows.reduce((a, r) => a + r.excluded, 0),
    };
  }
}
