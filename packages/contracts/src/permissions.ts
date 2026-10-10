import { z } from 'zod';
import type { Role } from './common.ts';

/**
 * Permissions are the unit of access control. Roles map to permissions in ONE place (here);
 * the server checks permissions, the UI only uses them to show/hide controls.
 */
export const Permission = z.enum([
  'users.read',
  'users.lock',
  'users.signals',
  /** change roles — owner only */
  'users.roles',
  'balances.adjust',
  'accounts.reset',
  'exchange.read',
  'exchange.configure',
  'exchange.halt',
  'audit.read',
  'reconciliation.read',
  'reconciliation.run',
  /** exchange announcements */
  'content.manage',
  /** stop a user's grid bot / cancel a recurring buy */
  'bots.manage',
]);
export type Permission = z.infer<typeof Permission>;

const SUPPORT: Permission[] = ['users.read', 'exchange.read', 'reconciliation.read'];
const ADMIN: Permission[] = [
  ...SUPPORT,
  'users.lock',
  'users.signals',
  'balances.adjust',
  'accounts.reset',
  'exchange.configure',
  'exchange.halt',
  'audit.read',
  'reconciliation.run',
  'content.manage',
  'bots.manage',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  user: [],
  support: SUPPORT,
  admin: ADMIN,
  owner: [...ADMIN, 'users.roles'],
};

/** Roles that may use the admin API (always with 2FA). */
export const STAFF_ROLES: readonly Role[] = ['support', 'admin', 'owner'];

export function hasPermission(role: Role, p: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(p);
}
