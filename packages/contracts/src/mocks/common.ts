/** ⚠️ Shared helpers for the MSW mock resolvers — UI development only. */
import type { EndpointName, EndpointOutput } from '../endpoints.ts';
import type { ErrorCode } from '../errors.ts';
import { fixtureMe } from '../fixtures/index.ts';
import { hasPermission, ROLE_PERMISSIONS, STAFF_ROLES, type Permission } from '../permissions.ts';
import { mockStore } from './store.ts';

export class MockError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string = code,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface Req {
  params: Record<string, string>;
  query: URLSearchParams;
  body: Record<string, unknown>;
}

export type Resolver<N extends EndpointName> = (req: Req) => EndpointOutput<N> | Promise<EndpointOutput<N>>;

export const requireUser = () => {
  if (!mockStore.signedIn) throw new MockError('UNAUTHENTICATED', 'Sign in required');
};

export const requireVerified = () => {
  requireUser();
  if (mockStore.scenario === 'unverified') throw new MockError('EMAIL_NOT_VERIFIED', 'Verify your email first');
};

/** Same order of checks as the server: signed in → staff role → 2FA → permission. */
export const requireStaff = (p: Permission) => {
  requireUser();
  if (!STAFF_ROLES.includes(mockStore.role)) throw new MockError('FORBIDDEN', 'Staff only');
  if (!mockStore.twoFactorEnabled) throw new MockError('TWO_FACTOR_REQUIRED', 'Enable two-factor authentication to use the admin area');
  if (!hasPermission(mockStore.role, p)) throw new MockError('FORBIDDEN', `Missing permission ${p}`);
};

export const mockMe = () => ({
  ...fixtureMe,
  name: mockStore.phase26.name,
  avatar: mockStore.phase26.avatar,
  emailVerified: mockStore.scenario !== 'unverified',
  role: mockStore.role,
  twoFactorEnabled: mockStore.twoFactorEnabled,
  permissions: [...ROLE_PERMISSIONS[mockStore.role]],
});

export const now = () => new Date().toISOString();
export const ok = { ok: true as const };
