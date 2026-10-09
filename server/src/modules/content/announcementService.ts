import { and, desc, eq, gt, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import type { AdminAnnouncement, Announcement, AnnouncementLevel } from '@cex/contracts';
import { announcements, users } from '../../db/schema.ts';
import type { Db } from '../../db/client.ts';
import { AppError } from '../../lib/errors.ts';
import { writeAudit } from '../admin/audit.ts';
import { idCursor, type Actor } from '../admin/adminService.ts';

type Row = typeof announcements.$inferSelect;
type RowWithAuthor = Row & { authorEmail: string | null };

export interface CreateAnnouncementInput {
  title: string;
  body: string;
  level: AnnouncementLevel;
  pinned: boolean;
  publish: boolean;
  expiresAt: string | null;
}

export interface UpdateAnnouncementInput {
  title?: string;
  body?: string;
  level?: AnnouncementLevel;
  pinned?: boolean;
  published?: boolean;
  hidden?: boolean;
  expiresAt?: string | null;
}

const iso = (d: Date) => d.toISOString();

function toPublic(r: Row): Announcement {
  return { id: String(r.id), title: r.title, body: r.body, level: r.level, pinned: r.pinned, publishedAt: iso(r.publishedAt!), expiresAt: r.expiresAt ? iso(r.expiresAt) : null };
}

function toAdmin(r: RowWithAuthor): AdminAnnouncement {
  return {
    id: String(r.id),
    title: r.title,
    body: r.body,
    level: r.level,
    pinned: r.pinned,
    publishedAt: r.publishedAt ? iso(r.publishedAt) : null,
    expiresAt: r.expiresAt ? iso(r.expiresAt) : null,
    hidden: r.hidden,
    createdBy: r.createdBy && r.authorEmail ? { id: r.createdBy, email: r.authorEmail } : null,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}

/** Audit snapshot: content fields only (dates as ISO strings). */
const snapshot = (r: Row) => ({ title: r.title, body: r.body, level: r.level, pinned: r.pinned, publishedAt: r.publishedAt?.toISOString() ?? null, expiresAt: r.expiresAt?.toISOString() ?? null, hidden: r.hidden });

/** Exchange news: public list + staff management (every change audited in the same transaction). */
export class AnnouncementService {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Published, not hidden, not expired — pinned first, then newest. */
  async listPublic(limit: number): Promise<Announcement[]> {
    const t = this.now();
    const rows = await this.db
      .select()
      .from(announcements)
      .where(and(eq(announcements.hidden, false), isNotNull(announcements.publishedAt), sql`${announcements.publishedAt} <= ${t}`, or(isNull(announcements.expiresAt), gt(announcements.expiresAt, t))))
      .orderBy(desc(announcements.pinned), desc(announcements.publishedAt), desc(announcements.id))
      .limit(limit);
    return rows.map(toPublic);
  }

  async listAdmin(includeHidden: boolean, cursor: string | undefined, limit: number) {
    const c = idCursor(cursor);
    const rows = await this.db
      .select({ a: announcements, authorEmail: users.email })
      .from(announcements)
      .leftJoin(users, eq(users.id, announcements.createdBy))
      .where(and(includeHidden ? undefined : eq(announcements.hidden, false), c ? lt(announcements.id, c) : undefined))
      .orderBy(desc(announcements.id))
      .limit(limit + 1);
    const more = rows.length > limit;
    const page = (more ? rows.slice(0, limit) : rows).map((r) => ({ ...r.a, authorEmail: r.authorEmail }));
    return { items: page.map(toAdmin), nextCursor: more ? String(page[page.length - 1]!.id) : null };
  }

  async create(actor: Actor, input: CreateAnnouncementInput): Promise<AdminAnnouncement> {
    const t = this.now();
    const row = await this.db.transaction(async (tx) => {
      const [r] = await tx
        .insert(announcements)
        .values({
          title: input.title,
          body: input.body,
          level: input.level,
          pinned: input.pinned,
          publishedAt: input.publish ? t : null,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          createdBy: actor.user.id,
          createdAt: t,
          updatedAt: t,
        })
        .returning();
      await writeAudit(tx, { actorId: actor.user.id, action: 'ANNOUNCEMENT_CREATE', targetType: 'ANNOUNCEMENT', targetId: String(r!.id), after: snapshot(r!), ip: actor.ip });
      return r!;
    });
    return toAdmin({ ...row, authorEmail: actor.user.email });
  }

  async update(actor: Actor, id: string, input: UpdateAnnouncementInput): Promise<AdminAnnouncement> {
    const t = this.now();
    const row = await this.db.transaction(async (tx) => {
      const [cur] = await tx.select().from(announcements).where(eq(announcements.id, Number(id))).for('update');
      if (!cur) throw new AppError('NOT_FOUND', 'Announcement not found');
      const publishedAt = input.published === true ? (cur.publishedAt ?? t) : input.published === false ? null : cur.publishedAt;
      const [next] = await tx
        .update(announcements)
        .set({
          title: input.title ?? cur.title,
          body: input.body ?? cur.body,
          level: input.level ?? cur.level,
          pinned: input.pinned ?? cur.pinned,
          hidden: input.hidden ?? cur.hidden,
          expiresAt: input.expiresAt === undefined ? cur.expiresAt : input.expiresAt === null ? null : new Date(input.expiresAt),
          publishedAt,
          updatedAt: t,
        })
        .where(eq(announcements.id, cur.id))
        .returning();
      await writeAudit(tx, { actorId: actor.user.id, action: 'ANNOUNCEMENT_UPDATE', targetType: 'ANNOUNCEMENT', targetId: id, before: snapshot(cur), after: snapshot(next!), ip: actor.ip });
      return next!;
    });
    const [author] = row.createdBy ? await this.db.select({ email: users.email }).from(users).where(eq(users.id, row.createdBy)) : [];
    return toAdmin({ ...row, authorEmail: author?.email ?? null });
  }
}
