import { ProviderStatus, ProviderTelemetry } from './types';

export interface BaseProviderConfig {
  providerId: string;
  providerName: string;
  category: ProviderTelemetry['category'];
  baseUrl: string;
  timeoutMs?: number;
  maxRetries?: number;
  apiKey?: string;
  activeEndpoints: string[];
  notes?: string;
}

export abstract class BaseProvider {
  protected providerId: string;
  protected providerName: string;
  protected category: ProviderTelemetry['category'];
  protected baseUrl: string;
  protected timeoutMs: number;
  protected maxRetries: number;
  protected apiKey?: string;
  protected activeEndpoints: string[];
  protected notes?: string;

  protected lastSuccessfulFetch: number = 0;
  protected lastFailureTime?: number;
  protected errorCount: number = 0;
  protected successCount: number = 0;
  protected latencyMs: number = 0;
  protected status: ProviderStatus = 'OPERATIONAL';

  constructor(config: BaseProviderConfig) {
    this.providerId = config.providerId;
    this.providerName = config.providerName;
    this.category = config.category;
    this.baseUrl = config.baseUrl;
    this.timeoutMs = config.timeoutMs || 4000;
    this.maxRetries = config.maxRetries || 2;
    this.apiKey = config.apiKey;
    this.activeEndpoints = config.activeEndpoints;
    this.notes = config.notes;
  }

  public getTelemetry(): ProviderTelemetry {
    const totalRequests = this.successCount + this.errorCount;
    const errorRate = totalRequests > 0 ? (this.errorCount / totalRequests) * 100 : 0;
    const freshness = this.lastSuccessfulFetch > 0 ? Math.round((Date.now() - this.lastSuccessfulFetch) / 1000) : 9999;

    return {
      providerId: this.providerId,
      providerName: this.providerName,
      category: this.category,
      status: this.status,
      latencyMs: this.latencyMs,
      lastSuccessfulFetch: this.lastSuccessfulFetch,
      lastFailureTime: this.lastFailureTime,
      errorCount: this.errorCount,
      errorRatePercent: Number(errorRate.toFixed(1)),
      dataFreshnessSec: freshness,
      activeEndpoints: this.activeEndpoints,
      notes: this.notes
    };
  }

  protected async fetchWithRetry<T>(endpoint: string, headers: Record<string, string> = {}): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    let attempt = 0;
    let lastError: any = null;

    while (attempt <= this.maxRetries) {
      const startTime = Date.now();
      try {
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'CryptoIntelligenceSystem/1.0',
            ...headers
          },
          signal: AbortSignal.timeout(this.timeoutMs)
        });

        this.latencyMs = Date.now() - startTime;

        if (response.ok) {
          this.successCount++;
          this.lastSuccessfulFetch = Date.now();
          this.status = 'OPERATIONAL';
          return (await response.json()) as T;
        }

        if (response.status === 429) {
          this.status = 'DEGRADED';
          this.errorCount++;
          this.lastFailureTime = Date.now();
          throw new Error(`Rate limit exceeded on ${this.providerName} (HTTP 429)`);
        }

        throw new Error(`HTTP ${response.status} from ${this.providerName} at ${url}`);
      } catch (err: any) {
        lastError = err;
        attempt++;
        if (attempt <= this.maxRetries) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 200;
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    this.errorCount++;
    this.lastFailureTime = Date.now();
    this.status = this.successCount > 0 ? 'DEGRADED' : 'FAILED';
    throw lastError || new Error(`Failed to fetch from ${this.providerName}`);
  }
}
