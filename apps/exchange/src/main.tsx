import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.tsx';
import './index.css';

async function bootstrap() {
  // Initialize MSW mock handlers ONLY if in DEV mode and VITE_USE_MOCKS is enabled
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true') {
    try {
      const { setupWorker } = await import('msw/browser');
      const { createMockHandlers } = await import('@cex/contracts/mocks');

      const worker = setupWorker(...createMockHandlers());
      await worker.start({
        onUnhandledRequest: 'bypass',
        quiet: false,
      });
      console.info('🛠 [CEX] MSW Mock Server Worker started with @cex/contracts fixtures.');
    } catch (err) {
      console.warn('⚠️ [CEX] Không thể khởi động MSW Mock Service Worker:', err);
    }
  }

  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Root element not found');

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

bootstrap();
