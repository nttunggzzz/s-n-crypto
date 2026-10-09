import { and, desc, eq, gte, inArray, lt, lte, notInArray, sql, type SQL } from 'drizzle-orm';
import type { AdminOverview, AdminSymbol, AdminUserDetail, AdminUserSummary, AssetInfo, AssetTag, AuditLogEntry, AuditTargetType, ExchangeSettings, ReconciliationRun, Role } from '@cex/contracts';
import { AMOUNT_SCALE, dec, hasAtMostScale, toFixedStr } from '@cex/core';
import {
  assets,
  auditLogs,
  balances,
  exchangeSettings,
  faucetClaims,
  ledgerEntries,
  OPEN_STATUSES,
  orders,
  portfolioSnapshots,
  positions,
  reconciliationRuns,
  sessions,
  symbols,
  users,
} from '../../db/schema.ts';
import type { Db } from '../../db/client.ts';
import { AppError } from '../../lib/errors.ts';
import type { MarketDataService } from '../market/marketData.ts';
import type { UserRow } from '../auth/authService.ts';
import type { Exchange } from '../exchange/index.ts';
import { applyBalanceChanges, getBalances } from '../exchange/ledger.ts';
import { reconcile } from '../exchange/reconciliation.ts';
import { makePriceOf } from '../exchange/routes.ts';
import { serializeBalance, serializeLedger, serializeOrder, valuateBalances } from '../exchange/serializers.ts';
import { writeAudit } from './audit.ts';

export interface Actor {
  user: UserRow;
  ip?: string;
}

const RANK: Record<Role, number> = { user: 0, support: 1, admin: 2, owner: 3 };
const MAX_FEE_RATE = dec('0.01');

/** `(select max(last_seen_at) ...)` comes back as a string or Date depending on the driver. */
const asDate = (v: unknown): Date | null => (v === null || v === undefined ? null : v instanceof Date ? v : new Date(String(v)));

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
}
function decodeCursor(c: string): { t: Date; id: string } {
  const [t, id] = Buffer.from(c, 'base64url').toString().split('|');
  const d = new Date(t ?? '');
  if (!id || Number.isNaN(d.getTime())) throw new AppError('VALIDATION_ERROR', 'Invalid cursor');
  return { t: d, id };
}
export function idCursor(cursor: string | undefined): number | undefined {
  if (cursor === undefined) return undefined;
  const n = Number(cursor);
  if (!Number.isSafeInteger(n) || n <= 0) throw new AppError('VALIDATION_ERROR', 'Invalid cursor');
  return n;
}

export function serializeRun(r: typeof reconciliationRuns.$inferSelect): ReconciliationRun {
  return {
    id: String(r.id),
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt.toISOString(),
    ok: r.ok,
    checkedBalances: r.checkedBalances,
    mismatches: r.mismatches as ReconciliationRun['mismatches'],
  };
}

/**
 * Admin operations. Every change runs in ONE transaction with its audit row, so a change
 * exists iff its audit entry exists. Permission checks happen in route(); target rules here.
 */
export class AdminService {
  private readonly priceOf;

  constructor(
    private readonly db: Db,
    private readonly ex: Exchange,
    private readonly market: MarketDataService,
  ) {
    this.priceOf = makePriceOf(market);
  }

  // ───────── helpers

  private async loadUser(id: string): Promise<UserRow> {
    const [u] = await this.db.select().from(users).where(eq(users.id, id));
    if (!u) throw new AppError('NOT_FOUND', 'User not found');
    return u;
  }

  /**
   * Who may act on whom: never the bot, never yourself (unless allowed), and only on accounts
   * of a lower role — except the owner, who may act on anyone but themselves.
   */
  private guardTarget(actor: Actor, target: UserRow, opts: { allowSelf?: boolean } = {}): void {
    if (target.isBot) throw new AppError('BOT_ACCOUNT_PROTECTED', 'The signal bot account cannot be modified');
    if (target.id === actor.user.id) {
      if (!opts.allowSelf) throw new AppError('FORBIDDEN', 'You cannot do this to your own account');
      return;
    }
    if (actor.user.role !== 'owner' && RANK[target.role] >= RANK[actor.user.role]) {
      throw new AppError('FORBIDDEN', 'Not allowed on an account with an equal or higher role');
    }
  }

  private async lastSeen(userIds: string[]): Promise<Map<string, Date | null>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.db
      .select({ userId: sessions.userId, last: sql<unknown>`max(${sessions.lastSeenAt})` })
      .from(sessions)
      .where(inArray(sessions.userId, userIds))
      .groupBy(sessions.userId);
    return new Map(rows.map((r) => [r.userId, asDate(r.last)]));
  }

  summary(u: UserRow, lastSeenAt: Date | null): AdminUserSummary {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      status: u.status,
      emailVerified: u.emailVerifiedAt !== null,
      twoFactorEnabled: u.twoFactorEnabledAt !== null,
      signalsAccess: u.signalsAccess,
      isBot: u.isBot,
      createdAt: u.createdAt.toISOString(),
      lastSeenAt: lastSeenAt?.toISOString() ?? null,
    };
  }

  private async summaryOf(u: UserRow): Promise<AdminUserSummary> {
    return this.summary(u, (await this.lastSeen([u.id])).get(u.id) ?? null);
  }

  // ───────── reads

  async overview(): Promise<AdminOverview> {
    const r = await this.db.execute<Record<string, number>>(sql`
      SELECT
        (SELECT count(*) FROM users WHERE NOT is_bot)::int AS total,
        (SELECT count(*) FROM users WHERE NOT is_bot AND created_at > now() - interval '24 hours')::int AS new24,
        (SELECT count(*) FROM users WHERE status = 'locked')::int AS locked,
        (SELECT count(*) FROM users WHERE role <> 'user')::int AS staff,
        (SELECT count(*) FROM orders WHERE status IN ('NEW', 'PARTIALLY_FILLED'))::int AS open,
        (SELECT count(*) FROM orders WHERE created_at > now() - interval '24 hours')::int AS placed24,
        (SELECT count(*) FROM trades WHERE created_at > now() - interval '24 hours')::int AS trades24`);
    const c = r.rows[0]!;
    const [last] = await this.db.select().from(reconciliationRuns).orderBy(desc(reconciliationRuns.id)).limit(1);
    return {
      users: { total: c.total!, newLast24h: c.new24!, locked: c.locked!, staff: c.staff! },
      orders: { open: c.open!, placedLast24h: c.placed24! },
      trades: { last24h: c.trades24! },
      tradingHalted: this.ex.config.tradingHalted,
      market: this.market.getMarketStatus(),
      lastReconciliation: last ? serializeRun(last) : null,
      serverTime: new Date().toISOString(),
    };
  }

  async listUsers(q: { q?: string; role?: Role; status?: 'active' | 'locked'; cursor?: string; limit: number }) {
    const where: SQL[] = [];
    if (q.q) {
      const isUuid = /^[0-9a-f-]{36}$/i.test(q.q);
      where.push(isUuid ? eq(users.id, q.q) : sql`${users.email} ILIKE ${'%' + q.q.replace(/[%_\\]/g, '\\$&') + '%'}`);
    }
    if (q.role) where.push(eq(users.role, q.role));
    if (q.status) where.push(eq(users.status, q.status));
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      where.push(sql`(${users.createdAt}, ${users.id}) < (${c.t}, ${c.id})`);
    }
    const rows = await this.db
      .select()
      .from(users)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(q.limit + 1);
    const more = rows.length > q.limit;
    const page = more ? rows.slice(0, q.limit) : rows;
    const seen = await this.lastSeen(page.map((u) => u.id));
    const last = page[page.length - 1];
    return { items: page.map((u) => this.summary(u, seen.get(u.id) ?? null)), nextCursor: more && last ? encodeCursor(last.createdAt, last.id) : null };
  }

  async getUser(id: string): Promise<AdminUserDetail> {
    const u = await this.loadUser(id);
    const [bal, [counts], [claimed]] = await Promise.all([
      getBalances(this.db, id),
      this.db
        .select({
          open: sql<number>`(SELECT count(*) FROM orders WHERE user_id = ${id} AND status IN ('NEW', 'PARTIALLY_FILLED'))::int`,
          sessions: sql<number>`(SELECT count(*) FROM sessions WHERE user_id = ${id} AND revoked_at IS NULL AND expires_at > now())::int`,
        })
        .from(sql`(SELECT 1) AS one`),
      this.db
        .select({ total: sql<string | null>`sum(${faucetClaims.amount})` })
        .from(faucetClaims)
        .where(eq(faucetClaims.userId, id)),
    ]);
    const v = valuateBalances(bal, this.priceOf);
    return {
      user: await this.summaryOf(u),
      balances: v.items,
      totalValueUsdt: v.totalValueUsdt,
      unpricedAssets: v.unpricedAssets,
      openOrders: counts?.open ?? 0,
      activeSessions: counts?.sessions ?? 0,
      faucetTotalClaimed: toFixedStr(dec(claimed?.total ?? '0')),
    };
  }

  async userOrders(id: string, open: boolean, cursor: string | undefined, limit: number) {
    await this.loadUser(id);
    const where: SQL[] = [eq(orders.userId, id), open ? inArray(orders.status, [...OPEN_STATUSES]) : notInArray(orders.status, [...OPEN_STATUSES])];
    const c = idCursor(cursor);
    if (c) where.push(lt(orders.id, c));
    const rows = await this.db
      .select()
      .from(orders)
      .where(and(...where))
      .orderBy(desc(orders.id))
      .limit(limit + 1);
    const more = rows.length > limit;
    const page = more ? rows.slice(0, limit) : rows;
    return { items: page.map(serializeOrder), nextCursor: more ? String(page[page.length - 1]!.id) : null };
  }

  async userLedger(id: string, q: { asset?: string; hideLocks: 'true' | 'false'; from?: string; to?: string; cursor?: string; limit: number }) {
    await this.loadUser(id);
    const where: SQL[] = [eq(ledgerEntries.userId, id)];
    if (q.asset) where.push(eq(ledgerEntries.asset, q.asset));
    if (q.hideLocks === 'true') where.push(notInArray(ledgerEntries.type, ['ORDER_LOCK', 'ORDER_UNLOCK']));
    if (q.from) where.push(gte(ledgerEntries.createdAt, new Date(q.from)));
    if (q.to) where.push(lte(ledgerEntries.createdAt, new Date(q.to)));
    const c = idCursor(q.cursor);
    if (c) where.push(lt(ledgerEntries.id, c));
    const rows = await this.db
      .select()
      .from(ledgerEntries)
      .where(and(...where))
      .orderBy(desc(ledgerEntries.id))
      .limit(q.limit + 1);
    const more = rows.length > q.limit;
    const page = more ? rows.slice(0, q.limit) : rows;
    return { items: page.map(serializeLedger), nextCursor: more ? String(page[page.length - 1]!.id) : null };
  }

  // ───────── user changes

  /** Lock signs the user out everywhere (their open orders stay). No-op if already in that state. */
  async setStatus(actor: Actor, id: string, status: 'active' | 'locked', reason: string): Promise<AdminUserSummary> {
    const u = await this.loadUser(id);
    this.guardTarget(actor, u);
    if (u.status !== status) {
      await this.db.transaction(async (tx) => {
        await tx.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, id));
        if (status === 'locked') await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, id), sql`${sessions.revokedAt} IS NULL`));
        await writeAudit(tx, { actorId: actor.user.id, action: status === 'locked' ? 'USER_LOCK' : 'USER_UNLOCK', targetType: 'USER', targetId: id, before: { status: u.status }, after: { status }, reason, ip: actor.ip });
      });
    }
    return this.summaryOf(await this.loadUser(id));
  }

  async setSignalsAccess(actor: Actor, id: string, enabled: boolean, reason: string): Promise<AdminUserSummary> {
    const u = await this.loadUser(id);
    this.guardTarget(actor, u, { allowSelf: true });
    if (u.signalsAccess !== enabled) {
      await this.db.transaction(async (tx) => {
        await tx.update(users).set({ signalsAccess: enabled, updatedAt: new Date() }).where(eq(users.id, id));
        await writeAudit(tx, { actorId: actor.user.id, action: 'USER_SIGNALS_ACCESS', targetType: 'USER', targetId: id, before: { signalsAccess: u.signalsAccess }, after: { signalsAccess: enabled }, reason, ip: actor.ip });
      });
    }
    return this.summaryOf(await this.loadUser(id));
  }

  /** Owner only (permission). Keeps at least one owner. */
  async setRole(actor: Actor, id: string, role: Role, reason: string): Promise<AdminUserSummary> {
    const u = await this.loadUser(id);
    this.guardTarget(actor, u);
    if (u.role !== role) {
      await this.db.transaction(async (tx) => {
        if (u.role === 'owner') {
          const [o] = await tx.select({ n: sql<number>`count(*)::int` }).from(users).where(and(eq(users.role, 'owner'), sql`${users.id} <> ${id}`));
          if ((o?.n ?? 0) === 0) throw new AppError('CONFLICT', 'The last owner cannot be demoted');
        }
        await tx.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id));
        // New permissions apply on the next request; staff must still sign in with 2FA.
        await writeAudit(tx, { actorId: actor.user.id, action: 'USER_ROLE', targetType: 'USER', targetId: id, before: { role: u.role }, after: { role }, reason, ip: actor.ip });
      });
    }
    return this.summaryOf(await this.loadUser(id));
  }

  /** Credits (amount > 0) or debits the available balance; ledger ADMIN_ADJUST linked to the audit row. */
  async adjustBalance(actor: Actor, id: string, asset: string, amountStr: string, reason: string) {
    const u = await this.loadUser(id);
    this.guardTarget(actor, u);
    const known = new Set(['USDT', ...this.ex.config.allSymbols().map((s) => s.row.baseAsset)]);
    if (!known.has(asset)) throw new AppError('VALIDATION_ERROR', `Unknown asset ${asset}`, { field: 'asset' });
    const amount = dec(amountStr);
    if (amount.isZero() || !hasAtMostScale(amount, AMOUNT_SCALE)) throw new AppError('VALIDATION_ERROR', 'amount must be non-zero with at most 8 decimals', { field: 'amount' });

    const result = await this.db.transaction(async (tx) => {
      await tx.insert(balances).values({ userId: id, asset }).onConflictDoNothing();
      const [row] = await tx
        .select()
        .from(balances)
        .where(and(eq(balances.userId, id), eq(balances.asset, asset)))
        .for('update');
      const available = dec(row!.available);
      const after = available.add(amount);
      if (after.lt(0)) throw new AppError('INSUFFICIENT_BALANCE', 'Debit larger than the available balance', { asset, available: toFixedStr(available) });
      const auditId = await writeAudit(tx, {
        actorId: actor.user.id,
        action: 'BALANCE_ADJUST',
        targetType: 'USER',
        targetId: id,
        before: { asset, available: toFixedStr(available), locked: toFixedStr(dec(row!.locked)) },
        after: { asset, available: toFixedStr(after), locked: toFixedStr(dec(row!.locked)), amount: toFixedStr(amount) },
        reason,
        ip: actor.ip,
      });
      const state = await applyBalanceChanges(tx, [{ userId: id, asset, type: 'ADMIN_ADJUST', deltaAvailable: amount, refType: 'ADMIN', refId: String(auditId) }]);
      const [entry] = await tx
        .select()
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.userId, id), eq(ledgerEntries.refType, 'ADMIN'), eq(ledgerEntries.refId, String(auditId))));
      return { auditId, balance: [...state.values()][0]!, entry: entry! };
    });
    this.ex.events.publish({ balances: [result.balance] });
    return {
      balance: serializeBalance(asset, result.balance.available, result.balance.locked, this.priceOf),
      entry: serializeLedger(result.entry),
      auditLogId: String(result.auditId),
    };
  }

  /**
   * Cancels open orders, zeroes every balance (ledger ACCOUNT_RESET), clears faucet history,
   * cost basis and value history. If the user places an order meanwhile → CONFLICT, retry.
   */
  async resetAccount(actor: Actor, id: string, reason: string): Promise<AdminUserDetail> {
    const u = await this.loadUser(id);
    this.guardTarget(actor, u);
    await this.ex.orders.cancelAll(id, undefined, 'ADMIN');
    const changed = await this.db.transaction(async (tx) => {
      const [open] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(orders)
        .where(and(eq(orders.userId, id), inArray(orders.status, [...OPEN_STATUSES])));
      if ((open?.n ?? 0) > 0) throw new AppError('CONFLICT', 'The user has new open orders; try again');
      const rows = await tx.select().from(balances).where(eq(balances.userId, id)).orderBy(balances.asset).for('update');
      if (rows.some((r) => dec(r.locked).gt(0))) throw new AppError('CONFLICT', 'Funds are still reserved; try again');
      const auditId = await writeAudit(tx, {
        actorId: actor.user.id,
        action: 'ACCOUNT_RESET',
        targetType: 'USER',
        targetId: id,
        before: { balances: rows.filter((r) => dec(r.available).gt(0)).map((r) => ({ asset: r.asset, available: toFixedStr(dec(r.available)) })) },
        after: { balances: [] },
        reason,
        ip: actor.ip,
      });
      const changes = rows
        .filter((r) => dec(r.available).gt(0))
        .map((r) => ({ userId: id, asset: r.asset, type: 'ACCOUNT_RESET' as const, deltaAvailable: dec(r.available).neg(), refType: 'ADMIN' as const, refId: String(auditId) }));
      const state = changes.length ? await applyBalanceChanges(tx, changes) : new Map();
      await tx.delete(faucetClaims).where(eq(faucetClaims.userId, id));
      await tx.delete(positions).where(eq(positions.userId, id));
      await tx.delete(portfolioSnapshots).where(eq(portfolioSnapshots.userId, id));
      return [...state.values()];
    });
    this.ex.events.publish({ balances: changed });
    return this.getUser(id);
  }

  // ───────── exchange

  settings(): ExchangeSettings {
    const s = this.ex.config.settings;
    return {
      tradingHalted: s.tradingHalted,
      feeRate: dec(s.feeRate).toFixed(),
      faucet: { asset: s.faucetAsset, amount: toFixedStr(dec(s.faucetAmount)), cooldownHours: s.faucetCooldownHours, lifetimeCap: toFixedStr(dec(s.faucetLifetimeCap)) },
      staleThresholdMs: s.staleThresholdMs,
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  async updateSettings(
    actor: Actor,
    p: { feeRate?: string; faucetAmount?: string; faucetCooldownHours?: number; faucetLifetimeCap?: string; staleThresholdMs?: number; reason: string },
  ): Promise<ExchangeSettings> {
    const set: Partial<typeof exchangeSettings.$inferInsert> = {};
    const amountField = (v: string, field: string, allowZero = false) => {
      const d = dec(v);
      if ((allowZero ? d.lt(0) : d.lte(0)) || !hasAtMostScale(d, AMOUNT_SCALE)) throw new AppError('VALIDATION_ERROR', `${field} out of range`, { field });
      return toFixedStr(d);
    };
    if (p.feeRate !== undefined) {
      const f = amountField(p.feeRate, 'feeRate', true);
      if (dec(f).gt(MAX_FEE_RATE)) throw new AppError('VALIDATION_ERROR', 'feeRate must be at most 0.01', { field: 'feeRate' });
      set.feeRate = f;
    }
    if (p.faucetAmount !== undefined) set.faucetAmount = amountField(p.faucetAmount, 'faucetAmount');
    if (p.faucetLifetimeCap !== undefined) set.faucetLifetimeCap = amountField(p.faucetLifetimeCap, 'faucetLifetimeCap');
    if (p.faucetCooldownHours !== undefined) set.faucetCooldownHours = p.faucetCooldownHours;
    if (p.staleThresholdMs !== undefined) set.staleThresholdMs = p.staleThresholdMs;
    const before = this.settings();
    await this.db.transaction(async (tx) => {
      await tx
        .update(exchangeSettings)
        .set({ ...set, updatedAt: new Date() })
        .where(eq(exchangeSettings.id, 1));
      const { reason: _r, ...changes } = p;
      await writeAudit(tx, { actorId: actor.user.id, action: 'SETTINGS_UPDATE', targetType: 'EXCHANGE', before, after: changes, reason: p.reason, ip: actor.ip });
    });
    await this.ex.config.reload();
    return this.settings();
  }

  /** Emergency stop: no new orders, no matching, until resumed. No-op if already in that state. */
  async setHalted(actor: Actor, halted: boolean, reason: string): Promise<ExchangeSettings> {
    if (this.ex.config.tradingHalted !== halted) {
      await this.db.transaction(async (tx) => {
        await tx.update(exchangeSettings).set({ tradingHalted: halted, updatedAt: new Date() }).where(eq(exchangeSettings.id, 1));
        await writeAudit(tx, { actorId: actor.user.id, action: halted ? 'TRADING_HALT' : 'TRADING_RESUME', targetType: 'EXCHANGE', before: { tradingHalted: !halted }, after: { tradingHalted: halted }, reason, ip: actor.ip });
      });
      await this.ex.config.reload();
    }
    return this.settings();
  }

  async listSymbols(): Promise<AdminSymbol[]> {
    const counts = await this.db
      .select({ symbol: orders.symbol, n: sql<number>`count(*)::int` })
      .from(orders)
      .where(inArray(orders.status, [...OPEN_STATUSES]))
      .groupBy(orders.symbol);
    const bySymbol = new Map(counts.map((c) => [c.symbol, c.n]));
    return this.ex.config.allSymbols().map((s) => ({
      ...this.ex.config.toSymbolInfo(s),
      sourceStatus: s.row.sourceStatus,
      adminEnabled: s.row.enabled,
      openOrders: bySymbol.get(s.row.symbol) ?? 0,
      updatedAt: s.row.updatedAt.toISOString(),
    }));
  }

  async updateSymbol(actor: Actor, symbol: string, enabled: boolean, cancelOpenOrders: boolean, reason: string): Promise<AdminSymbol> {
    const s = this.ex.config.findSymbol(symbol);
    if (!s) throw new AppError('NOT_FOUND', `Unknown symbol ${symbol}`);
    await this.db.transaction(async (tx) => {
      await tx.update(symbols).set({ enabled, updatedAt: new Date() }).where(eq(symbols.symbol, symbol));
      await writeAudit(tx, {
        actorId: actor.user.id,
        action: 'SYMBOL_UPDATE',
        targetType: 'SYMBOL',
        targetId: symbol,
        before: { enabled: s.row.enabled },
        after: { enabled, cancelOpenOrders: !enabled && cancelOpenOrders },
        reason,
        ip: actor.ip,
      });
    });
    await this.ex.config.reload();
    if (!enabled && cancelOpenOrders) {
      const open = await this.db
        .select({ id: orders.id, userId: orders.userId })
        .from(orders)
        .where(and(eq(orders.symbol, symbol), inArray(orders.status, [...OPEN_STATUSES])));
      for (const o of open) {
        await this.ex.orders.cancelOrder(o.userId, String(o.id), 'ADMIN').catch((err) => {
          if (!(err instanceof AppError && err.code === 'ORDER_NOT_CANCELABLE')) throw err;
        });
      }
    }
    return (await this.listSymbols()).find((x) => x.symbol === symbol)!;
  }

  // ───────── audit & reconciliation

  async auditLogs(q: { actorId?: string; action?: string; targetType?: AuditTargetType; targetId?: string; from?: string; to?: string; cursor?: string; limit: number }) {
    const where: SQL[] = [];
    if (q.actorId) where.push(eq(auditLogs.actorId, q.actorId));
    if (q.action) where.push(eq(auditLogs.action, q.action));
    if (q.targetType) where.push(eq(auditLogs.targetType, q.targetType));
    if (q.targetId) where.push(eq(auditLogs.targetId, q.targetId));
    if (q.from) where.push(gte(auditLogs.createdAt, new Date(q.from)));
    if (q.to) where.push(lte(auditLogs.createdAt, new Date(q.to)));
    const c = idCursor(q.cursor);
    if (c) where.push(lt(auditLogs.id, c));
    const rows = await this.db
      .select({ log: auditLogs, email: users.email })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(auditLogs.id))
      .limit(q.limit + 1);
    const more = rows.length > q.limit;
    const page = more ? rows.slice(0, q.limit) : rows;
    const items: AuditLogEntry[] = page.map(({ log, email }) => ({
      id: String(log.id),
      actor: log.actorId ? { id: log.actorId, email: email ?? '(deleted)' } : null,
      action: log.action as AuditLogEntry['action'],
      targetType: log.targetType,
      targetId: log.targetId,
      before: log.before,
      after: log.after,
      reason: log.reason,
      ip: log.ip,
      createdAt: log.createdAt.toISOString(),
    }));
    return { items, nextCursor: more ? String(page[page.length - 1]!.log.id) : null };
  }

  async reconciliationRuns(cursor: string | undefined, limit: number) {
    const c = idCursor(cursor);
    const rows = await this.db
      .select()
      .from(reconciliationRuns)
      .where(c ? lt(reconciliationRuns.id, c) : undefined)
      .orderBy(desc(reconciliationRuns.id))
      .limit(limit + 1);
    const more = rows.length > limit;
    const page = more ? rows.slice(0, limit) : rows;
    return { items: page.map(serializeRun), nextCursor: more ? String(page[page.length - 1]!.id) : null };
  }

  /** Coin display info (name, tags, description). Upserts the row; audited with before/after. */
  async updateAsset(actor: Actor, asset: string, patch: { name?: string | null; tags?: AssetTag[]; description?: string | null }, reason: string): Promise<AssetInfo> {
    if (!this.ex.config.knowsAsset(asset)) throw new AppError('NOT_FOUND', `Unknown asset ${asset}`);
    await this.db.transaction(async (tx) => {
      const [cur] = await tx.select().from(assets).where(eq(assets.asset, asset)).for('update');
      const before = cur ? { name: cur.name, tags: cur.tags, description: cur.description } : null;
      const next = {
        name: patch.name !== undefined ? patch.name : (cur?.name ?? null),
        tags: patch.tags ? [...new Set(patch.tags)] : (cur?.tags ?? []),
        description: patch.description !== undefined ? patch.description : (cur?.description ?? null),
      };
      const t = new Date();
      await tx.insert(assets).values({ asset, ...next, updatedAt: t }).onConflictDoUpdate({ target: assets.asset, set: { ...next, updatedAt: t } });
      await writeAudit(tx, { actorId: actor.user.id, action: 'ASSET_UPDATE', targetType: 'ASSET', targetId: asset, before, after: next, reason, ip: actor.ip });
    });
    await this.ex.config.reload();
    return this.ex.config.assetInfo(asset);
  }

  async runReconciliation(actor: Actor): Promise<ReconciliationRun> {
    const r = await reconcile(this.db, true);
    await writeAudit(this.db, { actorId: actor.user.id, action: 'RECONCILIATION_RUN', targetType: 'EXCHANGE', after: { runId: String(r.run!.id), ok: r.ok, mismatches: r.mismatches.length }, ip: actor.ip });
    return serializeRun(r.run!);
  }
}

