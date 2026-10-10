/**
 * ⚠️ Development-only mocks. Import from '@cex/contracts/mocks' and only when
 * `import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true'`.
 *
 *   import { setupWorker } from 'msw/browser';
 *   import { createMockHandlers, createMockRealtimeClient, setMockScenario, setMockPrice } from '@cex/contracts/mocks';
 *   await setupWorker(...createMockHandlers()).start({ onUnhandledRequest: 'bypass' });
 *   const realtime = createMockRealtimeClient();
 *   // setMockScenario('empty' | 'error' | 'halted' | 'signedOut' | 'unverified') to see every UI state
 *   // setMockPrice('BTCUSDT', 75000) to fire stops / OCO / TP-SL / price alerts on demand
 *   // setMockRole('admin') (or 'support' | 'owner' | 'user') for the admin app; setMockRole('admin', false) = 2FA not set up
 *   // setMockFuturesPrice('BTCUSDT', 70000) to fire futures limit fills / TP / SL / liquidation; mockSettleFunding() for a funding payment
 *   // setMockRegistration('INVITE_ONLY') for the closed-staging sign-up (demo code DEMO-MOCK-2026); ('OPEN', 'sim') for the simulated-prices banner
 */
export { createMockHandlers, type MockHandlerOptions } from './handlers.ts';
export { createMockRealtimeClient, type MockRealtimeOptions } from './realtime.ts';
export { mockStore, resetMockStore, setMockRole, setMockScenario, type MockScenario } from './store.ts';
export { setMockPrice } from './engine.ts';
export { mockSettleFunding, setMockFuturesPrice } from './futures.ts';
export { setMockRegistration } from './invites.ts';
