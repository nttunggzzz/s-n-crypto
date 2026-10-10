import { createApiClient, createRealtimeClient, type ApiClient, type RealtimeClient } from '@cex/contracts';

const isMockEnabled = import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true';

let apiClientInstance: ApiClient | null = null;
let realtimeClientInstance: RealtimeClient | null = null;

export function getApiClient(): ApiClient {
  if (!apiClientInstance) {
    apiClientInstance = createApiClient({
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
