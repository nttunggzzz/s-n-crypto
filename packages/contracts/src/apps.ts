import type { Role } from './common.ts';
import { STAFF_ROLES } from './permissions.ts';

/**
 * The exchange app and the admin app are ONE product on ONE origin: the server serves the exchange
 * at `/` and the admin app at `/admin/` (Vite `base: '/admin/'`). Both use the same session cookie and
 * the same `/ws`, so a staff member signed in on the exchange is signed in on the admin app too
 * (the admin API still requires 2FA on that session).
 *
 * Links between the two apps come from here, never hand-written. In dev the two Vite servers run on
 * different ports — pass the other app's origin (`import.meta.env.VITE_EXCHANGE_ORIGIN` /
 * `VITE_ADMIN_ORIGIN`); in production leave it empty (same origin).
 */
export const ADMIN_BASE_PATH = '/admin';

const join = (origin: string | undefined, path: string) => `${(origin ?? '').replace(/\/+$/, '')}${path}`;

export const appLinks = {
  /** Pages of the exchange app (`apps/exchange`) — used by the admin app to show what a user sees. */
  exchange: {
    home: (origin?: string) => join(origin, '/'),
    markets: (origin?: string) => join(origin, '/markets'),
    trade: (symbol: string, origin?: string) => join(origin, `/trade/${encodeURIComponent(symbol)}`),
    futures: (symbol: string, origin?: string) => join(origin, `/futures/${encodeURIComponent(symbol)}`),
    /** Sign-in, then back to `next` (e.g. the admin app sends staff here: `login(appLinks.admin.home(ADMIN))`). */
    login: (next?: string, origin?: string) => join(origin, next ? `/login?next=${encodeURIComponent(next)}` : '/login'),
    /** Registration with the invite code filled in (the link `adminCreateInvite` returns has this shape). */
    register: (inviteCode?: string, origin?: string) => join(origin, inviteCode ? `/register?invite=${encodeURIComponent(inviteCode)}` : '/register'),
  },
  /** Pages of the admin app (`apps/admin`, under `/admin/`) — used by the exchange app's "Quản trị" link. */
  admin: {
    home: (origin?: string) => join(origin, `${ADMIN_BASE_PATH}/`),
    user: (userId: string, origin?: string) => join(origin, `${ADMIN_BASE_PATH}/users/${encodeURIComponent(userId)}`),
    symbols: (origin?: string) => join(origin, `${ADMIN_BASE_PATH}/symbols`),
    auditLogs: (origin?: string) => join(origin, `${ADMIN_BASE_PATH}/audit-logs`),
  },
} as const;

/** Show the exchange's link to the admin app? (Only a hint — the admin API decides, and needs 2FA.) */
export function canOpenAdmin(me: { role: Role } | null | undefined): boolean {
  return !!me && STAFF_ROLES.includes(me.role);
}

/**
 * Where the exchange's sign-in page may send the user after signing in: a path on this origin
 * (`/admin/`, `/trade/BTCUSDT`) or a URL on one of `allowedOrigins` (dev: the admin Vite server).
 * Anything else (another site, `//evil.example`, `javascript:`) → null: go to the default page.
 */
export function safeNext(next: string | null | undefined, allowedOrigins: readonly string[] = []): string | null {
  if (!next) return null;
  if (next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')) return next;
  try {
    const u = new URL(next);
    return allowedOrigins.some((o) => new URL(o).origin === u.origin) ? u.href : null;
  } catch {
    return null;
  }
}
