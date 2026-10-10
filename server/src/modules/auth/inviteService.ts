import { createHash, randomInt } from 'node:crypto';
import { and, desc, eq, gt, isNotNull, isNull, lt, lte, sql, type SQL } from 'drizzle-orm';
import type { CreatedInvite, Invite, InviteRefusal, InviteStatus } from '@cex/contracts';
import { invites, users } from '../../db/schema.ts';
import type { Db, DbOrTx } from '../../db/client.ts';
import { AppError } from '../../lib/errors.ts';
import { writeAudit } from '../admin/audit.ts';
import { idCursor } from '../admin/adminService.ts';

type Row = typeof invites.$inferSelect;
/** Staff member acting (null = server command line). */
export interface InviteActor {
  user: { id: string; email: string } | null;
  ip?: string;
}

/** Unambiguous characters (no 0/O, 1/I/L, U): codes are typed by hand. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 12; // 30^12 ≈ 5×10^17 — not guessable, sign-up is rate limited too
const DAY = 86_400_000;

/** "abcd efgh-jkmn" → "ABCDEFGHJKMN" (what the user typed, normalized). */
export const normalizeInviteCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
const hashCode = (code: string) => createHash('sha256').update(normalizeInviteCode(code)).digest('hex');
const format = (code: string) => code.match(/.{1,4}/g)!.join('-');

function statusOf(r: Row, now: Date): InviteStatus {
  if (r.revokedAt) return 'REVOKED';
  if (r.uses >= r.maxUses) return 'USED_UP';
  if (r.expiresAt <= now) return 'EXPIRED';
  return 'ACTIVE';
}

/** Sign-up invite codes for a closed (staging) exchange; every create / revoke is audited in the same transaction. */
export class InviteService {
  constructor(
    private readonly db: Db,
    private readonly appUrl: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private toApi(r: Row, creatorEmail: string | null): Invite {
    return {
      id: String(r.id),
      codePrefix: r.codePrefix,
      note: r.note,
      maxUses: r.maxUses,
      uses: r.uses,
      status: statusOf(r, this.now()),
      expiresAt: r.expiresAt.toISOString(),
      revokedAt: r.revokedAt?.toISOString() ?? null,
      createdBy: r.createdBy && creatorEmail ? { id: r.createdBy, email: creatorEmail } : null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async create(actor: InviteActor, input: { note: string; maxUses: number; expiresInDays: number }): Promise<CreatedInvite> {
    const code = Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    const row = await this.db.transaction(async (tx) => {
      const [r] = await tx
        .insert(invites)
        .values({
          codeHash: hashCode(code),
          codePrefix: code.slice(0, 4),
          note: input.note.trim(),
          maxUses: input.maxUses,
          expiresAt: new Date(this.now().getTime() + input.expiresInDays * DAY),
          createdBy: actor.user?.id ?? null,
        })
        .returning();
      await writeAudit(tx, {
        actorId: actor.user?.id ?? null,
        action: 'INVITE_CREATE',
        targetType: 'INVITE',
        targetId: String(r!.id),
        after: { codePrefix: r!.codePrefix, note: r!.note, maxUses: r!.maxUses, expiresAt: r!.expiresAt.toISOString() },
        reason: actor.user ? null : 'created from the server command line',
        ip: actor.ip,
      });
      return r!;
    });
    return { invite: this.toApi(row, actor.user?.email ?? null), code: format(code), link: `${this.appUrl}/register?invite=${format(code)}` };
  }

  async list(status: InviteStatus | undefined, cursor: string | undefined, limit: number): Promise<{ items: Invite[]; nextCursor: string | null }> {
    const c = idCursor(cursor);
    const t = this.now();
    const byStatus: Record<InviteStatus, SQL | undefined> = {
      REVOKED: isNotNull(invites.revokedAt),
      USED_UP: and(isNull(invites.revokedAt), sql`${invites.uses} >= ${invites.maxUses}`),
      EXPIRED: and(isNull(invites.revokedAt), sql`${invites.uses} < ${invites.maxUses}`, lte(invites.expiresAt, t)),
      ACTIVE: and(isNull(invites.revokedAt), sql`${invites.uses} < ${invites.maxUses}`, gt(invites.expiresAt, t)),
    };
    const rows = await this.db
      .select({ i: invites, email: users.email })
      .from(invites)
      .leftJoin(users, eq(users.id, invites.createdBy))
      .where(and(status ? byStatus[status] : undefined, c !== undefined ? lt(invites.id, c) : undefined))
      .orderBy(desc(invites.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    return { items: page.map((r) => this.toApi(r.i, r.email)), nextCursor: rows.length > limit ? String(page.at(-1)!.i.id) : null };
  }

  async revoke(actor: InviteActor, id: string, reason: string): Promise<Invite> {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(invites).where(eq(invites.id, Number(id))).for('update');
      if (!before) throw new AppError('NOT_FOUND', 'Invite not found');
      if (before.revokedAt) throw new AppError('CONFLICT', 'Invite already revoked');
      const [after] = await tx.update(invites).set({ revokedAt: this.now() }).where(eq(invites.id, before.id)).returning();
      await writeAudit(tx, {
        actorId: actor.user?.id ?? null,
        action: 'INVITE_REVOKE',
        targetType: 'INVITE',
        targetId: id,
        before: { status: statusOf(before, this.now()), uses: before.uses },
        after: { status: 'REVOKED' },
        reason,
        ip: actor.ip,
      });
      const [creator] = after!.createdBy ? await tx.select({ email: users.email }).from(users).where(eq(users.id, after!.createdBy)) : [];
      return this.toApi(after!, creator?.email ?? null);
    });
  }

  /**
   * Takes one use of `code` inside the sign-up transaction; refuses with INVALID_INVITE (details.reason).
   * The conditional UPDATE makes concurrent sign-ups on the last use safe: only one gets the row back.
   */
  async consume(tx: DbOrTx, code: string | undefined): Promise<number> {
    const refuse = (reason: InviteRefusal): never => {
      throw new AppError('INVALID_INVITE', `Invite code refused: ${reason}`, { reason, field: 'inviteCode' });
    };
    if (!code || !normalizeInviteCode(code)) return refuse('MISSING');
    const t = this.now();
    const hash = hashCode(code);
    const [taken] = await tx
      .update(invites)
      .set({ uses: sql`${invites.uses} + 1` })
      .where(and(eq(invites.codeHash, hash), isNull(invites.revokedAt), gt(invites.expiresAt, t), sql`${invites.uses} < ${invites.maxUses}`))
      .returning({ id: invites.id });
    if (taken) return taken.id;
    const [row] = await tx.select().from(invites).where(eq(invites.codeHash, hash));
    if (!row) return refuse('UNKNOWN');
    const s = statusOf(row, t);
    return refuse(s === 'REVOKED' ? 'REVOKED' : s === 'USED_UP' ? 'USED_UP' : 'EXPIRED');
  }
}
