import { and, asc, eq, gte, isNotNull, type SQL } from 'drizzle-orm';
import type { PnlAnalysis, PnlRange } from '@cex/contracts';
import { ZERO, dec, toFixedStr, type Dec } from '@cex/core';
import { futuresFundingPayments, futuresPositions, futuresTrades, portfolioSnapshots, trades } from '../../db/schema.ts';
import type { Db } from '../../db/client.ts';

const DAY = 86_400_000;
const GMT7 = 7 * 3_600_000;
const RANGE_DAYS: Record<Exclude<PnlRange, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 };

/** Calendar day in GMT+7, e.g. "2026-10-09". */
export const gmt7Day = (d: Date) => new Date(d.getTime() + GMT7).toISOString().slice(0, 10);

interface Closed {
  market: 'SPOT' | 'FUTURES';
  symbol: string;
  pnl: Dec;
}

/**
 * Realized PnL analysis (read-only):
 *  - spot: trades.realized_pnl (SELL fills vs the average cost, already net of fees);
 *  - futures: closing-fill PnL − fees of every fill + funding payments, by day;
 *  - win rate etc. over "closed trades" = spot SELL orders with a cost basis + closed futures positions.
 */
export class PnlService {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async analyze(userId: string, range: PnlRange): Promise<PnlAnalysis> {
    const to = this.now();
    const todayStart = Date.parse(`${gmt7Day(to)}T00:00:00.000Z`) - GMT7;
    const from = range === 'all' ? null : new Date(todayStart - (RANGE_DAYS[range] - 1) * DAY);
    const since = (col: Parameters<typeof gte>[0]): SQL[] => (from ? [gte(col, from)] : []);

    const spot = await this.db
      .select({ orderId: trades.orderId, symbol: trades.symbol, pnl: trades.realizedPnl, tax: trades.tax, at: trades.createdAt })
      .from(trades)
      .where(and(eq(trades.userId, userId), isNotNull(trades.realizedPnl), ...since(trades.createdAt)));
    const fFills = await this.db
      .select({ pnl: futuresTrades.realizedPnl, fee: futuresTrades.fee, at: futuresTrades.createdAt })
      .from(futuresTrades)
      .where(and(eq(futuresTrades.userId, userId), ...since(futuresTrades.createdAt)));
    const fFunding = await this.db
      .select({ amount: futuresFundingPayments.amount, at: futuresFundingPayments.createdAt })
      .from(futuresFundingPayments)
      .where(and(eq(futuresFundingPayments.userId, userId), ...since(futuresFundingPayments.createdAt)));
    const fClosed = await this.db
      .select()
      .from(futuresPositions)
      .where(and(eq(futuresPositions.userId, userId), eq(futuresPositions.status, 'CLOSED'), ...since(futuresPositions.closedAt)));

    // ── daily buckets (every day of the range, oldest first)
    const days = new Map<string, { spot: Dec; futures: Dec }>();
    const firstActivity = [...spot.map((r) => r.at), ...fFills.map((r) => r.at), ...fFunding.map((r) => r.at)].reduce<Date | null>((a, d) => (a === null || d < a ? d : a), null);
    const start = from ?? new Date(Date.parse(`${gmt7Day(firstActivity ?? to)}T00:00:00.000Z`) - GMT7);
    for (let t = start.getTime(); t <= to.getTime(); t += DAY) days.set(gmt7Day(new Date(t)), { spot: ZERO, futures: ZERO });
    const add = (at: Date, key: 'spot' | 'futures', v: Dec) => {
      const d = days.get(gmt7Day(at));
      if (d) d[key] = d[key].add(v);
    };
    let spotTotal = ZERO;
    let spotTax = ZERO;
    let fees = ZERO;
    let funding = ZERO;
    let futPnl = ZERO;
    for (const r of spot) {
      const v = dec(r.pnl!);
      spotTotal = spotTotal.add(v);
      spotTax = spotTax.add(dec(r.tax));
      add(r.at, 'spot', v);
    }
    for (const r of fFills) {
      const v = dec(r.pnl).sub(dec(r.fee));
      futPnl = futPnl.add(dec(r.pnl));
      fees = fees.add(dec(r.fee));
      add(r.at, 'futures', v);
    }
    for (const r of fFunding) {
      funding = funding.add(dec(r.amount));
      add(r.at, 'futures', dec(r.amount));
    }
    const futuresTotal = futPnl.sub(fees).add(funding);
    let cum = ZERO;
    const daily = [...days.entries()].map(([date, d]) => {
      const total = d.spot.add(d.futures);
      cum = cum.add(total);
      return { date, spot: toFixedStr(d.spot), futures: toFixedStr(d.futures), total: toFixedStr(total), cumulative: toFixedStr(cum) };
    });

    // ── closed trades
    const bySpotOrder = new Map<number, Closed>();
    for (const r of spot) {
      const c = bySpotOrder.get(r.orderId) ?? { market: 'SPOT' as const, symbol: r.symbol, pnl: ZERO };
      c.pnl = c.pnl.add(dec(r.pnl!));
      bySpotOrder.set(r.orderId, c);
    }
    const closed: Closed[] = [
      ...bySpotOrder.values(),
      ...fClosed.map((p) => ({ market: 'FUTURES' as const, symbol: p.symbol, pnl: dec(p.realizedPnl).sub(dec(p.fees)).add(dec(p.funding)) })),
    ];
    const winsList = closed.filter((c) => c.pnl.gt(0));
    const lossList = closed.filter((c) => c.pnl.lt(0));
    const sum = (l: Closed[]) => l.reduce((a, c) => a.add(c.pnl), ZERO);
    const grossWin = sum(winsList);
    const grossLoss = sum(lossList);
    const pick = (l: Closed[], better: (a: Dec, b: Dec) => boolean) => (l.length ? l.reduce((a, c) => (better(c.pnl, a) ? c.pnl : a), l[0]!.pnl) : null);
    const largestWin = pick(winsList, (a, b) => a.gt(b));
    const largestLoss = pick(lossList, (a, b) => a.lt(b));

    const bySymbol = new Map<string, { market: 'SPOT' | 'FUTURES'; symbol: string; realized: Dec; trades: number; wins: number }>();
    for (const c of closed) {
      const k = `${c.market}|${c.symbol}`;
      const s = bySymbol.get(k) ?? { market: c.market, symbol: c.symbol, realized: ZERO, trades: 0, wins: 0 };
      s.realized = s.realized.add(c.pnl);
      s.trades++;
      if (c.pnl.gt(0)) s.wins++;
      bySymbol.set(k, s);
    }

    return {
      range,
      from: from?.toISOString() ?? null,
      to: to.toISOString(),
      totalRealized: toFixedStr(spotTotal.add(futuresTotal)),
      spotRealized: toFixedStr(spotTotal),
      spotTax: toFixedStr(spotTax),
      futuresRealized: toFixedStr(futuresTotal),
      futuresFees: toFixedStr(fees.neg()),
      futuresFunding: toFixedStr(funding),
      daily,
      trades: {
        count: closed.length,
        wins: winsList.length,
        losses: lossList.length,
        winRate: closed.length ? dec(String(winsList.length)).div(closed.length).toDecimalPlaces(4).toFixed() : null,
        avgWin: winsList.length ? toFixedStr(grossWin.div(winsList.length).toDecimalPlaces(8)) : null,
        avgLoss: lossList.length ? toFixedStr(grossLoss.div(lossList.length).toDecimalPlaces(8)) : null,
        largestWin: largestWin ? toFixedStr(largestWin) : null,
        largestLoss: largestLoss ? toFixedStr(largestLoss) : null,
        profitFactor: lossList.length ? grossWin.div(grossLoss.abs()).toDecimalPlaces(4).toFixed() : null,
      },
      bySymbol: [...bySymbol.values()].sort((a, b) => b.realized.cmp(a.realized)).map((s) => ({ ...s, realized: toFixedStr(s.realized) })),
      maxDrawdown: await this.maxDrawdown(userId, from),
    };
  }

  /** Largest peak-to-trough fall of the spot account value (hourly snapshots); null without data. */
  private async maxDrawdown(userId: string, from: Date | null): Promise<string | null> {
    const rows = await this.db
      .select({ v: portfolioSnapshots.totalValueUsdt })
      .from(portfolioSnapshots)
      .where(and(eq(portfolioSnapshots.userId, userId), isNotNull(portfolioSnapshots.totalValueUsdt), ...(from ? [gte(portfolioSnapshots.time, from)] : [])))
      .orderBy(asc(portfolioSnapshots.time));
    if (rows.length < 2) return null;
    let peak = ZERO;
    let worst = ZERO;
    for (const r of rows) {
      const v = dec(r.v!);
      if (v.gt(peak)) peak = v;
      if (peak.gt(0)) {
        const dd = peak.sub(v).div(peak);
        if (dd.gt(worst)) worst = dd;
      }
    }
    return worst.toDecimalPlaces(4).toFixed();
  }
}
