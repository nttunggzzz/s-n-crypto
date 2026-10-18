import { and, asc, desc, eq, gte, inArray, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import type { AdminFundingSummary, AdminFundingSummaryQuery, AdminLiquidation, AdminLiquidationsQuery, AdminRiskPositions, AdminRiskPositionsQuery, FundingSide, RiskPosition, RiskSymbolTotals } from '@cex/contracts';
import { dec, liquidationPrice, maintenanceMargin, pnl, toFixedStr, type Dec } from '@cex/core';
import { futuresFundingPayments, futuresOrders, futuresPositions, ledgerEntries, users } from '../../db/schema.ts';
import type { Db } from '../../db/client.ts';
import { AppError } from '../../lib/errors.ts';
import type { Futures } from '../futures/index.ts';

const DAY_MS = 86_400_000;
const SCALE = 6;
const ZERO = dec('0');
const ONE = dec('1');

/** "2026-10-16T21:15:00.000Z|98" — the position that ended the previous page. */
const LIQ_CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\|(\d{1,15})$/;

interface OpenRow {
  p: typeof futuresPositions.$inferSelect;
  uid: number;
  email: string;
  isBot: boolean;
}

/** `null` last, otherwise by the key in the given direction, ties by position id ascending. */
function compare(a: { key: Dec | null; id: number }, b: { key: Dec | null; id: number }, dir: 1 | -1): number {
  if (a.key === null || b.key === null) return a.key === b.key ? a.id - b.id : a.key === null ? 1 : -1;
  return a.key.cmp(b.key) * dir || a.id - b.id;
}

/**
 * Read-only Futures risk views for the admin back office (module AD, batch AD2). Everything here only READS: positions, orders,
 * ledger and funding rows are the source of truth, the mark prices come from the in-memory `FuturesMarkService` and a number
 * that needs a mark is `null` while that mark is not LIVE. No formula of its own: liquidation price, PnL and maintenance
 * margin are the functions of `@cex/core` that the matching engine uses.
 */
export class AdminRiskService {
  constructor(
    private readonly db: Db,
    private readonly futures: Futures | undefined,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ───────────────────────────── open positions

  /**
   * Loads every open position (optionally of one symbol), computes the risk numbers, sorts and pages in memory: the sort keys
   * depend on live marks, so they cannot be ordered by the database. One query + one pass; the open positions of a simulated
   * exchange are few. The page `cursor` is an offset into the order of THIS request.
   */
  async positions(q: AdminRiskPositionsQuery): Promise<AdminRiskPositions> {
    const asOf = this.now().toISOString();
    const f = this.futures;
    if (!f) return { items: [], nextCursor: null, totals: [], asOf };
    const offset = q.cursor === undefined ? 0 : Number(q.cursor);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new AppError('VALIDATION_ERROR', 'Invalid cursor');

    const where: SQL[] = [eq(futuresPositions.status, 'OPEN')];
    if (q.symbol) where.push(eq(futuresPositions.symbol, q.symbol));
    const rows: OpenRow[] = await this.db
      .select({ p: futuresPositions, uid: users.uid, email: users.email, isBot: users.isBot })
      .from(futuresPositions)
      .innerJoin(users, eq(users.id, futuresPositions.userId))
      .where(and(...where));

    const totals = new Map<string, { n: number; longQty: Dec; shortQty: Dec; longNotional: Dec; shortNotional: Dec; margin: Dec }>();
    const views: { view: RiskPosition; liqKey: Dec | null; notionalKey: Dec | null; id: number }[] = [];
    for (const r of rows) {
      const p = r.p;
      const c = f.config.find(p.symbol);
      const mark = c ? f.marks.liveMark(p.symbol) : null;
      const qty = dec(p.quantity);
      const entry = dec(p.entryPrice);
      const margin = dec(p.margin);
      const liq = c ? liquidationPrice(p.side, entry, qty, margin, c.mmr, c.tick) : null;

      let upnl: Dec | null = null;
      let notional: Dec | null = null;
      let distance: Dec | null = null;
      let ratio: Dec | null = null;
      if (mark !== null && c) {
        upnl = pnl(p.side, entry, mark, qty);
        notional = qty.mul(mark);
        if (liq !== null) distance = (p.side === 'LONG' ? mark.sub(liq) : liq.sub(mark)).div(mark);
        const equity = margin.add(upnl);
        // at or below the maintenance margin the position is liquidatable: the ratio never shows above 1
        ratio = equity.lte(ZERO) ? ONE : maintenanceMargin(mark, qty, c.mmr).div(equity);
        if (ratio.gt(ONE)) ratio = ONE;
      }

      const t = totals.get(p.symbol) ?? { n: 0, longQty: ZERO, shortQty: ZERO, longNotional: ZERO, shortNotional: ZERO, margin: ZERO };
      t.n += 1;
      t.margin = t.margin.add(margin);
      if (p.side === 'LONG') {
        t.longQty = t.longQty.add(qty);
        if (notional) t.longNotional = t.longNotional.add(notional);
      } else {
        t.shortQty = t.shortQty.add(qty);
        if (notional) t.shortNotional = t.shortNotional.add(notional);
      }
      totals.set(p.symbol, t);

      if (q.side && q.side !== p.side) continue;
      views.push({
        id: p.id,
        liqKey: distance,
        notionalKey: notional,
        view: {
          positionId: String(p.id),
          userId: p.userId,
          uid: String(r.uid),
          email: r.email,
          isBot: r.isBot,
          symbol: p.symbol,
          side: p.side,
          leverage: p.leverage,
          quantity: qty.toFixed(),
          entryPrice: entry.toFixed(),
          markPrice: mark === null ? null : mark.toFixed(),
          notional: notional === null ? null : toFixedStr(notional),
          margin: toFixedStr(margin),
          unrealizedPnl: upnl === null ? null : toFixedStr(upnl),
          liquidationPrice: liq === null ? null : liq.toFixed(),
          liqDistance: distance === null ? null : distance.toFixed(SCALE),
          marginRatio: ratio === null ? null : ratio.toFixed(SCALE),
          openedAt: p.openedAt.toISOString(),
        },
      });
    }

    views.sort(q.sort === 'notional' ? (a, b) => compare({ key: a.notionalKey, id: a.id }, { key: b.notionalKey, id: b.id }, -1) : (a, b) => compare({ key: a.liqKey, id: a.id }, { key: b.liqKey, id: b.id }, 1));
    const page = views.slice(offset, offset + q.limit);
    const totalRows: RiskSymbolTotals[] = [...totals.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([symbol, t]) => {
        const live = f.marks.liveMark(symbol) !== null && f.config.find(symbol) !== undefined;
        return {
          symbol,
          positions: t.n,
          longQty: t.longQty.toFixed(),
          shortQty: t.shortQty.toFixed(),
          longNotional: live ? toFixedStr(t.longNotional) : null,
          shortNotional: live ? toFixedStr(t.shortNotional) : null,
          margin: toFixedStr(t.margin),
          markStatus: f.marks.status(symbol),
        };
      });
    return { items: page.map((v) => v.view), nextCursor: views.length > offset + q.limit ? String(offset + q.limit) : null, totals: totalRows, asOf };
  }

  // ───────────────────────────── liquidations

  /**
   * Closed positions with `close_reason = 'LIQUIDATION'`, newest first. The quantity, price and fee are read from the
   * liquidation order (`clientOrderId = liq-<positionId>`, written in the liquidation transaction) and the margin and loss
   * from the `LIQUIDATION` ledger entry of the same transaction, both batched for the page: after the liquidation the position
   * row itself only keeps margin 0 / quantity 0.
   */
  async liquidations(q: AdminLiquidationsQuery): Promise<{ items: AdminLiquidation[]; nextCursor: string | null }> {
    const where: SQL[] = [eq(futuresPositions.status, 'CLOSED'), eq(futuresPositions.closeReason, 'LIQUIDATION')];
    if (q.symbol) where.push(eq(futuresPositions.symbol, q.symbol));
    if (q.from) where.push(gte(futuresPositions.closedAt, new Date(q.from)));
    if (q.to) where.push(lte(futuresPositions.closedAt, new Date(q.to)));
    if (q.cursor !== undefined) {
      const m = LIQ_CURSOR.exec(q.cursor);
      if (!m) throw new AppError('VALIDATION_ERROR', 'Invalid cursor');
      const at = new Date(m[1]!);
      where.push(or(lt(futuresPositions.closedAt, at), and(eq(futuresPositions.closedAt, at), lt(futuresPositions.id, Number(m[2]))))!);
    }
    const rows = await this.db
      .select({ p: futuresPositions, uid: users.uid, email: users.email, isBot: users.isBot })
      .from(futuresPositions)
      .innerJoin(users, eq(users.id, futuresPositions.userId))
      .where(and(...where))
      .orderBy(desc(futuresPositions.closedAt), desc(futuresPositions.id))
      .limit(q.limit + 1);
    const more = rows.length > q.limit;
    const page = more ? rows.slice(0, q.limit) : rows;
    if (page.length === 0) return { items: [], nextCursor: null };

    const userIds = [...new Set(page.map((r) => r.p.userId))];
    const [orders, ledger] = await Promise.all([
      this.db
        .select({ userId: futuresOrders.userId, clientOrderId: futuresOrders.clientOrderId, quantity: futuresOrders.quantity, executedQty: futuresOrders.executedQty, executedNotional: futuresOrders.executedNotional, fee: futuresOrders.fee })
        .from(futuresOrders)
        .where(and(inArray(futuresOrders.userId, userIds), inArray(futuresOrders.clientOrderId, page.map((r) => `liq-${r.p.id}`)), eq(futuresOrders.purpose, 'LIQUIDATION'))),
      this.db
        .select({ userId: ledgerEntries.userId, refId: ledgerEntries.refId, deltaAvailable: ledgerEntries.deltaAvailable, deltaLocked: ledgerEntries.deltaLocked })
        .from(ledgerEntries)
        .where(
          and(
            inArray(ledgerEntries.userId, userIds),
            eq(ledgerEntries.account, 'FUTURES'),
            eq(ledgerEntries.type, 'LIQUIDATION'),
            eq(ledgerEntries.refType, 'FUTURES_POSITION'),
            inArray(ledgerEntries.refId, page.map((r) => String(r.p.id))),
          ),
        ),
    ]);
    const orderOf = new Map(orders.map((o) => [`${o.userId}|${o.clientOrderId}`, o]));
    const ledgerOf = new Map(ledger.map((l) => [`${l.userId}|${l.refId}`, l]));

    const items = page.map((r): AdminLiquidation => {
      const p = r.p;
      const o = orderOf.get(`${p.userId}|liq-${p.id}`);
      const l = ledgerOf.get(`${p.userId}|${p.id}`);
      const qty = o ? dec(o.executedQty) : null;
      // the ledger row moved the whole margin out of `locked` and paid `deltaAvailable` back
      const margin = l ? dec(l.deltaLocked).neg() : null;
      return {
        positionId: String(p.id),
        userId: p.userId,
        uid: String(r.uid),
        email: r.email,
        isBot: r.isBot,
        symbol: p.symbol,
        side: p.side,
        leverage: p.leverage,
        quantity: qty === null ? null : qty.toFixed(),
        entryPrice: dec(p.entryPrice).toFixed(),
        liquidationPrice: o && qty && qty.gt(ZERO) ? dec(o.executedNotional).div(qty).toDecimalPlaces(12).toFixed() : null,
        margin: margin === null ? null : toFixedStr(margin),
        lostMargin: l && margin ? toFixedStr(margin.sub(dec(l.deltaAvailable))) : null,
        fee: o ? toFixedStr(dec(o.fee)) : null,
        liquidatedAt: p.closedAt!.toISOString(),
      };
    });
    const last = page[page.length - 1]!.p;
    return { items, nextCursor: more ? `${last.closedAt!.toISOString()}|${last.id}` : null };
  }

  // ───────────────────────────── funding

  /**
   * Funding payments (`futures_funding_payments`: signed from the user's side, + received / − paid) with `funding_time` in the
   * window, by symbol and by the side of the position that paid or received. Sums stay in SQL; the amounts are exact numerics.
   */
  async fundingSummary(q: AdminFundingSummaryQuery): Promise<AdminFundingSummary> {
    const to = q.to ? new Date(q.to) : this.now();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 7 * DAY_MS);
    if (from.getTime() > to.getTime() || to.getTime() - from.getTime() > 366 * DAY_MS) throw new AppError('VALIDATION_ERROR', 'Invalid window');
    const where: SQL[] = [gte(futuresFundingPayments.fundingTime, from), lte(futuresFundingPayments.fundingTime, to)];
    if (q.symbol) where.push(eq(futuresFundingPayments.symbol, q.symbol));
    const rows = await this.db
      .select({
        symbol: futuresFundingPayments.symbol,
        side: futuresPositions.side,
        payments: sql<number>`count(*)::int`,
        paid: sql<string>`coalesce(sum(-${futuresFundingPayments.amount}) filter (where ${futuresFundingPayments.amount} < 0), 0)::text`,
        received: sql<string>`coalesce(sum(${futuresFundingPayments.amount}) filter (where ${futuresFundingPayments.amount} > 0), 0)::text`,
      })
      .from(futuresFundingPayments)
      .innerJoin(futuresPositions, eq(futuresPositions.id, futuresFundingPayments.positionId))
      .where(and(...where))
      .groupBy(futuresFundingPayments.symbol, futuresPositions.side)
      .orderBy(asc(futuresFundingPayments.symbol));

    type Acc = { paid: Dec; received: Dec; n: number };
    const empty = (): Acc => ({ paid: ZERO, received: ZERO, n: 0 });
    const side = (a: Acc): FundingSide => ({ paid: toFixedStr(a.paid), received: toFixedStr(a.received), net: toFixedStr(a.received.sub(a.paid)), payments: a.n });
    const bySymbol = new Map<string, { LONG: Acc; SHORT: Acc }>();
    const all = { LONG: empty(), SHORT: empty() };
    for (const r of rows) {
      const s = bySymbol.get(r.symbol) ?? { LONG: empty(), SHORT: empty() };
      for (const acc of [s[r.side], all[r.side]]) {
        acc.paid = acc.paid.add(dec(r.paid));
        acc.received = acc.received.add(dec(r.received));
        acc.n += r.payments;
      }
      bySymbol.set(r.symbol, s);
    }
    const summary = (s: { LONG: Acc; SHORT: Acc }) => ({
      long: side(s.LONG),
      short: side(s.SHORT),
      net: toFixedStr(s.LONG.received.sub(s.LONG.paid).add(s.SHORT.received).sub(s.SHORT.paid)),
      payments: s.LONG.n + s.SHORT.n,
    });
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      items: [...bySymbol.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([symbol, s]) => ({ symbol, ...summary(s) })),
      totals: summary(all),
    };
  }
}
