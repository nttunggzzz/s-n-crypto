import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { ApiError } from '@cex/contracts';
import { auditLogs, users } from '../../db/schema.ts';
import { ApiHarness } from '../../../test/apiHarness.ts';
import { loadConfig } from '../../config.ts';

// Closed staging: REGISTRATION=invite (the production default).
const h = new ApiHarness();
beforeAll(async () => {
  await h.start({ env: { REGISTRATION: 'invite' } });
});
afterAll(async () => {
  await h.stop();
});

const refused = (reason: string) => (e: unknown) => e instanceof ApiError && e.code === 'INVALID_INVITE' && (e.details as { reason?: string })?.reason === reason;
let n = 0;
const signUp = (inviteCode?: string, email = `inv${++n}-${Date.now()}@test.local`) =>
  h.browser().register({ body: { email, password: 'correct horse battery', name: 'Khách mời', ...(inviteCode !== undefined ? { inviteCode } : {}) } });

describe('closed registration (invite codes)', () => {
  it('publicConfig tells the apps; no code / an unknown code is refused', async () => {
    expect(await h.browser().publicConfig()).toEqual({ registration: 'INVITE_ONLY', captchaSiteKey: null, emailVerificationRequired: true, emailDelivery: 'log', marketFeed: 'off' });
    await expect(signUp()).rejects.toSatisfy(refused('MISSING'));
    await expect(signUp('ZZZZ-ZZZZ-ZZZZ')).rejects.toSatisfy(refused('UNKNOWN'));
  });

  it('staff create a code (shown once); typed in any case / spacing it works until its uses run out', async () => {
    const admin = await h.staff('admin');
    const created = await admin.b.adminCreateInvite({ body: { note: 'Nhóm thử nghiệm', maxUses: 2 } });
    expect(created.code).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/);
    expect(created.link).toBe(`http://localhost:5173/register?invite=${created.code}`);
    expect(created.invite).toMatchObject({ note: 'Nhóm thử nghiệm', maxUses: 2, uses: 0, status: 'ACTIVE', codePrefix: created.code.slice(0, 4), createdBy: { id: admin.id } });

    const typed = ` ${created.code.toLowerCase().replace(/-/g, ' ')} `;
    const { user } = await signUp(typed);
    const [row] = await h.env.database.db.select().from(users).where(eq(users.id, user.id));
    expect(row!.inviteId).toBe(Number(created.invite.id));
    await signUp(created.code);
    await expect(signUp(created.code)).rejects.toSatisfy(refused('USED_UP'));
    const list = await admin.b.adminListInvites({ query: { status: 'USED_UP' } });
    expect(list.items.map((i) => i.id)).toContain(created.invite.id);
    expect(JSON.stringify(list)).not.toContain(created.code.replace(/-/g, '')); // never listed again
  });

  it('two sign-ups racing for the last use: exactly one gets in', async () => {
    const admin = await h.staff('admin');
    const { code } = await admin.b.adminCreateInvite({ body: { note: 'một lượt', maxUses: 1 } });
    const results = await Promise.allSettled([signUp(code), signUp(code), signUp(code)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected' && refused('USED_UP')(r.reason))).toHaveLength(2);
  });

  it('a sign-up that fails (email taken) does not use up the code', async () => {
    const admin = await h.staff('admin');
    const { code } = await admin.b.adminCreateInvite({ body: { note: 'giữ lượt', maxUses: 1 } });
    await expect(signUp(code, admin.email)).rejects.toSatisfy((e) => e instanceof ApiError && e.code === 'CONFLICT');
    await signUp(code);
  });

  it('expired and revoked codes are refused; revoking is audited with the reason', async () => {
    const admin = await h.staff('admin');
    const soon = await admin.b.adminCreateInvite({ body: { note: 'hết hạn', expiresInDays: 1 } });
    h.skewMs = 2 * 86_400_000;
    try {
      await expect(signUp(soon.code)).rejects.toSatisfy(refused('EXPIRED'));
    } finally {
      h.skewMs = 0;
    }

    const later = await admin.b.adminCreateInvite({ body: { note: 'thu hồi' } });
    const revoked = await admin.b.adminRevokeInvite({ params: { inviteId: later.invite.id }, body: { reason: 'gửi nhầm người' } });
    expect(revoked.status).toBe('REVOKED');
    await expect(signUp(later.code)).rejects.toSatisfy(refused('REVOKED'));
    await expect(admin.b.adminRevokeInvite({ params: { inviteId: later.invite.id }, body: { reason: 'gửi nhầm người' } })).rejects.toSatisfy((e) => e instanceof ApiError && e.code === 'CONFLICT');

    const rows = await h.env.database.db.select().from(auditLogs).where(and(eq(auditLogs.targetType, 'INVITE'), eq(auditLogs.targetId, later.invite.id)));
    expect(rows.map((r) => r.action).sort()).toEqual(['INVITE_CREATE', 'INVITE_REVOKE']);
    expect(rows.find((r) => r.action === 'INVITE_REVOKE')).toMatchObject({ actorId: admin.id, reason: 'gửi nhầm người' });
  });

  it('support staff cannot create invites; the command-line path writes an audit row without an actor', async () => {
    const support = await h.staff('support');
    await expect(support.b.adminCreateInvite({ body: { note: 'x' } })).rejects.toSatisfy((e) => e instanceof ApiError && e.code === 'FORBIDDEN');
    const cli = await h.auth.invites.create({ user: null }, { note: 'Chủ dự án', maxUses: 1, expiresInDays: 14 });
    expect(cli.invite.createdBy).toBeNull();
    const [row] = await h.env.database.db.select().from(auditLogs).where(and(eq(auditLogs.action, 'INVITE_CREATE'), eq(auditLogs.targetId, cli.invite.id)));
    expect(row).toMatchObject({ actorId: null, reason: 'created from the server command line' });
    await signUp(cli.code);
  });
});

describe('registration mode defaults', () => {
  it('invite in production, open elsewhere; Turnstile keys go together', () => {
    const prod = { NODE_ENV: 'production', EMAIL_TRANSPORT: 'resend', DATA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64') };
    expect(loadConfig(prod).REGISTRATION).toBe('invite');
    expect(loadConfig({ ...prod, REGISTRATION: 'open' }).REGISTRATION).toBe('open');
    expect(loadConfig({ NODE_ENV: 'development' }).REGISTRATION).toBe('open');
    expect(() => loadConfig({ TURNSTILE_SECRET: 'secret-only' })).toThrow(/go together/);
  });

  it('production without a mail domain: emails to the log only on a closed (invite-only) server', () => {
    const prod = { NODE_ENV: 'production', DATA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64') };
    expect(loadConfig({ ...prod, EMAIL_TRANSPORT: 'log' }).EMAIL_TRANSPORT).toBe('log');
    expect(() => loadConfig({ ...prod, EMAIL_TRANSPORT: 'log', REGISTRATION: 'open' })).toThrow(/not allowed in production/);
    expect(() => loadConfig({ ...prod, EMAIL_TRANSPORT: 'file' })).toThrow(/not allowed in production/);
  });
});
