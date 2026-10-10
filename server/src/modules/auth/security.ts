import { and, count, desc, eq, gt, isNull, lt } from 'drizzle-orm';
import type { LoginEvent, SecurityOverview } from '@cex/contracts';
import { loginEvents, notifications, sessions, users } from '../../db/schema.ts';
import type { Db } from '../../db/client.ts';
import { logger } from '../../logger.ts';
import { sha256 } from './crypto.ts';
import type { EmailSender } from './email.ts';

type UserRow = typeof users.$inferSelect;
type LoginEventRow = typeof loginEvents.$inferSelect;
export type LoginResultCode = LoginEventRow['result'];

const KEEP_MS = 180 * 86_400_000;

/** "Chrome · Windows" from a user agent (best effort; null when unknown). */
export function describeDevice(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Thiết bị khác';
}

export function maskCode(code: string | null): string | null {
  return code === null ? null : `${code.slice(0, 2)}${'*'.repeat(Math.max(code.length - 2, 2))}`;
}

/** Prepends the user's anti-phishing code to an email body (every email we send goes through this). */
export function withAntiPhishing(user: Pick<UserRow, 'antiPhishingCode'>, text: string): string {
  return user.antiPhishingCode ? `Mã chống lừa đảo của bạn: ${user.antiPhishingCode}\n\n${text}` : text;
}

export function serializeLoginEvent(e: LoginEventRow): LoginEvent {
  return { id: String(e.id), at: e.at.toISOString(), ip: e.ip, device: describeDevice(e.userAgent), success: e.success, result: e.result, newDevice: e.newDevice };
}

/**
 * Sign-in history and the new-device alert. A device = the browser's user agent (hashed).
 * The first successful sign-in from a device the account has not used in 180 days sends an alert
 * email (with the anti-phishing code) and an in-app notification — except the very first one.
 */
export class SecurityService {
  constructor(
    private readonly db: Db,
    private readonly email: EmailSender,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async record(user: UserRow, client: { ip?: string; userAgent?: string }, result: LoginResultCode): Promise<void> {
    const t = this.now();
    const deviceKey = sha256(client.userAgent ?? '');
    let newDevice = false;
    if (result === 'OK') {
      const [known] = await this.db
        .select({ n: count() })
        .from(loginEvents)
        .where(and(eq(loginEvents.userId, user.id), eq(loginEvents.success, true), eq(loginEvents.deviceKey, deviceKey), gt(loginEvents.at, new Date(t.getTime() - KEEP_MS))));
      const [any] = await this.db
        .select({ n: count() })
        .from(loginEvents)
        .where(and(eq(loginEvents.userId, user.id), eq(loginEvents.success, true)));
      newDevice = (any?.n ?? 0) > 0 && (known?.n ?? 0) === 0;
    }
    await this.db.insert(loginEvents).values({ userId: user.id, at: t, ip: client.ip ?? null, userAgent: client.userAgent?.slice(0, 300) ?? null, deviceKey, success: result === 'OK', result, newDevice });
    await this.db.delete(loginEvents).where(and(eq(loginEvents.userId, user.id), lt(loginEvents.at, new Date(t.getTime() - KEEP_MS))));
    if (!newDevice) return;
    const device = describeDevice(client.userAgent);
    await this.db.insert(notifications).values({ userId: user.id, type: 'NEW_DEVICE_LOGIN', payload: { ip: client.ip ?? null, device, at: t.toISOString() } });
    try {
      await this.email.send({
        to: user.email,
        subject: 'Đăng nhập từ thiết bị mới — Sàn mô phỏng',
        text: withAntiPhishing(
          user,
          `Tài khoản của bạn vừa đăng nhập từ thiết bị mới.\n\nThiết bị: ${device ?? 'không rõ'}\nIP: ${client.ip ?? 'không rõ'}\nThời gian: ${t.toISOString()} (UTC)\n\nNếu không phải bạn, hãy đổi mật khẩu ngay và bật xác thực 2 lớp.`,
        ),
      });
    } catch (err) {
      logger.warn({ err, userId: user.id }, 'new-device email failed');
    }
  }

  async overview(user: UserRow): Promise<SecurityOverview> {
    const [last] = await this.db
      .select()
      .from(loginEvents)
      .where(and(eq(loginEvents.userId, user.id), eq(loginEvents.success, true)))
      .orderBy(desc(loginEvents.id))
      .limit(1);
    const [s] = await this.db
      .select({ n: count() })
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt), gt(sessions.expiresAt, this.now())));
    return {
      twoFactorEnabled: user.twoFactorEnabledAt !== null,
      antiPhishingCode: maskCode(user.antiPhishingCode),
      emailVerified: user.emailVerifiedAt !== null,
      passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
      lastLogin: last ? serializeLoginEvent(last) : null,
      activeSessions: s?.n ?? 0,
    };
  }

  async history(userId: string, cursor: number | undefined, limit: number) {
    const rows = await this.db
      .select()
      .from(loginEvents)
      .where(and(eq(loginEvents.userId, userId), cursor ? lt(loginEvents.id, cursor) : undefined))
      .orderBy(desc(loginEvents.id))
      .limit(limit + 1);
    const more = rows.length > limit;
    const items = more ? rows.slice(0, limit) : rows;
    return { items: items.map(serializeLoginEvent), nextCursor: more ? String(items[items.length - 1]!.id) : null };
  }
}
