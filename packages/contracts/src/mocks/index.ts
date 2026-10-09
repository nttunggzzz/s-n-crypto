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
 */
export { createMockHandlers, type MockHandlerOptions } from './handlers.ts';
export { createMockRealtimeClient, type MockRealtimeOptions } from './realtime.ts';
export { mockStore, resetMockStore, setMockScenario, type MockScenario } from './store.ts';
export { setMockPrice } from './engine.ts';
