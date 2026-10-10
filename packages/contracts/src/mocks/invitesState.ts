/** ⚠️ Initial state of the mock invites (own file: the store imports it without a cycle). */
import type { Invite, PublicConfig, RegistrationMode } from '../index.ts';

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

export interface MockInvitesState {
  registration: RegistrationMode;
  marketFeed: PublicConfig['marketFeed'];
  invites: (Invite & { code: string })[];
}

export function initialInvitesState(): MockInvitesState {
  const t = Date.parse('2026-10-10T03:00:00.000Z');
  return {
    registration: 'OPEN',
    marketFeed: 'binance',
    invites: [
      { id: '9001', code: 'DEMOMOCK2026', codePrefix: 'DEMO', note: 'Mã demo của mock (luôn dùng được)', maxUses: 100, uses: 3, status: 'ACTIVE', expiresAt: iso(t + 365 * DAY), revokedAt: null, createdBy: null, createdAt: iso(t) },
      { id: '9002', code: 'USEDUSEDUSED', codePrefix: 'USED', note: 'Chị Lan — đã dùng', maxUses: 1, uses: 1, status: 'USED_UP', expiresAt: iso(t + 14 * DAY), revokedAt: null, createdBy: { id: 'u-admin', email: 'admin@example.com' }, createdAt: iso(t - DAY) },
    ],
  };
}
