import { and, count, desc, eq, inArray, isNull, lt, type SQL } from 'drizzle-orm';
import type { Notification } from '@cex/contracts';
import { notifications } from '../../db/schema.ts';
import type { Db, DbOrTx } from '../../db/client.ts';
import type { NotificationRow } from './events.ts';
import type { Outcome } from './outcome.ts';

/** Notification without the fields the server assigns. */
export type NotificationInput = Notification extends infer T ? (T extends unknown ? Omit<T, 'id' | 'readAt' | 'createdAt'> : never) : never;

export function serializeNotification(row: NotificationRow): Notification {
  return { ...(row.payload as object), type: row.type, id: String(row.id), readAt: row.readAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() } as Notification;
}

export class NotificationService {
  constructor(private readonly db: Db) {}

  /** Inserts inside the caller's transaction; delivered after commit via the Outcome. */
  async create(tx: DbOrTx, out: Outcome, userId: string, input: NotificationInput): Promise<void> {
    const { type, ...payload } = input;
    const [row] = await tx.insert(notifications).values({ userId, type, payload }).returning();
    out.notifications.push(row!);
  }

  async list(userId: string, unreadOnly: boolean, cursor: number | undefined, limit: number) {
    const where: SQL[] = [eq(notifications.userId, userId)];
    if (unreadOnly) where.push(isNull(notifications.readAt));
    if (cursor) where.push(lt(notifications.id, cursor));
    const rows = await this.db
      .select()
      .from(notifications)
      .where(and(...where))
      .orderBy(desc(notifications.id))
      .limit(limit + 1);
    const more = rows.length > limit;
    const items = more ? rows.slice(0, limit) : rows;
    return { items: items.map(serializeNotification), nextCursor: more ? String(items[items.length - 1]!.id) : null };
  }

  async unread(userId: string): Promise<number> {
    const [r] = await this.db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return r?.n ?? 0;
  }

  async markRead(userId: string, req: { ids?: string[]; all?: true }): Promise<number> {
    const where: SQL[] = [eq(notifications.userId, userId), isNull(notifications.readAt)];
    if (!req.all) {
      const ids = (req.ids ?? []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0);
      if (ids.length === 0) return this.unread(userId);
      where.push(inArray(notifications.id, ids));
    }
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(...where));
    return this.unread(userId);
  }
}
