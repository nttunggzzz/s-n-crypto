import { createApiClient, createRealtimeClient, type ApiClient, type RealtimeClient } from '@cex/contracts';

const isMockEnabled = import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true';

let apiClientInstance: ApiClient | null = null;
let realtimeClientInstance: RealtimeClient | null = null;

export function getApiClient(): ApiClient {
  if (!apiClientInstance) {
    const defaultFetch = window.fetch.bind(window);
    const interceptingFetch: typeof fetch = async (...args) => {
      const res = await defaultFetch(...args);
      if (res.status === 403) {
        try {
          const clone = res.clone();
          const json = await clone.json();
          if (json?.error?.code === 'TWO_FACTOR_REQUIRED') {
            window.dispatchEvent(new CustomEvent('admin:two-factor-required'));
          }
        } catch {}
      }
      return res;
    };

    apiClientInstance = createApiClient({
      fetch: interceptingFetch,
      validateResponses: import.meta.env.DEV,
    });
  }
  return apiClientInstance;
}

export function getRealtimeClient(): RealtimeClient {
  if (!realtimeClientInstance) {
    realtimeClientInstance = createRealtimeClient();
  }
  return realtimeClientInstance;
}

export function isMockMode(): boolean {
  return isMockEnabled;
}
