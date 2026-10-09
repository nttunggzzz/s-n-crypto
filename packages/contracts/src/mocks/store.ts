/**
 * ⚠️ MOCK backend state for UI development (MSW). Simplified on purpose — the real
 * matching, fees and balances live on the server. Uses JS numbers internally; never copy
 * this math into the UI.
 */
import type { Balance, MarketTrade, Order, Trade, UserEvent } from '../index.ts';
import { fixtureMe, fixtureMyTrades, fixtureOpenOrders, fixtureOrderHistory, MOCK_PAIRS } from '../fixtures/index.ts';

export type MockScenario = 'normal' | 'empty' | 'error' | 'halted' | 'signedOut' | 'unverified';

type Listener = (e: UserEvent) => void;

const initialBalances = (): Record<string, { available: number; locked: number }> => ({
  BTC: { available: 0.01211787, locked: 0 },
  ETH: { available: 0.5, locked: 0.25 },
  LINK: { available: 3, locked: 0 },
  USDT: { available: 7155.5704, locked: 500 },
});

export const mockStore = {
  scenario: 'normal' as MockScenario,
  signedIn: true,
  faucetClaimedAt: Date.parse('2026-10-09T03:00:00.000Z') as number | null,
  totalClaimed: 10000,
  balances: initialBalances(),
  openOrders: [...fixtureOpenOrders] as Order[],
  history: [...fixtureOrderHistory] as Order[],
  trades: [...fixtureMyTrades] as Trade[],
  nextId: 1000,
  prices: Object.fromEntries(Object.entries(MOCK_PAIRS).map(([s, p]) => [s, p.price])) as Record<string, number>,
  listeners: new Set<Listener>(),
  marketListeners: new Set<(symbol: string, t: MarketTrade) => void>(),
};

/** Back to the initial demo state (call between tests / from a dev toolbar). */
export function resetMockStore(scenario: MockScenario = 'normal'): void {
  mockStore.scenario = scenario;
  mockStore.signedIn = scenario !== 'signedOut';
  mockStore.faucetClaimedAt = Date.parse('2026-10-09T03:00:00.000Z');
  mockStore.totalClaimed = 10000;
  mockStore.balances = initialBalances();
  mockStore.openOrders = scenario === 'empty' ? [] : [...fixtureOpenOrders];
  mockStore.history = scenario === 'empty' ? [] : [...fixtureOrderHistory];
  mockStore.trades = scenario === 'empty' ? [] : [...fixtureMyTrades];
  mockStore.nextId = 1000;
  mockStore.prices = Object.fromEntries(Object.entries(MOCK_PAIRS).map(([s, p]) => [s, p.price]));
}

export function setMockScenario(s: MockScenario): void {
  resetMockStore(s);
}

export function mockMe() {
  return { ...fixtureMe, emailVerified: mockStore.scenario !== 'unverified' };
}

export function emitUser(e: UserEvent): void {
  mockStore.listeners.forEach((l) => l(e));
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
