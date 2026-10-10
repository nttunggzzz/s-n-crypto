/**
 * ⚠️ Mock invite codes + public config (closed staging, 0.10.0) — UI development only.
 * Registration is OPEN by default; `setMockRegistration('INVITE_ONLY')` shows the invite-code field.
 * In INVITE_ONLY mode the demo code `DEMO-MOCK-2026` always works; codes made with adminCreateInvite work too.
 */
import type { Invite, InviteRefusal, PublicConfig, RegistrationMode } from '../index.ts';
import { MockError, mockMe, now, requireStaff, type Resolver } from './common.ts';
import { audit } from './admin.ts';
import { mockStore, nextId } from './store.ts';
export { initialInvitesState, type MockInvitesState } from './invitesState.ts';

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

/** UI dev: see the sign-up page of a closed (invite-only) server, or the "simulated prices" banner. */
export function setMockRegistration(mode: RegistrationMode, marketFeed: PublicConfig['marketFeed'] = mockStore.invites.marketFeed): void {
  mockStore.invites.registration = mode;
  mockStore.invites.marketFeed = marketFeed;
}

const normalize = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
const format = (code: string) => code.match(/.{1,4}/g)!.join('-');
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const status = (i: Invite & { code: string }): Invite['status'] =>
  i.revokedAt ? 'REVOKED' : i.uses >= i.maxUses ? 'USED_UP' : Date.parse(i.expiresAt) <= Date.now() ? 'EXPIRED' : 'ACTIVE';
const pub = (i: Invite & { code: string }): Invite => {
  const { code: _code, ...rest } = i;
  return { ...rest, status: status(i) };
};

/** Same rule as the server: in INVITE_ONLY mode a sign-up consumes one use of a valid code. */
export function mockConsumeInvite(code: unknown): void {
  if (mockStore.invites.registration !== 'INVITE_ONLY') return;
  const refuse = (reason: InviteRefusal) => {
    throw new MockError('INVALID_INVITE', `Invite code refused: ${reason}`, { reason });
  };
  if (typeof code !== 'string' || !code.trim()) return refuse('MISSING');
  const inv = mockStore.invites.invites.find((i) => i.code === normalize(code));
  if (!inv) return refuse('UNKNOWN');
  const s = status(inv);
  if (s !== 'ACTIVE') return refuse(s === 'USED_UP' ? 'USED_UP' : s === 'EXPIRED' ? 'EXPIRED' : 'REVOKED');
  inv.uses++;
}

type InviteEndpoint = 'publicConfig' | 'adminListInvites' | 'adminCreateInvite' | 'adminRevokeInvite';

export const inviteResolvers: { [N in InviteEndpoint]: Resolver<N> } = {
  publicConfig: () => ({
    registration: mockStore.invites.registration,
    captchaSiteKey: null,
    emailVerificationRequired: true,
    marketFeed: mockStore.invites.marketFeed,
  }),
  adminListInvites: ({ query }) => {
    requireStaff('users.invite');
    const wanted = query.get('status');
    return { items: mockStore.invites.invites.map(pub).filter((i) => !wanted || i.status === wanted), nextCursor: null };
  },
  adminCreateInvite: ({ body }) => {
    requireStaff('users.invite');
    const code = Array.from({ length: 12 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
    const me = mockMe();
    const t = Date.now();
    const inv = {
      id: nextId(),
      code,
      codePrefix: code.slice(0, 4),
      note: String(body.note).trim(),
      maxUses: Number(body.maxUses ?? 1),
      uses: 0,
      status: 'ACTIVE' as const,
      expiresAt: iso(t + Number(body.expiresInDays ?? 14) * DAY),
      revokedAt: null,
      createdBy: { id: me.id, email: me.email },
      createdAt: now(),
    };
    mockStore.invites.invites.unshift(inv);
    audit({ action: 'INVITE_CREATE', targetType: 'INVITE', targetId: inv.id, before: null, after: pub(inv), reason: null });
    return { invite: pub(inv), code: format(code), link: `${globalThis.location?.origin ?? 'http://localhost:5173'}/register?invite=${format(code)}` };
  },
  adminRevokeInvite: ({ params, body }) => {
    requireStaff('users.invite');
    const inv = mockStore.invites.invites.find((i) => i.id === params.inviteId);
    if (!inv) throw new MockError('NOT_FOUND', 'Invite not found');
    if (inv.revokedAt) throw new MockError('CONFLICT', 'Invite already revoked');
    const before = pub(inv);
    inv.revokedAt = now();
    audit({ action: 'INVITE_REVOKE', targetType: 'INVITE', targetId: inv.id, before, after: pub(inv), reason: String(body.reason) });
    return pub(inv);
  },
};
