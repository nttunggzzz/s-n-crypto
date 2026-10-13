import type { AnalysisDepartmentId } from '@cex/contracts';

export interface LlmNarrativeRequest {
  department: AnalysisDepartmentId;
  rolePrompt: string;
  structuredContext: Record<string, unknown>;
  fallbackSummary: string;
}

export interface LlmNarrativeResponse {
  text: string;
  providerId: string;
}

export class LlmProviderError extends Error {
  readonly code: 'RATE_LIMIT' | 'TIMEOUT' | 'DISCONNECTED' | 'UPSTREAM_ERROR';
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    code: 'RATE_LIMIT' | 'TIMEOUT' | 'DISCONNECTED' | 'UPSTREAM_ERROR',
    opts?: { retryable?: boolean; retryAfterMs?: number },
  ) {
    super(message);
    this.name = 'LlmProviderError';
    this.code = code;
    this.retryable = opts?.retryable ?? (code === 'RATE_LIMIT' || code === 'TIMEOUT' || code === 'DISCONNECTED');
    this.retryAfterMs = opts?.retryAfterMs;
  }
}

export interface AnalysisLlmProvider {
  readonly providerId: string;
  generateNarrative(req: LlmNarrativeRequest): Promise<LlmNarrativeResponse>;
  reconnect?(): Promise<void>;
}

/**
 * Default zero-credential, deterministic narrator that synthesizes concise human-readable findings
 * strictly from verified `@cex/core` decimal metrics (no external API keys required).
 */
export class DeterministicQuantNarrator implements AnalysisLlmProvider {
  readonly providerId = 'deterministic-quant-narrator';

  async generateNarrative(req: LlmNarrativeRequest): Promise<LlmNarrativeResponse> {
    return {
      text: req.fallbackSummary,
      providerId: this.providerId,
    };
  }
}

export interface ResilientLlmAdapterOptions {
  primaryProvider?: AnalysisLlmProvider;
  fallbackProvider?: AnalysisLlmProvider;
  maxRetries?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  timeoutMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
}

export interface LlmAdapterTelemetry {
  totalCalls: number;
  totalAttempts: number;
  rateLimitHits: number;
  timeoutHits: number;
  reconnectAttempts: number;
  reconnectSuccesses: number;
  fallbackActivations: number;
  connectionState: 'CONNECTED' | 'RECONNECTING' | 'DEGRADED_FALLBACK';
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Wraps an `AnalysisLlmProvider` with retry, rate-limit backoff, timeout, reconnect,
 * and deterministic fallback guarantees.
 */
export class ResilientLlmAdapter {
  private readonly primary: AnalysisLlmProvider;
  private readonly fallback: AnalysisLlmProvider;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly timeoutMs: number;
  private readonly sleepFn: (ms: number) => Promise<void>;

  private readonly stats: LlmAdapterTelemetry = {
    totalCalls: 0,
    totalAttempts: 0,
    rateLimitHits: 0,
    timeoutHits: 0,
    reconnectAttempts: 0,
    reconnectSuccesses: 0,
    fallbackActivations: 0,
    connectionState: 'CONNECTED',
  };

  constructor(options?: ResilientLlmAdapterOptions) {
    this.fallback = options?.fallbackProvider ?? new DeterministicQuantNarrator();
    this.primary = options?.primaryProvider ?? this.fallback;
    this.maxRetries = options?.maxRetries ?? 2;
    this.baseBackoffMs = options?.baseBackoffMs ?? 15;
    this.maxBackoffMs = options?.maxBackoffMs ?? 250;
    this.timeoutMs = options?.timeoutMs ?? 2_000;
    this.sleepFn = options?.sleepFn ?? defaultSleep;
  }

  get providerId(): string {
    return this.stats.connectionState === 'DEGRADED_FALLBACK'
      ? `${this.primary.providerId}->${this.fallback.providerId}`
      : this.primary.providerId;
  }

  getTelemetry(): LlmAdapterTelemetry {
    return { ...this.stats };
  }

  async narrate(req: LlmNarrativeRequest): Promise<LlmNarrativeResponse & { attempts: number; usedFallback: boolean }> {
    this.stats.totalCalls++;
    let attempts = 0;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      attempts++;
      this.stats.totalAttempts++;
      try {
        const res = await this.invokeWithTimeout(this.primary.generateNarrative(req));
        this.stats.connectionState = 'CONNECTED';
        return { ...res, attempts, usedFallback: false };
      } catch (err) {
        const providerErr = this.normalizeError(err);
        if (providerErr.code === 'RATE_LIMIT') {
          this.stats.rateLimitHits++;
        } else if (providerErr.code === 'TIMEOUT') {
          this.stats.timeoutHits++;
        } else if (providerErr.code === 'DISCONNECTED' && this.primary.reconnect) {
          this.stats.connectionState = 'RECONNECTING';
          this.stats.reconnectAttempts++;
          try {
            await this.primary.reconnect();
            this.stats.reconnectSuccesses++;
            this.stats.connectionState = 'CONNECTED';
          } catch {
            // Reconnect failed; continue retry/fallback loop
          }
        }

        if (!providerErr.retryable || attempt >= this.maxRetries) {
          break;
        }

        const backoff = Math.min(
          this.maxBackoffMs,
          providerErr.retryAfterMs ?? this.baseBackoffMs * Math.pow(2, attempt),
        );
        if (backoff > 0) {
          await this.sleepFn(backoff);
        }
      }
    }

    this.stats.fallbackActivations++;
    this.stats.connectionState = 'DEGRADED_FALLBACK';
    const fb = await this.fallback.generateNarrative(req);
    return { ...fb, attempts, usedFallback: true };
  }

  private async invokeWithTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new LlmProviderError(`LLM request timed out after ${this.timeoutMs}ms`, 'TIMEOUT'));
          }, this.timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private normalizeError(err: unknown): LlmProviderError {
    if (err instanceof LlmProviderError) return err;
    const msg = err instanceof Error ? err.message : String(err);
    if (/429|rate.?limit/i.test(msg)) {
      return new LlmProviderError(msg, 'RATE_LIMIT', { retryable: true });
    }
    if (/timeout|timed out/i.test(msg)) {
      return new LlmProviderError(msg, 'TIMEOUT', { retryable: true });
    }
    if (/disconnect|econnreset|socket hang up/i.test(msg)) {
      return new LlmProviderError(msg, 'DISCONNECTED', { retryable: true });
    }
    return new LlmProviderError(msg, 'UPSTREAM_ERROR', { retryable: false });
  }
}
