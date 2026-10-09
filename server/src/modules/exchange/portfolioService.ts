import { and, asc, eq, gte, sql } from 'drizzle-orm';
import type { Portfolio, PortfolioHistory, PortfolioRange, Position } from '@cex/contracts';
import { dec, toFixedStr, ZERO, type Dec } from '@cex/core';
import { balances, portfolioSnapshots, positions, trades, users } from '../../db/schema.ts';
import type { Db } from '../../db/client.ts';
import { logger } from '../../logger.ts';
import type { MarketDataService } from '../market/marketData.ts';
import { getBalances } from './ledger.ts';

const HOUR = 3_600_000;
const RANGE_HOURS: Record<Exclude<PortfolioRange, 'all'>, number> = { '24h': 24, '7d': 168, '30d': 720, '90d': 2160 };
const pct = (d: Dec) => d.toDecimalPlaces(2).toFixed(2);

export class PortfolioService {
  private timer: NodeJS.Timeout | undefined;
  private lastBucket = 0;

  constructor(
    private readonly db: Db,
    private readonly market: MarketDataService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** USDT price of one unit, or null when there is no live price. */
  private priceOf(asset: string): Dec | null {
    return asset === 'USDT' ? dec('1') : this.market.livePrice(`${asset}USDT`);
  }

  async get(userId: string): Promise<Portfolio> {
    const [bals, pos, [fees]] = await Promise.all([
      getBalances(this.db, userId),
      this.db.select().from(positions).where(eq(positions.userId, userId)),
      this.db
        .select({ usdt: sql<string>`coalesce(sum(case when ${trades.feeAsset} = 'USDT' then ${trades.fee} else ${trades.fee} * ${trades.price} end), 0)` })
        .from(trades)
        .where(eq(trades.userId, userId)),
    ]);
    const qtyOf = new Map(bals.map((b) => [b.asset, dec(b.available).add(dec(b.locked))]));
    const posOf = new Map(pos.map((p) => [p.asset, p]));
    const assets = [...new Set([...qtyOf.keys(), ...posOf.keys()])].sort();

    const rows: (Omit<Position, 'allocationPercent'> & { mv: Dec | null; unreal: Dec | null; realized: Dec })[] = [];
    for (const asset of assets) {
      const qty = qtyOf.get(asset) ?? ZERO;
      const p = posOf.get(asset);
      const realized = p ? dec(p.realizedPnl) : ZERO;
      if (qty.isZero() && realized.isZero()) continue;
      const avg = asset !== 'USDT' && p?.avgCost && qty.gt(0) ? dec(p.avgCost) : null;
      const price = this.priceOf(asset);
      const mv = price ? qty.mul(price) : null;
      const cost = avg ? qty.mul(avg) : null;
      const unreal = mv && cost ? mv.sub(cost) : null;
      rows.push({
        asset,
        quantity: toFixedStr(qty),
        avgCost: avg ? toFixedStr(avg) : null,
        costBasis: cost ? toFixedStr(cost) : null,
        marketPrice: price ? toFixedStr(price) : null,
        marketValue: mv ? toFixedStr(mv) : null,
        unrealizedPnl: unreal ? toFixedStr(unreal) : null,
        unrealizedPnlPercent: unreal && cost && cost.gt(0) ? pct(unreal.div(cost).mul(100)) : null,
        realizedPnl: toFixedStr(realized),
        mv,
        unreal,
        realized,
      });
    }
    const total = rows.reduce((s, r) => (r.mv ? s.add(r.mv) : s), ZERO);
    const unrealList = rows.filter((r) => r.unreal !== null).map((r) => r.unreal!);
    return {
      positions: rows.map(({ mv, unreal: _u, realized: _r, ...r }) => ({ ...r, allocationPercent: mv && total.gt(0) ? pct(mv.div(total).mul(100)) : null })),
      totalValueUsdt: toFixedStr(total),
      totalUnrealizedPnl: unrealList.length ? toFixedStr(unrealList.reduce((s, x) => s.add(x), ZERO)) : null,
      totalRealizedPnl: toFixedStr(rows.reduce((s, r) => s.add(r.realized), ZERO)),
      totalFeesUsdt: toFixedStr(dec(fees?.usdt ?? '0')),
      unpricedAssets: rows.filter((r) => r.mv === null && dec(r.quantity).gt(0)).map((r) => r.asset),
      asOf: this.now().toISOString(),
    };
  }

  async history(userId: string, range: PortfolioRange): Promise<PortfolioHistory> {
    const where = [eq(portfolioSnapshots.userId, userId)];
    if (range !== 'all') where.push(gte(portfolioSnapshots.time, new Date(this.now().getTime() - RANGE_HOURS[range] * HOUR)));
    const rows = await this.db
      .select({ time: portfolioSnapshots.time, v: portfolioSnapshots.totalValueUsdt })
      .from(portfolioSnapshots)
      .where(and(...where))
      .orderBy(asc(portfolioSnapshots.time));
    const daily = range === '30d' || range === '90d' || range === 'all';
    return {
      range,
      points: rows.filter((r) => !daily || r.time.getUTCHours() === 0).map((r) => ({ time: r.time.toISOString(), totalValueUsdt: r.v === null ? null : toFixedStr(dec(r.v)) })),
    };
  }

  /**
   * Records every user's account value for the hour bucket containing `at` (idempotent).
   * A user's value is stored as null when any held asset has no live price — never guessed.
   */
  async snapshotAll(at: Date = this.now()): Promise<number> {
    const bucket = new Date(Math.floor(at.getTime() / HOUR) * HOUR);
    const rows = await this.db
      .select({ userId: balances.userId, asset: balances.asset, available: balances.available, locked: balances.locked })
      .from(balances)
      .innerJoin(users, eq(users.id, balances.userId))
      .where(eq(users.isBot, false));
    const byUser = new Map<string, { total: Dec; complete: boolean }>();
    for (const r of rows) {
      const qty = dec(r.available).add(dec(r.locked));
      const acc = byUser.get(r.userId) ?? { total: ZERO, complete: true };
      if (qty.gt(0)) {
        const price = this.priceOf(r.asset);
        if (price) acc.total = acc.total.add(qty.mul(price));
        else acc.complete = false;
      }
      byUser.set(r.userId, acc);
    }
    if (byUser.size === 0) return 0;
    await this.db
      .insert(portfolioSnapshots)
      .values([...byUser].map(([userId, v]) => ({ userId, time: bucket, totalValueUsdt: v.complete ? toFixedStr(v.total) : null, takenAt: at })))
      .onConflictDoNothing();
    return byUser.size;
  }

  /** Takes the snapshot once per hour, within the first 5 minutes of the hour (so the label is honest). */
  startHourly(): void {
    this.timer = setInterval(() => {
      const t = this.now().getTime();
      const bucket = Math.floor(t / HOUR) * HOUR;
      if (bucket === this.lastBucket || t - bucket > 5 * 60_000) return;
      this.lastBucket = bucket;
      void this.snapshotAll(new Date(t)).catch((err) => logger.error({ err }, 'portfolio snapshot failed'));
    }, 30_000);
    this.timer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
  }
}
