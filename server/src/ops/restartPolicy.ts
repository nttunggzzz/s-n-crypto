/**
 * Restart policy of the self-hosted supervisor (scripts/hostStack.ts, O1): when the server dies on its own,
 * PostgreSQL keeps running and the server is started again after 5 s, then 30 s, then every 2 minutes while it
 * keeps dying. A run of 10 minutes or more counts as healthy and starts the sequence over.
 */
export const RESTART_DELAYS_MS = [5_000, 30_000, 120_000] as const;
export const HEALTHY_RUN_MS = 10 * 60_000;

/**
 * `streak` = restarts in a row so far (0 = none since the last healthy run), `uptimeMs` = how long the server ran
 * before this exit. Returns the new streak (1 = first restart after a healthy run) and the wait before starting.
 */
export function nextRestart(streak: number, uptimeMs: number): { streak: number; delayMs: number } {
  const n = uptimeMs >= HEALTHY_RUN_MS ? 1 : streak + 1;
  return { streak: n, delayMs: RESTART_DELAYS_MS[Math.min(n, RESTART_DELAYS_MS.length) - 1]! };
}

/**
 * Exit code for the log / alert. Windows reports a native crash as an NTSTATUS code, readable only in hex:
 * 3221226505 → "3221226505 = 0xC0000409" (fail-fast: abort() / assertion in native code).
 */
export function describeExit(code: number | null, signal: NodeJS.Signals | null): string {
  if (code === null) return signal ? `signal ${signal}` : 'no exit code';
  if (code < 0 || code > 0xffff) return `${code} = 0x${(code >>> 0).toString(16).toUpperCase()}`;
  return String(code);
}

/** "45s", "12m", "3h05m" — how long a run lasted. */
export function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`;
}
