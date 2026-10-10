import type { ChannelData, ClientMessage, ServerMessage } from './realtime.ts';

export type RealtimeStatus = 'connecting' | 'open' | 'closed';

export interface RealtimeClient {
  subscribe<C extends string>(channel: C, onData: (data: ChannelData<C>) => void): () => void;
  onStatus(cb: (status: RealtimeStatus) => void): () => void;
  /** Server-side errors, e.g. subscribing to `user` while signed out. */
  onError(cb: (err: { code: string; message: string; channel?: string }) => void): () => void;
  /**
   * Opens a new connection, keeping every subscription. The server reads the session cookie only when
   * the connection opens, so call this right after sign-in (incl. 2FA) and sign-out — otherwise the
   * `user` channel stays refused (UNAUTHENTICATED) or keeps the old account until the page reloads.
   */
  reconnect(): void;
  close(): void;
}

export interface RealtimeClientOptions {
  /** e.g. "wss://staging.example.com/ws"; default: same origin `/ws`. */
  url?: string;
  /** Max reconnect delay in ms (exponential backoff). */
  maxBackoffMs?: number;
}

/** Browser WebSocket client with auto-reconnect and automatic re-subscription. */
export function createRealtimeClient(options: RealtimeClientOptions = {}): RealtimeClient {
  const loc = (globalThis as { location?: { protocol: string; host: string } }).location;
  const url = options.url ?? (loc ? `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/ws` : 'ws://localhost:8080/ws');
  const maxBackoff = options.maxBackoffMs ?? 15_000;
  const listeners = new Map<string, Set<(d: unknown) => void>>();
  const statusCbs = new Set<(s: RealtimeStatus) => void>();
  const errorCbs = new Set<(e: { code: string; message: string; channel?: string }) => void>();
  let ws: WebSocket | null = null;
  let attempt = 0;
  let closedByUser = false;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const setStatus = (s: RealtimeStatus) => statusCbs.forEach((cb) => cb(s));
  const send = (m: ClientMessage) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  };

  function connect() {
    setStatus('connecting');
    ws = new WebSocket(url);
    ws.onopen = () => {
      attempt = 0;
      setStatus('open');
      for (const channel of listeners.keys()) send({ type: 'subscribe', channel });
      pingTimer = setInterval(() => send({ type: 'ping' }), 20_000);
    };
    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      if (msg.type === 'event') listeners.get(msg.channel)?.forEach((cb) => cb(msg.data));
      else if (msg.type === 'error') errorCbs.forEach((cb) => cb(msg));
    };
    ws.onclose = () => {
      clearInterval(pingTimer);
      setStatus('closed');
      if (closedByUser) return;
      const delay = Math.min(maxBackoff, 500 * 2 ** attempt++);
      retryTimer = setTimeout(connect, delay);
    };
  }
  connect();

  return {
    subscribe(channel, onData) {
      let set = listeners.get(channel);
      if (!set) {
        set = new Set();
        listeners.set(channel, set);
        send({ type: 'subscribe', channel });
      }
      set.add(onData as (d: unknown) => void);
      return () => {
        set.delete(onData as (d: unknown) => void);
        if (set.size === 0) {
          listeners.delete(channel);
          send({ type: 'unsubscribe', channel });
        }
      };
    },
    onStatus(cb) {
      statusCbs.add(cb);
      return () => statusCbs.delete(cb);
    },
    onError(cb) {
      errorCbs.add(cb);
      return () => errorCbs.delete(cb);
    },
    reconnect() {
      if (closedByUser) return;
      clearTimeout(retryTimer);
      clearInterval(pingTimer);
      const old = ws;
      if (old) {
        old.onclose = null; // no "closed" status and no backoff retry for the connection we replace
        old.onmessage = null;
        old.close();
      }
      attempt = 0;
      connect();
    },
    close() {
      closedByUser = true;
      clearTimeout(retryTimer);
      ws?.close();
    },
  };
}
