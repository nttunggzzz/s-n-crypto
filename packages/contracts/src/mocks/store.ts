/**
 * ⚠️ MOCK backend state for UI development (MSW). Simplified on purpose — the real
 * matching, fees and balances live on the server. Uses JS numbers internally; never copy
 * this math into the UI.
 */
import type { AdminSymbol, AdminUserSummary, AuditLogEntry, Balance, ExchangeSettings, MarketTrade, Notification, Order, OrderList, Preferences, PriceAlert, ReconciliationRun, Role, Trade, UserEvent } from '../index.ts';
import {
  fixtureAdminSymbols,
  fixtureAdminUsers,
  fixtureAlerts,
  fixtureAuditLogs,
  fixtureExchangeSettings,
  fixtureMyTrades,
  fixtureNotifications,
  fixtureOpenOrders,
  fixtureOrderHistory,
  fixtureOrderList,
  fixturePreferences,
  fixtureReconciliationRuns,
  MOCK_PAIRS,
} from '../fixtures/index.ts';

export type MockScenario = 'normal' | 'empty' | 'error' | 'halted' | 'signedOut' | 'unverified';

type Listener = (e: UserEvent) => void;

const initialBalances = (): Record<string, { available: number; locked: number }> => ({
  BTC: { available: 0.00359391, locked: 0.01248 },
  ETH: { available: 0.25, locked: 0.5 },
  LINK: { available: 3, locked: 0 },
  USDT: { available: 6955.5904, locked: 699.98 },
});

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const mockStore = {
  scenario: 'normal' as MockScenario,
  signedIn: true,
  /** Role of the signed-in mock user — see setMockRole(). */
  role: 'user' as Role,
  twoFactorEnabled: false,
  adminUsers: clone(fixtureAdminUsers) as AdminUserSummary[],
  auditLogs: clone(fixtureAuditLogs) as AuditLogEntry[],
  settings: clone(fixtureExchangeSettings) as ExchangeSettings,
  adminSymbols: clone(fixtureAdminSymbols) as AdminSymbol[],
  reconciliationRuns: clone(fixtureReconciliationRuns) as ReconciliationRun[],
  faucetClaimedAt: Date.parse('2026-10-09T03:00:00.000Z') as number | null,
  totalClaimed: 10000,
  balances: initialBalances(),
  openOrders: clone(fixtureOpenOrders) as Order[],
  history: clone(fixtureOrderHistory) as Order[],
  trades: clone(fixtureMyTrades) as Trade[],
  orderLists: [clone(fixtureOrderList)] as OrderList[],
  alerts: clone(fixtureAlerts) as PriceAlert[],
  notifications: clone(fixtureNotifications) as Notification[],
  preferences: clone(fixturePreferences) as Preferences,
  nextId: 1000,
  prices: Object.fromEntries(Object.entries(MOCK_PAIRS).map(([s, p]) => [s, p.price])) as Record<string, number>,
  listeners: new Set<Listener>(),
  marketListeners: new Set<(symbol: string, t: MarketTrade) => void>(),
};

/** Back to the initial demo state (call between tests / from a dev toolbar). */
export function resetMockStore(scenario: MockScenario = 'normal'): void {
  const empty = scenario === 'empty';
  mockStore.scenario = scenario;
  mockStore.signedIn = scenario !== 'signedOut';
  mockStore.faucetClaimedAt = Date.parse('2026-10-09T03:00:00.000Z');
  mockStore.totalClaimed = 10000;
  mockStore.balances = initialBalances();
  mockStore.openOrders = empty ? [] : clone(fixtureOpenOrders);
  mockStore.history = empty ? [] : clone(fixtureOrderHistory);
  mockStore.trades = empty ? [] : clone(fixtureMyTrades);
  mockStore.orderLists = empty ? [] : [clone(fixtureOrderList)];
  mockStore.alerts = empty ? [] : clone(fixtureAlerts);
  mockStore.notifications = empty ? [] : clone(fixtureNotifications);
  mockStore.preferences = clone(fixturePreferences);
  mockStore.adminUsers = clone(fixtureAdminUsers);
  mockStore.auditLogs = clone(fixtureAuditLogs);
  mockStore.settings = { ...clone(fixtureExchangeSettings), tradingHalted: scenario === 'halted' };
  mockStore.adminSymbols = clone(fixtureAdminSymbols);
  mockStore.reconciliationRuns = clone(fixtureReconciliationRuns);
  mockStore.nextId = 1000;
  mockStore.prices = Object.fromEntries(Object.entries(MOCK_PAIRS).map(([s, p]) => [s, p.price]));
}

export function setMockScenario(s: MockScenario): void {
  const { role, twoFactorEnabled } = mockStore;
  resetMockStore(s);
  mockStore.role = role;
  mockStore.twoFactorEnabled = twoFactorEnabled;
}

/**
 * Sign the mock user in as `role`. Staff roles get 2FA on by default (pass false to see the
 * "enable 2FA first" screen of the admin app).
 */
export function setMockRole(role: Role, twoFactorEnabled = role !== 'user'): void {
  mockStore.role = role;
  mockStore.twoFactorEnabled = twoFactorEnabled;
  mockStore.signedIn = true;
}

export function nextId(): string {
  return String(mockStore.nextId++);
}

export function emitUser(e: UserEvent): void {
  mockStore.listeners.forEach((l) => l(e));
}

type NotificationInput = Notification extends infer T ? (T extends unknown ? Omit<T, 'id' | 'readAt' | 'createdAt'> : never) : never;

export function notify(n: NotificationInput): void {
  const full = { ...n, id: nextId(), readAt: null, createdAt: new Date().toISOString() } as Notification;
  mockStore.notifications.unshift(full);
  emitUser({ kind: 'notification', notification: full });
}

export function balanceOf(asset: string): Balance {
  const b = mockStore.balances[asset] ?? { available: 0, locked: 0 };
  const price = asset === 'USDT' ? 1 : asset === 'LINK' ? null : (mockStore.prices[`${asset}USDT`] ?? null);
  const total = b.available + b.locked;
  return {
    asset,
    available: b.available.toFixed(8),
    locked: b.locked.toFixed(8),
    total: total.toFixed(8),
    valueUsdt: price === null ? null : (total * price).toFixed(8),
  };
}

export function adjust(asset: string, dAvailable: number, dLocked = 0): void {
  const b = (mockStore.balances[asset] ??= { available: 0, locked: 0 });
  b.available = Math.round((b.available + dAvailable) * 1e8) / 1e8;
  b.locked = Math.round((b.locked + dLocked) * 1e8) / 1e8;
  emitUser({ kind: 'balance', balance: balanceOf(asset) });
}
