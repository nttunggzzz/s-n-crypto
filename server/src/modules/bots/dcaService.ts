import { and, asc, count, desc, eq, inArray, lt, lte, ne } from 'drizzle-orm';
import type { DcaPlan, DcaRun } from '@cex/contracts';
import { ZERO, dec, toFixedStr } from '@cex/core';
import { dcaPlans, dcaRuns, notifications } from '../../db/schema.ts';
import type { Db, Tx } from '../../db/client.ts';
import { AppError } from '../../lib/errors.ts';
import { logger } from '../../logger.ts';
import type { Exchange } from '../exchange/index.ts';
import type { BotsEvents } from './events.ts';

export type PlanRow = typeof dcaPlans.$inferSelect;
type RunRow = typeof dcaRuns.$inferSelect;
export const MAX_ACTIVE_DCA_PLANS = 20;
const GMT7 = 7 * 3_600_000;
const DAY = 86_400_000;

/**
 * Next run strictly after `after`, at `hour`:00 GMT+7 (WEEKLY: dayOfWeek 1 = Monday … 7 = Sunday;
 * MONTHLY: dayOfMonth 1–28). Missed runs are not caught up: the next one is always in the future.
 */
export function nextRunAt(p: Pick<PlanRow, 'interval' | 'hour' | 'dayOfWeek' | 'dayOfMonth'>, after: Date): Date {
  const local = new Date(after.getTime() + GMT7); // wall clock in GMT+7, read with getUTC*
  const at = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, p.hour) - GMT7);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  if (p.interval === 'DAILY') {
    const c = at(y, m, d);
    return c > after ? c : at(y, m, d + 1);
  }
  if (p.interval === 'WEEKLY') {
    const today = ((local.getUTCDay() + 6) % 7) + 1; // 1 = Monday
    const c = at(y, m, d + ((p.dayOfWeek! - today + 7) % 7));
    return c > after ? c : new Date(c.getTime() + 7 * DAY);
  }
  const c = at(y, m, p.dayOfMonth!);
  return c > after ? c : at(y, m + 1, p.dayOfMonth!);
}

export function serializeDcaPlan(p: PlanRow): DcaPlan {
  const bought = dec(p.totalBought);
  return {
    id: String(p.id),
    symbol: p.symbol,
    quoteAmount: toFixedStr(dec(p.quoteAmount)),
    interval: p.interval,
    hour: p.hour,
    dayOfWeek: p.dayOfWeek,
    dayOfMonth: p.dayOfMonth,
    status: p.status,
    nextRunAt: p.nextRunAt?.toISOString() ?? null,
    lastRunAt: p.lastRunAt?.toISOString() ?? null,
    runs: p.runs,
    skipped: p.skipped,
    totalSpent: toFixedStr(dec(p.totalSpent)),
    totalBought: toFixedStr(bought),
    avgPrice: bought.isZero() ? null : dec(p.totalSpent).div(bought).toDecimalPlaces(8).toFixed(),
    createdAt: p.createdAt.toISOString(),
  };
}

export function serializeDcaRun(r: RunRow): DcaRun {
  return {
    id: String(r.id),
    planId: String(r.planId),
    scheduledAt: r.scheduledAt.toISOString(),
    executedAt: r.executedAt?.toISOString() ?? null,
    status: r.status === 'FILLED' ? 'FILLED' : 'SKIPPED',
    orderId: r.orderId === null ? null : String(r.orderId),
    quoteSpent: toFixedStr(dec(r.quoteSpent)),
    baseBought: toFixedStr(dec(r.baseBought)),
    price: r.price === null ? null : dec(r.price).toFixed(),
    reason: r.reason,
  };
}

/**
 * Recurring buys: a market BUY of `quoteAmount` USDT through the normal spot engine (order source
 * DCA). Each scheduled time is claimed once (unique plan + scheduledAt) before the order is placed,
 * so a run can never execute twice; a failed buy is recorded as SKIPPED with the error code.
 */
export class DcaService {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly db: Db,
    private readonly ex: Exchange,
    private readonly events: BotsEvents,
    private readonly now: () => Date = () => new Date(),
  ) {}

  start(intervalMs = 30_000): void {
    this.timer = setInterval(() => void this.runDue().catch((err) => logger.error({ err }, 'dca run failed')), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
  }

  async list(userId: string): Promise<DcaPlan[]> {
    const rows = await this.db
      .select()
      .from(dcaPlans)
      .where(and(eq(dcaPlans.userId, userId), ne(dcaPlans.status, 'CANCELED')))
      .orderBy(desc(dcaPlans.id));
    return rows.map(serializeDcaPlan);
  }

  private async own(userId: string, planId: string): Promise<PlanRow> {
    const [p] = await this.db
      .select()
      .from(dcaPlans)
      .where(and(eq(dcaPlans.id, Number(planId)), eq(dcaPlans.userId, userId)));
    if (!p) throw new AppError('NOT_FOUND', 'Plan not found');
    return p;
  }

  async create(userId: string, input: { symbol: string; quoteAmount: string; interval: PlanRow['interval']; hour: number; dayOfWeek?: number; dayOfMonth?: number }): Promise<DcaPlan> {
    const sym = this.ex.config.findSymbol(input.symbol);
    if (!sym) throw new AppError('NOT_FOUND', `Unknown symbol ${input.symbol}`);
    if (sym.row.quoteAsset !== 'USDT') throw new AppError('VALIDATION_ERROR', 'Recurring buys are paid in USDT', { field: 'symbol' });
    const amount = dec(input.quoteAmount);
    if (amount.decimalPlaces() > 8) throw new AppError('VALIDATION_ERROR', 'quoteAmount allows at most 8 decimals', { field: 'quoteAmount' });
    if (amount.lt(dec(sym.row.minNotional))) throw new AppError('NOTIONAL_TOO_SMALL', `Minimum is ${dec(sym.row.minNotional).toFixed()} USDT per buy`, { minNotional: dec(sym.row.minNotional).toFixed() });
    const [n] = await this.db
      .select({ n: count() })
      .from(dcaPlans)
      .where(and(eq(dcaPlans.userId, userId), ne(dcaPlans.status, 'CANCELED')));
    if ((n?.n ?? 0) >= MAX_ACTIVE_DCA_PLANS) throw new AppError('LIMIT_EXCEEDED', `At most ${MAX_ACTIVE_DCA_PLANS} recurring buys`, { limit: MAX_ACTIVE_DCA_PLANS });
    const base = { interval: input.interval, hour: input.hour, dayOfWeek: input.interval === 'WEEKLY' ? input.dayOfWeek! : null, dayOfMonth: input.interval === 'MONTHLY' ? input.dayOfMonth! : null };
    const [p] = await this.db
      .insert(dcaPlans)
      .values({ userId, symbol: input.symbol, quoteAmount: toFixedStr(amount), ...base, status: 'ACTIVE', nextRunAt: nextRunAt(base, this.now()), createdAt: this.now(), updatedAt: this.now() })
      .returning();
    return this.publish(p!);
  }

  async update(userId: string, planId: string, patch: { quoteAmount?: string; status?: 'ACTIVE' | 'PAUSED' }): Promise<DcaPlan> {
    const cur = await this.own(userId, planId);
    if (cur.status === 'CANCELED') throw new AppError('CONFLICT', 'Plan is canceled');
    const set: Partial<PlanRow> = { updatedAt: this.now() };
    if (patch.quoteAmount !== undefined) {
      const sym = this.ex.config.findSymbol(cur.symbol);
      const a = dec(patch.quoteAmount);
      if (a.decimalPlaces() > 8) throw new AppError('VALIDATION_ERROR', 'quoteAmount allows at most 8 decimals', { field: 'quoteAmount' });
      if (sym && a.lt(dec(sym.row.minNotional))) throw new AppError('NOTIONAL_TOO_SMALL', `Minimum is ${dec(sym.row.minNotional).toFixed()} USDT per buy`);
      set.quoteAmount = toFixedStr(a);
    }
    if (patch.status === 'PAUSED') Object.assign(set, { status: 'PAUSED', nextRunAt: null });
    if (patch.status === 'ACTIVE' && cur.status !== 'ACTIVE') Object.assign(set, { status: 'ACTIVE', nextRunAt: nextRunAt(cur, this.now()) });
    const [p] = await this.db.update(dcaPlans).set(set).where(eq(dcaPlans.id, cur.id)).returning();
    return this.publish(p!);
  }

  async cancel(userId: string, planId: string): Promise<DcaPlan> {
    const cur = await this.own(userId, planId);
    const [p] = await this.db.update(dcaPlans).set({ status: 'CANCELED', nextRunAt: null, updatedAt: this.now() }).where(eq(dcaPlans.id, cur.id)).returning();
    return this.publish(p!);
  }

  /** Admin cancel: `audit` runs in the transaction that cancels the plan (invariant 13). */
  async adminCancel(userId: string, planId: string, audit: (tx: Tx, plan: PlanRow) => Promise<unknown>): Promise<DcaPlan> {
    const cur = await this.own(userId, planId);
    const p = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(dcaPlans)
        .set({ status: 'CANCELED', nextRunAt: null, updatedAt: this.now() })
        .where(and(eq(dcaPlans.id, cur.id), ne(dcaPlans.status, 'CANCELED')))
        .returning();
      if (!row) throw new AppError('CONFLICT', 'The plan is already canceled');
      await audit(tx, cur);
      return row;
    });
    return this.publish(p);
  }

  async runs(userId: string, planId: string, cursor: string | undefined, limit: number) {
    const p = await this.own(userId, planId);
    const c = cursor === undefined ? undefined : Number(cursor);
    if (c !== undefined && (!Number.isSafeInteger(c) || c <= 0)) throw new AppError('VALIDATION_ERROR', 'Invalid cursor');
    const rows = await this.db
      .select()
      .from(dcaRuns)
      .where(and(eq(dcaRuns.planId, p.id), c ? lt(dcaRuns.id, c) : undefined))
      .orderBy(desc(dcaRuns.id))
      .limit(limit + 1);
    const more = rows.length > limit;
    const items = more ? rows.slice(0, limit) : rows;
    return { items: items.map(serializeDcaRun), nextCursor: more ? String(items[items.length - 1]!.id) : null };
  }

  /** Executes every due plan once (called by the timer; safe to call concurrently). */
  async runDue(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const due = await this.db
        .select({ id: dcaPlans.id })
        .from(dcaPlans)
        .where(and(eq(dcaPlans.status, 'ACTIVE'), lte(dcaPlans.nextRunAt, this.now())))
        .orderBy(asc(dcaPlans.nextRunAt))
        .limit(200);
      let n = 0;
      for (const d of due) if (await this.runOne(d.id)) n++;
      return n;
    } finally {
      this.running = false;
    }
  }

  private async runOne(planId: number): Promise<boolean> {
    // 1. claim the scheduled time (once) and move the plan to its next time
    const claim = await this.db.transaction(async (tx) => {
      const [p] = await tx.select().from(dcaPlans).where(eq(dcaPlans.id, planId)).for('update');
      if (!p || p.status !== 'ACTIVE' || !p.nextRunAt || p.nextRunAt > this.now()) return null;
      const [run] = await tx.insert(dcaRuns).values({ planId, scheduledAt: p.nextRunAt, status: 'PENDING' }).onConflictDoNothing().returning();
      await tx.update(dcaPlans).set({ nextRunAt: nextRunAt(p, this.now()), updatedAt: this.now() }).where(eq(dcaPlans.id, planId));
      return run ? { plan: p, run } : null;
    });
    if (!claim) return false;
    const { plan, run } = claim;

    // 2. buy through the normal spot engine
    let result: { orderId: number; spent: string; bought: string; price: string } | null = null;
    let reason: string | null = null;
    try {
      const r = await this.ex.orders.placeOrder(
        plan.userId,
        { symbol: plan.symbol, side: 'BUY', type: 'MARKET', quoteOrderQty: dec(plan.quoteAmount).toFixed(), clientOrderId: `dca-${plan.id}-${run.scheduledAt.getTime()}` },
        { source: 'DCA', sourceId: plan.id },
      );
      const fee = r.trades.reduce((a, t) => a.add(dec(t.fee)), ZERO);
      const executed = dec(r.order.executedQty);
      const spent = dec(r.order.cumulativeQuoteQty);
      result = { orderId: r.order.id, spent: toFixedStr(spent), bought: toFixedStr(executed.sub(fee)), price: spent.div(executed).toDecimalPlaces(8).toFixed() };
    } catch (err) {
      reason = err instanceof AppError ? err.code : 'INTERNAL_ERROR';
      if (!(err instanceof AppError)) logger.error({ err, planId }, 'dca buy failed');
    }

    // 3. record the outcome
    const t = this.now();
    let note: typeof notifications.$inferSelect | undefined;
    const updated = await this.db.transaction(async (tx) => {
      const [p] = await tx.select().from(dcaPlans).where(eq(dcaPlans.id, planId)).for('update');
      if (result) {
        await tx.update(dcaRuns).set({ status: 'FILLED', executedAt: t, orderId: result.orderId, quoteSpent: result.spent, baseBought: result.bought, price: result.price }).where(eq(dcaRuns.id, run.id));
        [note] = await tx.insert(notifications).values({ userId: plan.userId, type: 'DCA_EXECUTED', payload: { planId: String(planId), symbol: plan.symbol, quoteSpent: result.spent, baseBought: result.bought, price: result.price } }).returning();
        const [u] = await tx
          .update(dcaPlans)
          .set({ runs: p!.runs + 1, lastRunAt: t, totalSpent: toFixedStr(dec(p!.totalSpent).add(dec(result.spent))), totalBought: toFixedStr(dec(p!.totalBought).add(dec(result.bought))), updatedAt: t })
          .where(eq(dcaPlans.id, planId))
          .returning();
        return u!;
      }
      await tx.update(dcaRuns).set({ status: 'SKIPPED', reason }).where(eq(dcaRuns.id, run.id));
      [note] = await tx.insert(notifications).values({ userId: plan.userId, type: 'DCA_SKIPPED', payload: { planId: String(planId), symbol: plan.symbol, reason } }).returning();
      const [u] = await tx.update(dcaPlans).set({ skipped: p!.skipped + 1, lastRunAt: t, updatedAt: t }).where(eq(dcaPlans.id, planId)).returning();
      return u!;
    });
    this.publish(updated);
    if (note) this.events.emit('notification', plan.userId, note);
    return true;
  }

  /** Admin account reset: every plan of the user is canceled. */
  async resetUser(userId: string): Promise<void> {
    await this.db
      .update(dcaPlans)
      .set({ status: 'CANCELED', nextRunAt: null, updatedAt: this.now() })
      .where(and(eq(dcaPlans.userId, userId), inArray(dcaPlans.status, ['ACTIVE', 'PAUSED'])));
  }

  private publish(p: PlanRow): DcaPlan {
    const plan = serializeDcaPlan(p);
    this.events.emit('dcaPlan', p.userId, plan);
    return plan;
  }
}
