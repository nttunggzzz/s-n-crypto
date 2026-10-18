import { and, desc, eq, gt, gte, inArray, isNull, lt, lte, notInArray, sql, type SQL } from 'drizzle-orm';
import type { AdminCancelOrderResult, AdminCancelOrdersResult, AdminOrderMarket, AdminRevokeSessionsResult, AdminOverview, AdminSymbol, AdminUserBots, AdminUserDetail, AdminUserSummary, AssetInfo, DcaPlan, FuturesAccount, GridBot, AssetTag, AuditLogEntry, AuditTargetType, ExchangeSettings, ReconciliationRun, Role } from '@cex/contracts';
import { AMOUNT_SCALE, dec, hasAtMostScale, toFixedStr } from '@cex/core';
import {
  assets,
  auditLogs,
  balances,
  dcaPlans,
  exchangeSettings,
  faucetClaims,
  futuresPositions,
  gridBots,
  ledgerEntries,
  loginEvents,
  OPEN_STATUSES,
  orders,
  portfolioSnapshots,
  positions,
  reconciliationRuns,
  sessions,
  symbols,
  taxWithholdings,
  userTaxProfiles,
  users,
} from '../../db/schema.ts';
import type { Db, Tx } from '../../db/client.ts';
import { AppError } from '../../lib/errors.ts';
import type { MarketDataService } from '../market/marketData.ts';
import type { AuthService, UserRow } from '../auth/authService.ts';
import type { Exchange } from '../exchange/index.ts';
import type { SettingsRow } from '../exchange/exchangeConfig.ts';
import type { Futures } from '../futures/index.ts';
import type { Bots } from '../bots/index.ts';
import type { BotRow } from '../bots/gridService.ts';
import { applyBalanceChanges, getBalances } from '../exchange/ledger.ts';
import { reconcile } from '../exchange/reconciliation.ts';
import { makePriceOf } from '../exchange/routes.ts';
import { serializeBalance, serializeLedger, serializeOrder, valuateBalances } from '../exchange/serializers.ts';
import { writeAudit } from './audit.ts';
import { AUDIT_EXPORT_COLUMNS, USERS_EXPORT_COLUMNS, csvTextCell } from '@cex/contracts';
import { csv, gmt7, MAX_EXPORT_ROWS } from '../exchange/exports.ts';
import { searchOrders, searchTrades, userSessions } from './lookup.ts';
import { serializeLoginEvent } from '../auth/security.ts';
import { serializePosition } from '../futures/serializers.ts';

/** Flips a grid bot to STOPPED inside the cancel's transaction (GridService.runStopping hands it out). */
type StopBot = (tx: Tx, botId: number) => Promise<BotRow | null>;
/** For orders that are not a bot's: reaching for a bot here is a bug, not a no-op. */
const noStop: StopBot = async () => {
  throw new AppError('CONFLICT', 'A bot of this user changed while canceling; try again');
};
/** The server was wired without the bots module: there is no bot to stop. */
const skipStop: StopBot = async () => null;

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
const EMPTY_FUTURES: FuturesAccount = { asset: 'USDT', walletBalance: '0.00000000', available: '0.00000000', positionMargin: '0.00000000', orderMargin: '0.00000000', unrealizedPnl: '0.00000000', equity: '0.00000000', openPositions: 0 };

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
    // runs stored before the futures wallet existed have no `account`: they were all SPOT
    mismatches: (r.mismatches as Omit<ReconciliationRun['mismatches'][number], 'account'>[]).map((m) => ({ account: 'SPOT' as const, ...m })),
  };
}

/**
 * Admin operations. Every change runs in ONE transaction with its audit row, so a change
 * exists iff its audit entry exists. Permission checks happen in route(); target rules here.
 */
/** Contract `ExchangeSettings` from a settings row (the cached one for GET, the committed one for the response to a change). */
export function settingsFromRow(s: SettingsRow): ExchangeSettings {
  return {
    tradingHalted: s.tradingHalted,
    feeRate: dec(s.feeRate).toFixed(),
    faucet: { asset: s.faucetAsset, amount: toFixedStr(dec(s.faucetAmount)), cooldownHours: s.faucetCooldownHours, lifetimeCap: toFixedStr(dec(s.faucetLifetimeCap)) },
    futures: { makerFee: dec(s.futuresMakerFee).toFixed(), takerFee: dec(s.futuresTakerFee).toFixed(), liquidationFee: dec(s.futuresLiquidationFee).toFixed() },
    staleThresholdMs: s.staleThresholdMs,
    updatedAt: s.updatedAt.toISOString(),
  };
}

export class AdminService {
  private readonly priceOf;

  constructor(
    private readonly db: Db,
    private readonly ex: Exchange,
    private readonly market: MarketDataService,
    private readonly futures?: Futures,
    private readonly bots?: Bots,
    /** Revoking sessions tells the realtime hub (through auth.sessionEvents) to close their /ws at once. */
    private readonly auth?: AuthService,
  ) {
    this.priceOf = makePriceOf(market);
  }

  // ───────── helpers

  /** The clock auth uses (tests move it), so session expiry here agrees with authenticate(). */
  private clock(): Date {
    return this.auth?.currentTime() ?? new Date();
  }

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
      uid: String(u.uid),
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

  /** Filters shared by the user list and its CSV export. */
  private userFilters(q: { q?: string; role?: Role; status?: 'active' | 'locked' }): SQL[] {
    const where: SQL[] = [];
    if (q.q) {
      const isUuid = /^[0-9a-f-]{36}$/i.test(q.q);
      const isUid = /^\d{8}$/.test(q.q);
      where.push(isUuid ? eq(users.id, q.q) : isUid ? eq(users.uid, Number(q.q)) : sql`${users.email} ILIKE ${'%' + q.q.replace(/[%_\\]/g, '\\$&') + '%'}`);
    }
    if (q.role) where.push(eq(users.role, q.role));
    if (q.status) where.push(eq(users.status, q.status));
    return where;
  }

  async listUsers(q: { q?: string; role?: Role; status?: 'active' | 'locked'; cursor?: string; limit: number }) {
    const where = this.userFilters(q);
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
    const [bal, [counts], [claimed], futures, [bots], [taxProfile], [withheld], trading] = await Promise.all([
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
      this.futures ? this.futures.service.account(id) : Promise.resolve(EMPTY_FUTURES),
      this.db
        .select({
          grid: sql<number>`(SELECT count(*) FROM ${gridBots} WHERE ${gridBots.userId} = ${id} AND ${gridBots.status} IN ('STARTING', 'RUNNING'))::int`,
          dca: sql<number>`(SELECT count(*) FROM ${dcaPlans} WHERE ${dcaPlans.userId} = ${id} AND ${dcaPlans.status} = 'ACTIVE')::int`,
        })
        .from(sql`(SELECT 1) AS one`),
      this.db.select({ category: userTaxProfiles.category, updatedAt: userTaxProfiles.updatedAt }).from(userTaxProfiles).where(eq(userTaxProfiles.userId, id)),
      this.db
        .select({ count: sql<number>`count(*)::int`, total: sql<string | null>`sum(${taxWithholdings.taxAmount})` })
        .from(taxWithholdings)
        .where(eq(taxWithholdings.userId, id)),
      // the same service and numbers as the user's own GET /account/stats
      this.ex.stats.forUser(id),
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
      futures,
      bots: { runningGrid: bots?.grid ?? 0, activeDca: bots?.dca ?? 0 },
      tax: {
        category: taxProfile?.category ?? 'INDIVIDUAL',
        categoryUpdatedAt: taxProfile?.updatedAt.toISOString() ?? null,
        withheldCount: withheld?.count ?? 0,
        withheldTotal: toFixedStr(dec(withheld?.total ?? '0')),
      },
      trading,
    };
  }

  // ───────── phase 2.6: support views of futures, bots, sign-ins

  async userFuturesPositions(id: string, open: boolean, cursor: string | undefined, limit: number) {
    await this.loadUser(id);
    const f = this.futures;
    if (!f) return { items: [], nextCursor: null };
    const where: SQL[] = [eq(futuresPositions.userId, id), eq(futuresPositions.status, open ? 'OPEN' : 'CLOSED')];
    const c = idCursor(cursor);
    if (c) where.push(lt(futuresPositions.id, c));
    const rows = await this.db.select().from(futuresPositions).where(and(...where)).orderBy(desc(futuresPositions.id)).limit(limit + 1);
    const more = rows.length > limit;
    const page = more ? rows.slice(0, limit) : rows;
    return { items: page.map((p) => serializePosition(p, f.config.find(p.symbol), f.marks.liveMark(p.symbol))), nextCursor: more ? String(page[page.length - 1]!.id) : null };
  }

  async userBots(id: string): Promise<AdminUserBots> {
    await this.loadUser(id);
    if (!this.bots) return { grid: [], dca: [] };
    const [grid, dca] = await Promise.all([this.bots.grid.list(id), this.bots.dca.list(id)]);
    const active = (s: string) => (s === 'RUNNING' || s === 'ACTIVE' || s === 'PAUSED' ? 0 : 1);
    return { grid: [...grid].sort((a, b) => active(a.status) - active(b.status)), dca: [...dca].sort((a, b) => active(a.status) - active(b.status)) };
  }

  async stopGridBot(actor: Actor, userId: string, botId: string, reason: string, sellBase: boolean): Promise<GridBot> {
    const u = await this.loadUser(userId);
    this.guardTarget(actor, u);
    const id = Number(botId);
    if (!this.bots || !Number.isSafeInteger(id)) throw new AppError('NOT_FOUND', 'Bot not found');
    return this.bots.grid.adminStop(userId, id, sellBase, (tx, bot) =>
      writeAudit(tx, {
        actorId: actor.user.id,
        action: 'GRID_BOT_STOP',
        targetType: 'USER',
        targetId: userId,
        before: { botId: String(bot.id), symbol: bot.symbol, status: 'RUNNING', gridProfit: toFixedStr(dec(bot.gridProfit)) },
        after: { status: 'STOPPED', sellBase },
        reason,
        ip: actor.ip,
      }),
    );
  }

  async cancelDcaPlan(actor: Actor, userId: string, planId: string, reason: string): Promise<DcaPlan> {
    const u = await this.loadUser(userId);
    this.guardTarget(actor, u);
    if (!this.bots) throw new AppError('NOT_FOUND', 'Plan not found');
    return this.bots.dca.adminCancel(userId, planId, (tx, plan) =>
      writeAudit(tx, {
        actorId: actor.user.id,
        action: 'DCA_PLAN_CANCEL',
        targetType: 'USER',
        targetId: userId,
        before: { planId: String(plan.id), symbol: plan.symbol, status: plan.status, quoteAmount: toFixedStr(dec(plan.quoteAmount)) },
        after: { status: 'CANCELED' },
        reason,
        ip: actor.ip,
      }),
    );
  }

  async userLoginHistory(id: string, cursor: string | undefined, limit: number) {
    await this.loadUser(id);
    const c = idCursor(cursor);
    const rows = await this.db
      .select()
      .from(loginEvents)
      .where(and(eq(loginEvents.userId, id), c ? lt(loginEvents.id, c) : undefined))
      .orderBy(desc(loginEvents.id))
      .limit(limit + 1);
    const more = rows.length > limit;
    const page = more ? rows.slice(0, limit) : rows;
    return { items: page.map(serializeLoginEvent), nextCursor: more ? String(page[page.length - 1]!.id) : null };
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
      const ended = await this.db.transaction(async (tx) => {
        await tx.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, id));
        let ids: string[] = [];
        if (status === 'locked') {
          ids = (await tx.update(sessions).set({ revokedAt: this.clock() }).where(and(eq(sessions.userId, id), sql`${sessions.revokedAt} IS NULL`)).returning({ id: sessions.id })).map((s) => s.id);
        }
        await writeAudit(tx, { actorId: actor.user.id, action: status === 'locked' ? 'USER_LOCK' : 'USER_UNLOCK', targetType: 'USER', targetId: id, before: { status: u.status }, after: { status }, reason, ip: actor.ip });
        return ids;
      });
      if (ended.length > 0) this.auth?.sessionEvents.emit('ended', ended); // after commit: their /ws closes now, not at the next heartbeat
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
  async adjustBalance(actor: Actor, id: string, asset: string, amountStr: string, reason: string, account: 'SPOT' | 'FUTURES' = 'SPOT') {
    const u = await this.loadUser(id);
    this.guardTarget(actor, u);
    // the futures wallet holds USDT only (invariant 16); the contract refuses anything else, this guards direct callers
    if (account === 'FUTURES' && asset !== 'USDT') throw new AppError('VALIDATION_ERROR', 'The futures wallet holds USDT only', { field: 'asset' });
    const known = new Set(['USDT', ...this.ex.config.allSymbols().map((s) => s.row.baseAsset)]);
    if (!known.has(asset)) throw new AppError('VALIDATION_ERROR', `Unknown asset ${asset}`, { field: 'asset' });
    const amount = dec(amountStr);
    if (amount.isZero() || !hasAtMostScale(amount, AMOUNT_SCALE)) throw new AppError('VALIDATION_ERROR', 'amount must be non-zero with at most 8 decimals', { field: 'amount' });

    const result = await this.db.transaction(async (tx) => {
      await tx.insert(balances).values({ userId: id, account, asset }).onConflictDoNothing();
      const [row] = await tx
        .select()
        .from(balances)
        .where(and(eq(balances.userId, id), eq(balances.account, account), eq(balances.asset, asset)))
        .for('update');
      const available = dec(row!.available);
      const after = available.add(amount);
      if (after.lt(0)) throw new AppError('INSUFFICIENT_BALANCE', 'Debit larger than the available balance', { asset, account, available: toFixedStr(available) });
      const auditId = await writeAudit(tx, {
        actorId: actor.user.id,
        action: 'BALANCE_ADJUST',
        targetType: 'USER',
        targetId: id,
        before: { account, asset, available: toFixedStr(available), locked: toFixedStr(dec(row!.locked)) },
        after: { account, asset, available: toFixedStr(after), locked: toFixedStr(dec(row!.locked)), amount: toFixedStr(amount) },
        reason,
        ip: actor.ip,
      });
      const state = await applyBalanceChanges(tx, [{ userId: id, account, asset, type: 'ADMIN_ADJUST', deltaAvailable: amount, refType: 'ADMIN', refId: String(auditId) }]);
      const [entry] = await tx
        .select()
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.userId, id), eq(ledgerEntries.account, account), eq(ledgerEntries.refType, 'ADMIN'), eq(ledgerEntries.refId, String(auditId))));
      return { auditId, balance: [...state.values()][0]!, entry: entry! };
    });
    // after commit: the Spot wallet rides the exchange events; the futures wallet is pushed as `futuresAccount`
    if (account === 'SPOT') this.ex.events.publish({ balances: [result.balance] });
    else this.futures?.events.emit('account', id);
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
    await this.bots?.resetUser(id); // first, so no bot places new orders during the reset
    await this.futures?.service.resetUser(id);
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
        before: { balances: rows.filter((r) => dec(r.available).gt(0)).map((r) => ({ account: r.account, asset: r.asset, available: toFixedStr(dec(r.available)) })) },
        after: { balances: [] },
        reason,
        ip: actor.ip,
      });
      const changes = rows
        .filter((r) => dec(r.available).gt(0))
        .map((r) => ({ userId: id, account: r.account, asset: r.asset, type: 'ACCOUNT_RESET' as const, deltaAvailable: dec(r.available).neg(), refType: 'ADMIN' as const, refId: String(auditId) }));
      const state = changes.length ? await applyBalanceChanges(tx, changes) : new Map();
      await tx.delete(faucetClaims).where(eq(faucetClaims.userId, id));
      await tx.delete(positions).where(eq(positions.userId, id));
      await tx.delete(portfolioSnapshots).where(eq(portfolioSnapshots.userId, id));
      return [...state.values()];
    });
    this.ex.events.publish({ balances: changed });
    return this.getUser(id);
  }

  // ───────── AD3: cancel a user's orders, revoke sessions

  /**
   * Cancels one open order for the user (closeReason ADMIN). The audit row is written by the `step` the order services run
   * INSIDE the cancel's own transaction, so the order, the released funds, the ledger and the audit row commit together -
   * or, when the order already filled / the audit fails, none of them exist. A grid bot's order also stops the bot, in that
   * same transaction (invariant 19: the bot must not place it again).
   */
  async cancelUserOrder(actor: Actor, userId: string, orderId: string, market: AdminOrderMarket, reason: string): Promise<AdminCancelOrderResult> {
    const u = await this.loadUser(userId);
    this.guardTarget(actor, u);
    const id = Number(orderId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new AppError('NOT_FOUND', 'Order not found');

    if (market === 'FUTURES') {
      if (!this.futures) throw new AppError('NOT_FOUND', 'Order not found');
      let auditId = 0;
      await this.futures.service.cancelOrder(userId, orderId, 'ADMIN', async (tx, o, priorStatus) => {
        auditId = await writeAudit(tx, {
          actorId: actor.user.id,
          action: 'ORDER_CANCEL',
          targetType: 'USER',
          targetId: userId,
          before: { market, orderId, symbol: o.symbol, side: o.side, type: o.type, purpose: o.purpose, reduceOnly: o.reduceOnly, quantity: toFixedStr(dec(o.quantity)), executedQty: toFixedStr(dec(o.executedQty)), price: o.price === null ? null : toFixedStr(dec(o.price)), status: priorStatus },
          after: { status: 'CANCELED', closeReason: 'ADMIN', canceledOrderIds: [orderId], stoppedBotId: null },
          reason,
          ip: actor.ip,
        });
      });
      return { market, orderId, canceledOrderIds: [orderId], stoppedBotId: null, auditLogId: String(auditId) };
    }

    // Spot: the order must be the user's (404 otherwise); a grid bot's order names its bot
    const [peek] = await this.db.select({ source: orders.source, sourceId: orders.sourceId }).from(orders).where(and(eq(orders.id, id), eq(orders.userId, userId)));
    if (!peek) throw new AppError('NOT_FOUND', 'Order not found');
    let auditId = 0;
    let canceledIds: string[] = [];
    let stoppedBotId: string | null = null;
    const cancelWith = (stop: StopBot): Promise<unknown> =>
      this.ex.orders.cancelOrder(userId, orderId, 'ADMIN', async (tx, canceled, prior) => {
        const stopped = await this.stopBotsOf(tx, canceled, stop);
        canceledIds = canceled.map((o) => String(o.id));
        stoppedBotId = stopped[0] ? String(stopped[0].id) : null;
        const o = canceled.find((c) => c.id === id)!;
        auditId = await writeAudit(tx, {
          actorId: actor.user.id,
          action: 'ORDER_CANCEL',
          targetType: 'USER',
          targetId: userId,
          before: { market, orderId, symbol: o.symbol, side: o.side, type: o.type, quantity: o.quantity === null ? null : toFixedStr(dec(o.quantity)), executedQty: toFixedStr(dec(o.executedQty)), price: o.price === null ? null : toFixedStr(dec(o.price)), status: prior.get(id) ?? null, source: o.source, sourceId: o.sourceId === null ? null : String(o.sourceId) },
          after: { status: 'CANCELED', closeReason: 'ADMIN', canceledOrderIds: canceledIds, stoppedBotId },
          reason,
          ip: actor.ip,
        });
      });
    if (peek.source === 'GRID' && peek.sourceId !== null && this.bots) await this.bots.grid.runStopping([peek.sourceId], cancelWith);
    else await cancelWith(this.bots ? noStop : skipStop);
    return { market, orderId, canceledOrderIds: canceledIds, stoppedBotId, auditLogId: String(auditId) };
  }

  /** Marks the grid bots that own `canceled` orders as STOPPED inside the caller's transaction (see GridService.runStopping). */
  private async stopBotsOf(tx: Tx, canceled: { source: string; sourceId: number | null }[], stop: StopBot): Promise<BotRow[]> {
    const stopped: BotRow[] = [];
    const ids = [...new Set(canceled.flatMap((o) => (o.source === 'GRID' && o.sourceId !== null ? [o.sourceId] : [])))].sort((a, b) => a - b);
    for (const botId of ids) {
      const row = await stop(tx, botId);
      if (row) stopped.push(row);
    }
    return stopped;
  }

  /**
   * Cancels every open order of the user in scope. Each book is ONE transaction with its own audit row (so a failure leaves
   * no order canceled without a row, nor a row without cancels); `market` omitted = Spot first, then Futures.
   * Bot orders are included and their grid bots stop in the same transaction as their cancel.
   */
  async cancelUserOrders(actor: Actor, userId: string, market: AdminOrderMarket | undefined, symbol: string | undefined, reason: string): Promise<AdminCancelOrdersResult> {
    const u = await this.loadUser(userId);
    this.guardTarget(actor, u);
    const result: AdminCancelOrdersResult = { spotCanceled: 0, futuresCanceled: 0, stoppedBotIds: [], auditLogIds: [] };

    if (market !== 'FUTURES') {
      const where = [eq(orders.userId, userId), eq(orders.source, 'GRID'), inArray(orders.status, [...OPEN_STATUSES])];
      if (symbol) where.push(eq(orders.symbol, symbol));
      const botRows = await this.db.selectDistinct({ id: orders.sourceId }).from(orders).where(and(...where));
      const botIds = botRows.flatMap((r) => (r.id === null ? [] : [r.id]));
      const run = (stop: StopBot): Promise<unknown> =>
        this.ex.orders.cancelAllAtomic(userId, symbol, 'ADMIN', async (tx, canceled, prior) => {
          const stopped = await this.stopBotsOf(tx, canceled, stop);
          const canceledOrderIds = canceled.map((o) => String(o.id));
          const auditId = await writeAudit(tx, {
            actorId: actor.user.id,
            action: 'ORDER_CANCEL',
            targetType: 'USER',
            targetId: userId,
            before: { market: 'SPOT', symbol: symbol ?? null, openOrders: canceled.length, partiallyFilled: canceled.filter((o) => prior.get(o.id) === 'PARTIALLY_FILLED').length },
            after: { canceled: canceled.length, closeReason: 'ADMIN', canceledOrderIds, stoppedBotIds: stopped.map((b) => String(b.id)) },
            reason,
            ip: actor.ip,
          });
          result.spotCanceled = canceled.length;
          result.stoppedBotIds.push(...stopped.map((b) => String(b.id)));
          result.auditLogIds.push(String(auditId));
        });
      if (botIds.length > 0 && this.bots) await this.bots.grid.runStopping(botIds, run);
      else await run(this.bots ? noStop : skipStop);
    }

    if (market !== 'SPOT' && this.futures) {
      await this.futures.service.cancelAllAtomic(userId, symbol, 'ADMIN', async (tx, canceled, prior) => {
        const auditId = await writeAudit(tx, {
          actorId: actor.user.id,
          action: 'ORDER_CANCEL',
          targetType: 'USER',
          targetId: userId,
          before: { market: 'FUTURES', symbol: symbol ?? null, openOrders: canceled.length, partiallyFilled: canceled.filter((o) => prior.get(o.id) === 'PARTIALLY_FILLED').length },
          after: { canceled: canceled.length, closeReason: 'ADMIN', canceledOrderIds: canceled.map((o) => String(o.id)), stoppedBotIds: [] },
          reason,
          ip: actor.ip,
        });
        result.futuresCanceled = canceled.length;
        result.auditLogIds.push(String(auditId));
      });
    }
    return result;
  }

  /** Signs out one session of the user; the audit row is in the same transaction. 404 if it is not an active session of this user. */
  async revokeSession(actor: Actor, userId: string, sessionId: string, reason: string): Promise<AdminRevokeSessionsResult> {
    const u = await this.loadUser(userId);
    this.guardTarget(actor, u);
    const auditId = await this.db.transaction(async (tx) => {
      const [s] = await tx
        .update(sessions)
        .set({ revokedAt: this.clock() })
        .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, this.clock())))
        .returning({ id: sessions.id, ip: sessions.ip, userAgent: sessions.userAgent, createdAt: sessions.createdAt });
      if (!s) throw new AppError('NOT_FOUND', 'Session not found');
      return writeAudit(tx, {
        actorId: actor.user.id,
        action: 'SESSION_REVOKE',
        targetType: 'USER',
        targetId: userId,
        before: { sessionId: s.id, ip: s.ip, userAgent: s.userAgent, createdAt: s.createdAt.toISOString() },
        after: { revoked: 1 },
        reason,
        ip: actor.ip,
      });
    });
    this.auth?.sessionEvents.emit('ended', [sessionId]); // after commit: close its /ws now (4401), not at the next heartbeat
    return { revoked: 1, auditLogId: String(auditId) };
  }

  /** Signs out every active session of the user (not your own account: guardTarget). Nothing active → no audit row. */
  async revokeAllSessions(actor: Actor, userId: string, reason: string): Promise<AdminRevokeSessionsResult> {
    const u = await this.loadUser(userId);
    this.guardTarget(actor, u);
    const { ids, auditId } = await this.db.transaction(async (tx) => {
      const rows = await tx
        .update(sessions)
        .set({ revokedAt: this.clock() })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, this.clock())))
        .returning({ id: sessions.id });
      if (rows.length === 0) return { ids: [] as string[], auditId: null };
      const ids = rows.map((r) => r.id).sort();
      const auditId = await writeAudit(tx, { actorId: actor.user.id, action: 'SESSION_REVOKE', targetType: 'USER', targetId: userId, before: { sessionIds: ids }, after: { revoked: ids.length }, reason, ip: actor.ip });
      return { ids, auditId };
    });
    if (ids.length > 0) this.auth?.sessionEvents.emit('ended', ids);
    return { revoked: ids.length, auditLogId: auditId === null ? null : String(auditId) };
  }

  // ───────── exchange

  /** The cached settings (GET). Responses to a change are built from the COMMITTED row instead (`settingsFromRow`). */
  settings(): ExchangeSettings {
    return settingsFromRow(this.ex.config.settings);
  }

  async updateSettings(
    actor: Actor,
    p: {
      feeRate?: string;
      faucetAmount?: string;
      faucetCooldownHours?: number;
      faucetLifetimeCap?: string;
      staleThresholdMs?: number;
      futuresMakerFee?: string;
      futuresTakerFee?: string;
      futuresLiquidationFee?: string;
      reason: string;
    },
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
    const futuresFee = (v: string, field: string, max: string) => {
      const f = amountField(v, field, true);
      if (dec(f).gt(max)) throw new AppError('VALIDATION_ERROR', `${field} must be at most ${max}`, { field });
      return f;
    };
    if (p.futuresMakerFee !== undefined) set.futuresMakerFee = futuresFee(p.futuresMakerFee, 'futuresMakerFee', '0.01');
    if (p.futuresTakerFee !== undefined) set.futuresTakerFee = futuresFee(p.futuresTakerFee, 'futuresTakerFee', '0.01');
    if (p.futuresLiquidationFee !== undefined) set.futuresLiquidationFee = futuresFee(p.futuresLiquidationFee, 'futuresLiquidationFee', '0.05');
    const committed = await this.db.transaction(async (tx) => {
      // `before` is what the DB holds (row locked), not what the cache believes
      const [cur] = await tx.select().from(exchangeSettings).where(eq(exchangeSettings.id, 1)).for('update');
      if (!cur) throw new Error('exchange_settings row missing — run migrations');
      const [row] = await tx
        .update(exchangeSettings)
        .set({ ...set, updatedAt: new Date() })
        .where(eq(exchangeSettings.id, 1))
        .returning();
      const { reason: _r, ...changes } = p;
      await writeAudit(tx, { actorId: actor.user.id, action: 'SETTINGS_UPDATE', targetType: 'EXCHANGE', before: settingsFromRow(cur), after: changes, reason: p.reason, ip: actor.ip });
      return row!;
    });
    await this.ex.config.reloadAfterCommit();
    return settingsFromRow(committed);
  }

  /**
   * Emergency stop: no new orders, no matching, until resumed. The "already in that state" decision is made on the DB row
   * (locked), never on the cache: a cache that could not be refreshed must not swallow the admin's last action.
   */
  async setHalted(actor: Actor, halted: boolean, reason: string): Promise<ExchangeSettings> {
    const { row, wrote } = await this.db.transaction(async (tx) => {
      const [cur] = await tx.select().from(exchangeSettings).where(eq(exchangeSettings.id, 1)).for('update');
      if (!cur) throw new Error('exchange_settings row missing — run migrations');
      if (cur.tradingHalted === halted) return { row: cur, wrote: false };
      const [upd] = await tx.update(exchangeSettings).set({ tradingHalted: halted, updatedAt: new Date() }).where(eq(exchangeSettings.id, 1)).returning();
      await writeAudit(tx, { actorId: actor.user.id, action: halted ? 'TRADING_HALT' : 'TRADING_RESUME', targetType: 'EXCHANGE', before: { tradingHalted: cur.tradingHalted }, after: { tradingHalted: halted }, reason, ip: actor.ip });
      return { row: upd!, wrote: true };
    });
    // refresh when this call changed the DB, or when the cache disagrees with the DB (an earlier reload failed)
    if (wrote || this.ex.config.tradingHalted !== row.tradingHalted) await this.ex.config.reloadAfterCommit();
    // fail safe: a committed HALT must stop matching even if the cache could not be refreshed
    if (row.tradingHalted && this.ex.config.stale) this.ex.config.applyCommittedHalt(true);
    return settingsFromRow(row);
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
    if (!this.ex.config.findSymbol(symbol)) throw new AppError('NOT_FOUND', `Unknown symbol ${symbol}`);
    await this.db.transaction(async (tx) => {
      // lock order: exchange_settings first (taxService.updateSettings does the same), then the pair
      const [cfg] = await tx.select().from(exchangeSettings).where(eq(exchangeSettings.id, 1)).for('update');
      if (!cfg) throw new Error('exchange_settings row missing — run migrations');
      const [cur] = await tx.select().from(symbols).where(eq(symbols.symbol, symbol)).for('update');
      if (!cur) throw new AppError('NOT_FOUND', `Unknown symbol ${symbol}`);
      // the tax reports add up one currency (USDT): while the tax is on, no pair quoted in another asset may be switched on
      if (enabled && !cur.enabled && cur.quoteAsset !== 'USDT' && cfg.taxMode === 'WITHHOLD') {
        throw new AppError('VALIDATION_ERROR', `${symbol} is quoted in ${cur.quoteAsset}: turn the tax (taxMode WITHHOLD) off before enabling it`, { field: 'enabled' });
      }
      await tx.update(symbols).set({ enabled, updatedAt: new Date() }).where(eq(symbols.symbol, symbol));
      await writeAudit(tx, {
        actorId: actor.user.id,
        action: 'SYMBOL_UPDATE',
        targetType: 'SYMBOL',
        targetId: symbol,
        before: { enabled: cur.enabled },
        after: { enabled, cancelOpenOrders: !enabled && cancelOpenOrders },
        reason,
        ip: actor.ip,
      });
    });
    await this.ex.config.reloadAfterCommit();
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

  /** Filters shared by the audit log list and its CSV export. */
  private auditFilters(q: { actorId?: string; action?: string; targetType?: AuditTargetType; targetId?: string; from?: string; to?: string }): SQL[] {
    const where: SQL[] = [];
    if (q.actorId) where.push(eq(auditLogs.actorId, q.actorId));
    if (q.action) where.push(eq(auditLogs.action, q.action));
    if (q.targetType) where.push(eq(auditLogs.targetType, q.targetType));
    if (q.targetId) where.push(eq(auditLogs.targetId, q.targetId));
    if (q.from) where.push(gte(auditLogs.createdAt, new Date(q.from)));
    if (q.to) where.push(lte(auditLogs.createdAt, new Date(q.to)));
    return where;
  }

  async auditLogs(q: { actorId?: string; action?: string; targetType?: AuditTargetType; targetId?: string; from?: string; to?: string; cursor?: string; limit: number }) {
    const where = this.auditFilters(q);
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

  /** AD1: audit log as CSV (AUDIT_EXPORT_COLUMNS), newest first, at most MAX_EXPORT_ROWS. Free-text cells are neutralised against CSV injection. */
  async auditExport(q: { actorId?: string; action?: string; targetType?: AuditTargetType; targetId?: string; from?: string; to?: string }): Promise<string> {
    const where = this.auditFilters(q);
    const rows = await this.db
      .select({ log: auditLogs, email: users.email })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(auditLogs.id))
      .limit(MAX_EXPORT_ROWS);
    const json = (v: unknown) => (v === null || v === undefined ? null : csvTextCell(JSON.stringify(v)));
    return csv(
      AUDIT_EXPORT_COLUMNS,
      rows.map(({ log, email }) => [
        String(log.id),
        log.createdAt.toISOString(),
        gmt7(log.createdAt.toISOString()),
        log.actorId,
        log.actorId ? csvTextCell(email ?? '(deleted)') : null,
        csvTextCell(log.action),
        log.targetType,
        csvTextCell(log.targetId),
        csvTextCell(log.reason),
        csvTextCell(log.ip),
        json(log.before),
        json(log.after),
      ]),
    );
  }

  /** AD1: user list as CSV (USERS_EXPORT_COLUMNS; e-mail addresses: permission users.export), newest first, at most MAX_EXPORT_ROWS. */
  async usersExport(q: { q?: string; role?: Role; status?: 'active' | 'locked' }): Promise<string> {
    const where = this.userFilters(q);
    const rows = await this.db
      .select()
      .from(users)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(MAX_EXPORT_ROWS);
    const seen = await this.lastSeen(rows.map((u) => u.id));
    return csv(
      USERS_EXPORT_COLUMNS,
      rows.map((u) => {
        const s = this.summary(u, seen.get(u.id) ?? null);
        return [s.uid, s.id, csvTextCell(s.email), csvTextCell(s.name), s.role, s.status, String(s.emailVerified), String(s.twoFactorEnabled), String(s.signalsAccess), String(s.isBot), s.createdAt, s.lastSeenAt];
      }),
    );
  }

  /** AD1: order / fill lookup across all users, and one user's live sessions (see lookup.ts). */
  searchOrders(q: Parameters<typeof searchOrders>[1]) {
    return searchOrders(this.db, q);
  }
  searchTrades(q: Parameters<typeof searchTrades>[1]) {
    return searchTrades(this.db, q);
  }
  async userSessions(id: string) {
    await this.loadUser(id);
    return userSessions(this.db, id);
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
    await this.ex.config.reloadAfterCommit();
    return this.ex.config.assetInfo(asset);
  }

  async runReconciliation(actor: Actor): Promise<ReconciliationRun> {
    const r = await reconcile(this.db, true);
    await writeAudit(this.db, { actorId: actor.user.id, action: 'RECONCILIATION_RUN', targetType: 'EXCHANGE', after: { runId: String(r.run!.id), ok: r.ok, mismatches: r.mismatches.length }, ip: actor.ip });
    return serializeRun(r.run!);
  }
}

