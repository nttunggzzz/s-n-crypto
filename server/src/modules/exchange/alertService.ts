import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import type { PriceAlert } from '@cex/contracts';
import { AMOUNT_SCALE, dec, hasAtMostScale, toFixedStr, type Dec } from '@cex/core';
import { priceAlerts } from '../../db/schema.ts';
import type { Db } from '../../db/client.ts';
import { AppError } from '../../lib/errors.ts';
import type { MarketDataService } from '../market/marketData.ts';
import type { AlertRow, ExchangeEvents } from './events.ts';
import type { ExchangeConfig } from './exchangeConfig.ts';
import type { NotificationService } from './notificationService.ts';
import { Outcome } from './outcome.ts';
import type { OpenOrderIndex } from './openOrderIndex.ts';

export const MAX_ACTIVE_ALERTS = 50;

interface Entry {
  id: number;
  condition: 'ABOVE' | 'BELOW';
  target: Dec;
}

export function serializeAlert(a: AlertRow): PriceAlert {
  return {
    id: String(a.id),
    symbol: a.symbol,
    condition: a.condition,
    targetPrice: toFixedStr(dec(a.targetPrice)),
    note: a.note,
    status: a.status,
    triggeredPrice: a.triggeredPrice === null ? null : toFixedStr(dec(a.triggeredPrice)),
    triggeredAt: a.triggeredAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}

/** Price alerts: fire once when a Binance trade reaches the target (checked by the Matcher). */
export class AlertService {
  private readonly bySymbol = new Map<string, Map<number, Entry>>();

  constructor(
    private readonly db: Db,
    private readonly config: ExchangeConfig,
    private readonly market: MarketDataService,
    private readonly notifications: NotificationService,
    private readonly events: ExchangeEvents,
    private readonly orderIndex: OpenOrderIndex,
  ) {}

  private add(a: AlertRow): void {
    let m = this.bySymbol.get(a.symbol);
    if (!m) this.bySymbol.set(a.symbol, (m = new Map()));
    m.set(a.id, { id: a.id, condition: a.condition, target: dec(a.targetPrice) });
  }

  size(symbol: string): number {
    return this.bySymbol.get(symbol)?.size ?? 0;
  }

  async load(): Promise<number> {
    this.bySymbol.clear();
    const rows = await this.db.select().from(priceAlerts).where(eq(priceAlerts.status, 'ACTIVE'));
    for (const r of rows) this.add(r);
    return rows.length;
  }

  async list(userId: string, status?: AlertRow['status']): Promise<PriceAlert[]> {
    const where: SQL[] = [eq(priceAlerts.userId, userId)];
    if (status) where.push(eq(priceAlerts.status, status));
    const rows = await this.db
      .select()
      .from(priceAlerts)
      .where(and(...where))
      .orderBy(desc(priceAlerts.id))
      .limit(500);
    return rows.map(serializeAlert);
  }

  async create(userId: string, input: { symbol: string; condition: 'ABOVE' | 'BELOW'; targetPrice: string; note?: string }): Promise<PriceAlert> {
    if (!this.config.findSymbol(input.symbol)) throw new AppError('NOT_FOUND', `Unknown symbol ${input.symbol}`);
    const target = dec(input.targetPrice);
    if (!hasAtMostScale(target, AMOUNT_SCALE)) throw new AppError('INVALID_PRICE', `targetPrice allows at most ${AMOUNT_SCALE} decimals`);
    const last = this.market.livePrice(input.symbol);
    if (!last) throw new AppError('MARKET_DATA_STALE', `No live price for ${input.symbol}`);
    if (input.condition === 'ABOVE' ? target.lte(last) : target.gte(last)) {
      throw new AppError('INVALID_PRICE', 'Target already reached', { lastPrice: toFixedStr(last) });
    }
    const [{ n }] = (await this.db
      .select({ n: count() })
      .from(priceAlerts)
      .where(and(eq(priceAlerts.userId, userId), eq(priceAlerts.status, 'ACTIVE')))) as [{ n: number }];
    if (n >= MAX_ACTIVE_ALERTS) throw new AppError('LIMIT_EXCEEDED', `At most ${MAX_ACTIVE_ALERTS} active alerts`, { limit: MAX_ACTIVE_ALERTS });
    const [row] = await this.db
      .insert(priceAlerts)
      .values({ userId, symbol: input.symbol, condition: input.condition, targetPrice: toFixedStr(target), note: input.note || null })
      .returning();
    this.add(row!);
    return serializeAlert(row!);
  }

  async cancel(userId: string, alertId: string): Promise<PriceAlert> {
    const id = Number(alertId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new AppError('NOT_FOUND', 'Alert not found');
    const [row] = await this.db
      .update(priceAlerts)
      .set({ status: 'CANCELED' })
      .where(and(eq(priceAlerts.id, id), eq(priceAlerts.userId, userId), eq(priceAlerts.status, 'ACTIVE')))
      .returning();
    if (row) {
      this.bySymbol.get(row.symbol)?.delete(row.id);
      return serializeAlert(row);
    }
    const [existing] = await this.db
      .select()
      .from(priceAlerts)
      .where(and(eq(priceAlerts.id, id), eq(priceAlerts.userId, userId)));
    if (!existing) throw new AppError('NOT_FOUND', 'Alert not found');
    return serializeAlert(existing); // already triggered/canceled: idempotent
  }

  /** Fires every active alert reached by trades in [low, high]. Idempotent per alert. */
  async processWindow(symbol: string, low: Dec, high: Dec, eventAt: Date): Promise<number> {
    const m = this.bySymbol.get(symbol);
    if (!m || m.size === 0) return 0;
    let fired = 0;
    for (const e of [...m.values()]) {
      const reached = e.condition === 'ABOVE' ? high.gte(e.target) : low.lte(e.target);
      if (!reached) continue;
      const price = e.condition === 'ABOVE' ? high : low;
      const out = new Outcome();
      const row = await this.db.transaction(async (tx) => {
        const [r] = await tx
          .update(priceAlerts)
          .set({ status: 'TRIGGERED', triggeredPrice: toFixedStr(price), triggeredAt: eventAt })
          .where(and(eq(priceAlerts.id, e.id), eq(priceAlerts.status, 'ACTIVE')))
          .returning();
        if (!r) return null;
        await this.notifications.create(tx, out, r.userId, {
          type: 'PRICE_ALERT',
          alertId: String(r.id),
          symbol,
          condition: r.condition,
          targetPrice: toFixedStr(dec(r.targetPrice)),
          lastPrice: toFixedStr(price),
        });
        return r;
      });
      m.delete(e.id);
      if (!row) continue;
      fired++;
      this.events.emit('alert', row.userId, row);
      await out.apply(this.db, this.orderIndex, this.events);
    }
    return fired;
  }
}
