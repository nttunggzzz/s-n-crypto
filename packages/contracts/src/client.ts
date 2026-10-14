import { ApiErrorBody, ApiError } from './errors.ts';
import { buildPath, endpoints, type ClientEndpointName, type EndpointDef, type EndpointInput, type EndpointOutput } from './endpoints.ts';

export interface ApiClientOptions {
  /** Origin of the API, e.g. "https://staging.example.com". Empty = same origin. */
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Validate every response against its schema (recommended in development). */
  validateResponses?: boolean;
  /** Extra headers per request (mobile app: Authorization bearer). */
  headers?: () => Record<string, string>;
}

// `{} extends X` = "every field of X is optional" (the input may be omitted)
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type Args<N extends ClientEndpointName> = {} extends EndpointInput<N> ? [input?: EndpointInput<N>] : [input: EndpointInput<N>];

/** One method per JSON / CSV endpoint. Binary endpoints (`format: 'binary'`) have none: use their URL helper. */
export type ApiClient = {
  call<N extends ClientEndpointName>(name: N, ...args: Args<N>): Promise<EndpointOutput<N>>;
} & { [N in ClientEndpointName]: (...args: Args<N>) => Promise<EndpointOutput<N>> };

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? '';
  const doFetch = options.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

  async function call<N extends ClientEndpointName>(name: N, ...args: Args<N>): Promise<EndpointOutput<N>> {
    const def = endpoints[name] as EndpointDef;
    if (def.format === 'binary') throw new Error(`${name} returns bytes: load it by URL (e.g. journalAttachmentUrl), not through the client`);
    const input = (args[0] ?? {}) as { params?: Record<string, string>; query?: Record<string, unknown>; body?: unknown };
    let url = baseUrl + buildPath(def.path, input.params);
    if (input.query) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(input.query)) if (v !== undefined && v !== null) qs.set(k, String(v));
      const s = qs.toString();
      if (s) url += `?${s}`;
    }
    const hasBody = def.method !== 'GET' && def.method !== 'DELETE';
    const res = await doFetch(url, {
      method: def.method,
      credentials: 'include',
      headers: { ...(hasBody ? { 'content-type': 'application/json' } : {}), ...options.headers?.() },
      body: hasBody ? JSON.stringify(input.body ?? {}) : undefined,
    });
    const text = await res.text();
    const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
    const json: unknown = text && isJson ? JSON.parse(text) : null;
    if (!res.ok) {
      const parsed = ApiErrorBody.safeParse(json);
      if (parsed.success) {
        const e = parsed.data.error;
        throw new ApiError(res.status, e.code, e.message, e.details);
      }
      throw new ApiError(res.status, 'INTERNAL_ERROR', `HTTP ${res.status}`);
    }
    // fetch's text() drops the UTF-8 BOM; keep it so a saved file opens correctly in Excel.
    if (def.format === 'csv') return (text.startsWith('\uFEFF') ? text : '\uFEFF' + text) as EndpointOutput<N>;
    if (options.validateResponses) return def.response.parse(json) as EndpointOutput<N>;
    return json as EndpointOutput<N>;
  }

  const client = { call } as ApiClient;
  for (const name of Object.keys(endpoints) as ClientEndpointName[]) {
    if ((endpoints[name] as EndpointDef).format === 'binary') continue;
    (client as Record<string, unknown>)[name] = (...args: unknown[]) => (call as (n: ClientEndpointName, ...a: unknown[]) => unknown)(name, ...args);
  }
  return client;
}

/**
 * URL of a CSV export for a plain download link, e.g.
 * <a href={exportUrl('exportTrades', { symbol: 'BTCUSDT' })} download>. The session cookie authenticates it.
 */
export function exportUrl(name: 'exportOrders' | 'exportTrades' | 'exportLedger' | 'taxExport' | 'adminTaxExport', query: Record<string, string | undefined> = {}, baseUrl = ''): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined) qs.set(k, v);
  const s = qs.toString();
  return baseUrl + endpoints[name].path + (s ? `?${s}` : '');
}

/**
 * URL of a journal image for `<img src={journalAttachmentUrl(a.id)}>` (same origin: the session cookie authenticates it;
 * anyone else gets 404). The bytes are served as-is (endpoint `journalAttachment`, format 'binary').
 */
export function journalAttachmentUrl(attachmentId: string, baseUrl = ''): string {
  return baseUrl + buildPath(endpoints.journalAttachment.path, { attachmentId });
}
