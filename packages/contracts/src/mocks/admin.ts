/**
 * ⚠️ Mock resolvers for 2FA and the admin API — UI development only.
 * Codes: any 6 digits work except "000000" (= wrong code). Recovery codes look like "abcd-1234".
 */
import type { AdminAnnouncement, AnnouncementLevel, AssetTag, AuditLogEntry, AdminUserSummary } from '../index.ts';
import { fixtureAdminUserDetail, fixtureLedger, fixtureOpenOrders, fixtureOrderHistory } from '../fixtures/index.ts';
import { MockError, mockMe, now, ok, requireStaff, requireUser, type Resolver } from './common.ts';
import { mockStore, nextId } from './store.ts';

type AdminEndpoint =
  | 'loginTwoFactor'
  | 'setupTwoFactor'
  | 'enableTwoFactor'
  | 'disableTwoFactor'
  | 'regenerateRecoveryCodes'
  | 'adminOverview'
  | 'adminListUsers'
  | 'adminGetUser'
  | 'adminUserOrders'
  | 'adminUserLedger'
  | 'adminLockUser'
  | 'adminUnlockUser'
  | 'adminSetSignalsAccess'
  | 'adminSetRole'
  | 'adminAdjustBalance'
  | 'adminResetAccount'
  | 'adminGetSettings'
  | 'adminUpdateSettings'
  | 'adminHaltTrading'
  | 'adminResumeTrading'
  | 'adminListSymbols'
  | 'adminUpdateSymbol'
  | 'adminAuditLogs'
  | 'adminReconciliationRuns'
  | 'adminRunReconciliation'
  | 'adminUpdateAsset'
  | 'adminListAnnouncements'
  | 'adminCreateAnnouncement'
  | 'adminUpdateAnnouncement';

const checkCode = (code: unknown) => {
  const c = String(code ?? '');
  if (!/^\d{6}$/.test(c) && !/^[a-z0-9]{4}-[a-z0-9]{4}$/.test(c)) throw new MockError('INVALID_TWO_FACTOR_CODE', 'Invalid code');
  if (c === '000000') throw new MockError('INVALID_TWO_FACTOR_CODE', 'Invalid code');
};
const recoveryCodes = () => Array.from({ length: 10 }, (_, i) => `${(1000 + i * 7).toString(36).padStart(4, 'x')}-${(5000 + i * 13).toString(36).padStart(4, 'y')}`);

const findUser = (id: string): AdminUserSummary => {
  const u = mockStore.adminUsers.find((x) => x.id === id);
  if (!u) throw new MockError('NOT_FOUND', 'User not found');
  return u;
};

function audit(e: Omit<AuditLogEntry, 'id' | 'actor' | 'ip' | 'createdAt'>): string {
  const id = nextId();
  const me = mockMe();
  mockStore.auditLogs.unshift({ ...e, id, actor: { id: me.id, email: me.email }, ip: '127.0.0.1', createdAt: now() });
  return id;
}

function guardBot(u: AdminUserSummary) {
  if (u.isBot) throw new MockError('BOT_ACCOUNT_PROTECTED', 'The signal bot account cannot be modified');
}

export const adminResolvers: { [N in AdminEndpoint]: Resolver<N> } = {
  loginTwoFactor: ({ body }) => {
    checkCode(body.code);
    mockStore.signedIn = true;
    return { user: mockMe() };
  },
  setupTwoFactor: () => (requireUser(), { secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/CEX%20Sim:demo%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=CEX%20Sim' }),
  enableTwoFactor: ({ body }) => {
    requireUser();
    checkCode(body.code);
    mockStore.twoFactorEnabled = true;
    return { recoveryCodes: recoveryCodes() };
  },
  disableTwoFactor: ({ body }) => {
    requireUser();
    checkCode(body.code);
    if (mockStore.role !== 'user') throw new MockError('FORBIDDEN', 'Staff accounts must keep two-factor authentication');
    mockStore.twoFactorEnabled = false;
    return ok;
  },
  regenerateRecoveryCodes: ({ body }) => {
    requireUser();
    checkCode(body.code);
    return { recoveryCodes: recoveryCodes() };
  },

  adminOverview: () => {
    requireStaff('exchange.read');
    const users = mockStore.adminUsers;
    return {
      users: { total: 128, newLast24h: 6, locked: users.filter((u) => u.status === 'locked').length, staff: users.filter((u) => u.role !== 'user').length },
      orders: { open: 37, placedLast24h: 412 },
      trades: { last24h: 655 },
      tradingHalted: mockStore.settings.tradingHalted,
      market: { connection: 'CONNECTED', staleThresholdMs: mockStore.settings.staleThresholdMs, symbols: [] },
      lastReconciliation: mockStore.reconciliationRuns[0] ?? null,
      serverTime: now(),
    };
  },
  adminListUsers: ({ query }) => {
    requireStaff('users.read');
    const q = query.get('q')?.toLowerCase();
    const role = query.get('role');
    const status = query.get('status');
    return {
      items: mockStore.adminUsers.filter((u) => (!q || u.email.includes(q) || u.id === q) && (!role || u.role === role) && (!status || u.status === status)),
      nextCursor: null,
    };
  },
  adminGetUser: ({ params }) => {
    requireStaff('users.read');
    const u = findUser(params.userId!);
    return { ...fixtureAdminUserDetail(u.id)!, user: u };
  },
  adminUserOrders: ({ params, query }) => {
    requireStaff('users.read');
    findUser(params.userId!);
    const isDemo = params.userId!.endsWith('000000000001');
    return { items: isDemo ? (query.get('open') === 'false' ? fixtureOrderHistory : fixtureOpenOrders) : [], nextCursor: null };
  },
  adminUserLedger: ({ params }) => {
    requireStaff('users.read');
    findUser(params.userId!);
    return { items: params.userId!.endsWith('000000000001') ? fixtureLedger : [], nextCursor: null };
  },
  adminLockUser: ({ params, body }) => {
    requireStaff('users.lock');
    const u = findUser(params.userId!);
    guardBot(u);
    audit({ action: 'USER_LOCK', targetType: 'USER', targetId: u.id, before: { status: u.status }, after: { status: 'locked' }, reason: String(body.reason) });
    u.status = 'locked';
    return u;
  },
  adminUnlockUser: ({ params, body }) => {
    requireStaff('users.lock');
    const u = findUser(params.userId!);
    guardBot(u);
    audit({ action: 'USER_UNLOCK', targetType: 'USER', targetId: u.id, before: { status: u.status }, after: { status: 'active' }, reason: String(body.reason) });
    u.status = 'active';
    return u;
  },
  adminSetSignalsAccess: ({ params, body }) => {
    requireStaff('users.signals');
    const u = findUser(params.userId!);
    audit({ action: 'USER_SIGNALS_ACCESS', targetType: 'USER', targetId: u.id, before: { signalsAccess: u.signalsAccess }, after: { signalsAccess: !!body.enabled }, reason: String(body.reason) });
    u.signalsAccess = !!body.enabled;
    return u;
  },
  adminSetRole: ({ params, body }) => {
    requireStaff('users.roles');
    const u = findUser(params.userId!);
    guardBot(u);
    if (u.id === mockMe().id) throw new MockError('FORBIDDEN', 'You cannot change your own role');
    const role = body.role as AdminUserSummary['role'];
    audit({ action: 'USER_ROLE', targetType: 'USER', targetId: u.id, before: { role: u.role }, after: { role }, reason: String(body.reason) });
    u.role = role;
    return u;
  },
  adminAdjustBalance: ({ params, body }) => {
    requireStaff('balances.adjust');
    const u = findUser(params.userId!);
    guardBot(u);
    const amount = Number(body.amount);
    const before = 10000;
    if (before + amount < 0) throw new MockError('INSUFFICIENT_BALANCE', 'Debit larger than the available balance', { available: '10000.00000000' });
    const after = (before + amount).toFixed(8);
    const auditLogId = audit({ action: 'BALANCE_ADJUST', targetType: 'USER', targetId: u.id, before: { asset: body.asset, available: before.toFixed(8) }, after: { asset: body.asset, available: after }, reason: String(body.reason) });
    return {
      balance: { asset: String(body.asset), available: after, locked: '0.00000000', total: after, valueUsdt: body.asset === 'USDT' ? after : null },
      entry: { id: nextId(), asset: String(body.asset), type: 'ADMIN_ADJUST', deltaAvailable: amount.toFixed(8), deltaLocked: '0.00000000', availableAfter: after, lockedAfter: '0.00000000', refType: 'ADMIN', refId: auditLogId, createdAt: now() },
      auditLogId,
    };
  },
  adminResetAccount: ({ params, body }) => {
    requireStaff('accounts.reset');
    const u = findUser(params.userId!);
    guardBot(u);
    audit({ action: 'ACCOUNT_RESET', targetType: 'USER', targetId: u.id, before: { note: 'balances and open orders before reset' }, after: { balances: [] }, reason: String(body.reason) });
    return { ...fixtureAdminUserDetail(u.id)!, user: u, balances: [], totalValueUsdt: '0.00000000', unpricedAssets: [], openOrders: 0, faucetTotalClaimed: '0.00000000' };
  },
  adminGetSettings: () => (requireStaff('exchange.read'), mockStore.settings),
  adminUpdateSettings: ({ body }) => {
    requireStaff('exchange.configure');
    const s = mockStore.settings;
    const before = { ...s, faucet: { ...s.faucet } };
    if (body.feeRate !== undefined) s.feeRate = String(body.feeRate);
    if (body.faucetAmount !== undefined) s.faucet.amount = Number(body.faucetAmount).toFixed(8);
    if (body.faucetCooldownHours !== undefined) s.faucet.cooldownHours = Number(body.faucetCooldownHours);
    if (body.faucetLifetimeCap !== undefined) s.faucet.lifetimeCap = Number(body.faucetLifetimeCap).toFixed(8);
    if (body.staleThresholdMs !== undefined) s.staleThresholdMs = Number(body.staleThresholdMs);
    s.updatedAt = now();
    audit({ action: 'SETTINGS_UPDATE', targetType: 'EXCHANGE', targetId: null, before, after: { ...s }, reason: String(body.reason) });
    return s;
  },
  adminHaltTrading: ({ body }) => {
    requireStaff('exchange.halt');
    audit({ action: 'TRADING_HALT', targetType: 'EXCHANGE', targetId: null, before: { tradingHalted: mockStore.settings.tradingHalted }, after: { tradingHalted: true }, reason: String(body.reason) });
    mockStore.settings.tradingHalted = true;
    mockStore.scenario = 'halted';
    return mockStore.settings;
  },
  adminResumeTrading: ({ body }) => {
    requireStaff('exchange.halt');
    audit({ action: 'TRADING_RESUME', targetType: 'EXCHANGE', targetId: null, before: { tradingHalted: mockStore.settings.tradingHalted }, after: { tradingHalted: false }, reason: String(body.reason) });
    mockStore.settings.tradingHalted = false;
    if (mockStore.scenario === 'halted') mockStore.scenario = 'normal';
    return mockStore.settings;
  },
  adminListSymbols: () => (requireStaff('exchange.read'), { items: mockStore.adminSymbols }),
  adminUpdateSymbol: ({ params, body }) => {
    requireStaff('exchange.configure');
    const s = mockStore.adminSymbols.find((x) => x.symbol === params.symbol);
    if (!s) throw new MockError('NOT_FOUND', 'Unknown symbol');
    audit({ action: 'SYMBOL_UPDATE', targetType: 'SYMBOL', targetId: s.symbol, before: { enabled: s.adminEnabled }, after: { enabled: !!body.enabled, cancelOpenOrders: !!body.cancelOpenOrders }, reason: String(body.reason) });
    s.adminEnabled = !!body.enabled;
    s.enabled = s.adminEnabled && s.sourceStatus === 'TRADING';
    if (!body.enabled && body.cancelOpenOrders) s.openOrders = 0;
    s.updatedAt = now();
    return s;
  },
  adminAuditLogs: ({ query }) => {
    requireStaff('audit.read');
    const action = query.get('action');
    const actorId = query.get('actorId');
    const targetId = query.get('targetId');
    return {
      items: mockStore.auditLogs.filter((e) => (!action || e.action === action) && (!actorId || e.actor?.id === actorId) && (!targetId || e.targetId === targetId)),
      nextCursor: null,
    };
  },
  adminReconciliationRuns: () => (requireStaff('reconciliation.read'), { items: mockStore.reconciliationRuns, nextCursor: null }),
  adminRunReconciliation: () => {
    requireStaff('reconciliation.run');
    const t = now();
    const run = { id: nextId(), startedAt: t, finishedAt: t, ok: true, checkedBalances: 128, mismatches: [] };
    mockStore.reconciliationRuns.unshift(run);
    audit({ action: 'RECONCILIATION_RUN', targetType: 'EXCHANGE', targetId: null, before: null, after: { ok: true }, reason: null });
    return run;
  },
  adminUpdateAsset: ({ params, body }) => {
    requireStaff('exchange.configure');
    let a = mockStore.assets.find((x) => x.asset === params.asset);
    if (!a) throw new MockError('NOT_FOUND', 'Unknown asset');
    const before = { ...a };
    a = Object.assign(a, {
      ...(body.name !== undefined ? { name: body.name as string | null } : {}),
      ...(body.tags !== undefined ? { tags: body.tags as AssetTag[] } : {}),
      ...(body.description !== undefined ? { description: body.description as string | null } : {}),
    });
    audit({ action: 'ASSET_UPDATE', targetType: 'ASSET', targetId: a.asset, before, after: { ...a }, reason: String(body.reason) });
    return a;
  },
  adminListAnnouncements: ({ query }) => {
    requireStaff('exchange.read');
    const all = query.get('includeHidden') === 'true';
    return { items: mockStore.announcements.filter((a) => all || !a.hidden), nextCursor: null };
  },
  adminCreateAnnouncement: ({ body }) => {
    requireStaff('content.manage');
    const t = now();
    const me = mockMe();
    const a: AdminAnnouncement = {
      id: nextId(),
      title: String(body.title),
      body: String(body.body),
      level: (body.level as AnnouncementLevel | undefined) ?? 'INFO',
      pinned: Boolean(body.pinned),
      publishedAt: body.publish === false ? null : t,
      expiresAt: (body.expiresAt as string | null | undefined) ?? null,
      hidden: false,
      createdBy: { id: me.id, email: me.email },
      createdAt: t,
      updatedAt: t,
    };
    mockStore.announcements.unshift(a);
    audit({ action: 'ANNOUNCEMENT_CREATE', targetType: 'ANNOUNCEMENT', targetId: a.id, before: null, after: { ...a }, reason: null });
    return a;
  },
  adminUpdateAnnouncement: ({ params, body }) => {
    requireStaff('content.manage');
    const a = mockStore.announcements.find((x) => x.id === params.announcementId);
    if (!a) throw new MockError('NOT_FOUND', 'Announcement not found');
    const before = { ...a };
    if (body.title !== undefined) a.title = String(body.title);
    if (body.body !== undefined) a.body = String(body.body);
    if (body.level !== undefined) a.level = body.level as AnnouncementLevel;
    if (body.pinned !== undefined) a.pinned = Boolean(body.pinned);
    if (body.hidden !== undefined) a.hidden = Boolean(body.hidden);
    if (body.expiresAt !== undefined) a.expiresAt = body.expiresAt as string | null;
    if (body.published === true && a.publishedAt === null) a.publishedAt = now();
    if (body.published === false) a.publishedAt = null;
    a.updatedAt = now();
    audit({ action: 'ANNOUNCEMENT_UPDATE', targetType: 'ANNOUNCEMENT', targetId: a.id, before, after: { ...a }, reason: null });
    return a;
  },
};
