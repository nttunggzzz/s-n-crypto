import { EventEmitter } from 'node:events';
import { and, desc, eq, gt, inArray, isNull, lt, ne, or } from 'drizzle-orm';
import { ROLE_PERMISSIONS, STAFF_ROLES, type AvatarId, type Me, type SessionInfo } from '@cex/contracts';
import { recoveryCodes, sessions, users, verificationTokens } from '../../db/schema.ts';
import type { Db } from '../../db/client.ts';
import type { Config } from '../../config.ts';
import { AppError, isUniqueViolation } from '../../lib/errors.ts';
import { RateLimiter } from '../../lib/rateLimit.ts';
import { DUMMY_HASH, hashPassword, newToken, sha256, verifyPassword } from './crypto.ts';
import type { EmailSender } from './email.ts';
import { hashRecoveryCode, newRecoveryCodes, newTotpSecret, otpauthUrl, SecretBox, verifyTotp } from './totp.ts';
import { writeAudit } from '../admin/audit.ts';
import { SecurityService, withAntiPhishing } from './security.ts';
import { InviteService } from './inviteService.ts';

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;

export interface AuthContext {
  user: UserRow;
  session: SessionRow;
}

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

const EMAIL_VERIFY_TTL_MS = 24 * 3600_000;
const PASSWORD_RESET_TTL_MS = 3600_000;
const LAST_SEEN_THROTTLE_MS = 60_000;
const LOGIN_CHALLENGE_TTL_MS = 5 * 60_000;

export type LoginResult = { kind: 'session'; user: UserRow; token: string } | { kind: 'challenge'; challengeToken: string; expiresAt: Date };

export function toMe(u: UserRow): Me {
  return {
    id: u.id,
    uid: String(u.uid),
    email: u.email,
    name: u.name,
    avatar: (u.avatar as AvatarId | null) ?? null,
    emailVerified: u.emailVerifiedAt !== null,
    role: u.role,
    signalsAccess: u.signalsAccess,
    twoFactorEnabled: u.twoFactorEnabledAt !== null,
    permissions: [...ROLE_PERMISSIONS[u.role]],
    createdAt: u.createdAt.toISOString(),
  };
}

export class AuthService {
  /** 5 failed logins per email per 15 minutes. */
  readonly loginFailures = new RateLimiter(5, 15 * 60_000);
  /** 5 wrong second-factor codes per login challenge / per user. */
  private readonly codeFailures = new RateLimiter(5, 15 * 60_000);
  private readonly box: SecretBox;
  /** Sign-in history + new-device alerts. */
  readonly security: SecurityService;
  /** Sign-up invite codes (REGISTRATION=invite, closed staging). */
  readonly invites: InviteService;
  /** 'ended': ids of sessions an admin signed out (AdminService, after commit); the realtime hub closes their /ws at once. */
  readonly sessionEvents = new EventEmitter<{ ended: [sessionIds: string[]] }>();

  constructor(
    private readonly db: Db,
    private readonly config: Config,
    private readonly email: EmailSender,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.box = new SecretBox(config.dataKey);
    this.security = new SecurityService(db, email, now);
    this.invites = new InviteService(db, config.APP_URL, now);
  }

  // ───────── sessions

  private async createSession(userId: string, client: ClientInfo, mfaVerified = false): Promise<{ token: string; session: SessionRow }> {
    const token = newToken();
    const [session] = await this.db
      .insert(sessions)
      .values({
        userId,
        mfaVerified,
        tokenHash: sha256(token),
        ip: client.ip ?? null,
        userAgent: client.userAgent?.slice(0, 300) ?? null,
        expiresAt: new Date(this.now().getTime() + this.config.SESSION_TTL_DAYS * 86_400_000),
      })
      .returning();
    return { token, session: session! };
  }

  /** Resolves a session token (cookie or bearer). Returns null when invalid/expired/revoked. */
  async authenticate(token: string): Promise<AuthContext | null> {
    const rows = await this.db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, this.now())));
    const row = rows[0];
    if (!row || row.user.isBot) return null;
    if (this.now().getTime() - row.session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
      await this.db.update(sessions).set({ lastSeenAt: this.now() }).where(eq(sessions.id, row.session.id));
    }
    return row;
  }

  /** Of `ids`, the sessions that are still signed in (not revoked or expired, account active). */
  async liveSessionIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(inArray(sessions.id, ids), isNull(sessions.revokedAt), gt(sessions.expiresAt, this.now()), eq(users.status, 'active')));
    return new Set(rows.map((r) => r.id));
  }

  // ───────── register / login

  /** With REGISTRATION=invite the invite use and the new user commit together (a failed sign-up keeps the use). */
  async register(input: { email: string; password: string; name: string; inviteCode?: string }, client: ClientInfo) {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await hashPassword(input.password);
    let user: UserRow;
    try {
      user = await this.db.transaction(async (tx) => {
        const inviteId = this.config.REGISTRATION === 'invite' ? await this.invites.consume(tx, input.inviteCode) : null;
        const [row] = await tx.insert(users).values({ email, name: input.name.trim(), passwordHash, inviteId }).returning();
        return row!;
      });
    } catch (err) {
      if (isUniqueViolation(err, 'users_email_uq')) throw new AppError('CONFLICT', 'Email already registered', { field: 'email' });
      throw err;
    }
    await this.sendVerification(user);
    const { token } = await this.createSession(user.id, client);
    await this.security.record(user, client, 'OK'); // this browser becomes a known device
    return { user, token };
  }

  /** Password step. With 2FA on, returns a short-lived challenge instead of a session. */
  async login(input: { email: string; password: string }, client: ClientInfo): Promise<LoginResult> {
    const email = input.email.trim().toLowerCase();
    this.loginFailures.check(`email:${email}`);
    const [user] = await this.db.select().from(users).where(eq(users.email, email));
    const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.passwordHash || user.isBot || !ok) {
      try {
        this.loginFailures.consume(`email:${email}`);
      } catch {
        // the next attempt will be blocked by check()
      }
      if (user && user.passwordHash && !user.isBot) await this.security.record(user, client, 'BAD_PASSWORD');
      throw new AppError('UNAUTHENTICATED', 'Invalid email or password');
    }
    if (user.status === 'locked') {
      await this.security.record(user, client, 'LOCKED');
      throw new AppError('ACCOUNT_LOCKED', 'Account is locked');
    }
    this.loginFailures.reset(`email:${email}`);
    if (user.twoFactorEnabledAt) {
      const challengeToken = await this.issueToken(user.id, 'LOGIN_2FA', LOGIN_CHALLENGE_TTL_MS);
      return { kind: 'challenge', challengeToken, expiresAt: new Date(this.now().getTime() + LOGIN_CHALLENGE_TTL_MS) };
    }
    const { token } = await this.createSession(user.id, client);
    await this.security.record(user, client, 'OK');
    return { kind: 'session', user, token };
  }

  /** Second step: TOTP or recovery code for a login challenge → session (marked mfaVerified). */
  async loginTwoFactor(challengeToken: string, code: string, client: ClientInfo): Promise<{ user: UserRow; token: string }> {
    const key = `challenge:${sha256(challengeToken)}`;
    this.codeFailures.check(key);
    const [ch] = await this.db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.tokenHash, sha256(challengeToken)),
          eq(verificationTokens.purpose, 'LOGIN_2FA'),
          isNull(verificationTokens.usedAt),
          gt(verificationTokens.expiresAt, this.now()),
        ),
      );
    if (!ch) throw new AppError('UNAUTHENTICATED', 'Login expired, sign in again');
    const [user] = await this.db.select().from(users).where(eq(users.id, ch.userId));
    if (!user || user.isBot || !user.twoFactorEnabledAt) throw new AppError('UNAUTHENTICATED', 'Login expired, sign in again');
    if (user.status === 'locked') throw new AppError('ACCOUNT_LOCKED', 'Account is locked');
    if (!(await this.checkSecondFactor(user, code))) {
      try {
        this.codeFailures.consume(key);
      } catch {
        // too many wrong codes: burn the challenge
        await this.db.update(verificationTokens).set({ usedAt: this.now() }).where(eq(verificationTokens.id, ch.id));
      }
      await this.security.record(user, client, 'BAD_2FA');
      throw new AppError('INVALID_TWO_FACTOR_CODE', 'Invalid code');
    }
    const [used] = await this.db
      .update(verificationTokens)
      .set({ usedAt: this.now() })
      .where(and(eq(verificationTokens.id, ch.id), isNull(verificationTokens.usedAt)))
      .returning();
    if (!used) throw new AppError('UNAUTHENTICATED', 'Login expired, sign in again');
    this.codeFailures.reset(key);
    const { token } = await this.createSession(user.id, client, true);
    await this.security.record(user, client, 'OK');
    return { user, token };
  }

  // ───────── two-factor authentication (TOTP)

  /**
   * Verifies a 6-digit TOTP (each time step usable once) or an unused recovery code (consumed).
   * Conditional updates make concurrent use of the same code succeed at most once.
   */
  private async checkSecondFactor(user: UserRow, code: string, secretOverride?: string): Promise<boolean> {
    const c = code.trim();
    const sealed = secretOverride ?? user.twoFactorSecret;
    if (/^\d{6}$/.test(c)) {
      if (!sealed) return false;
      const step = verifyTotp(this.box.open(sealed), c, this.now().getTime(), user.twoFactorLastStep);
      if (step === null) return false;
      const [r] = await this.db
        .update(users)
        .set({ twoFactorLastStep: step })
        .where(and(eq(users.id, user.id), or(isNull(users.twoFactorLastStep), lt(users.twoFactorLastStep, step))))
        .returning({ id: users.id });
      return !!r;
    }
    if (secretOverride) return false; // enabling requires a real TOTP code
    const [r] = await this.db
      .update(recoveryCodes)
      .set({ usedAt: this.now() })
      .where(and(eq(recoveryCodes.userId, user.id), eq(recoveryCodes.codeHash, hashRecoveryCode(c)), isNull(recoveryCodes.usedAt)))
      .returning({ id: recoveryCodes.id });
    return !!r;
  }

  private async requirePassword(user: UserRow, password: string): Promise<void> {
    if (!user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      throw new AppError('VALIDATION_ERROR', 'Current password is incorrect', { field: 'currentPassword' });
    }
  }

  private async requireCode(user: UserRow, code: string, secretOverride?: string): Promise<void> {
    const key = `user:${user.id}`;
    this.codeFailures.check(key);
    if (!(await this.checkSecondFactor(user, code, secretOverride))) {
      try {
        this.codeFailures.consume(key);
      } catch {
        // next attempt is blocked by check()
      }
      throw new AppError('INVALID_TWO_FACTOR_CODE', 'Invalid code');
    }
    this.codeFailures.reset(key);
  }

  private async replaceRecoveryCodes(userId: string): Promise<string[]> {
    const codes = newRecoveryCodes();
    await this.db.transaction(async (tx) => {
      await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
      await tx.insert(recoveryCodes).values(codes.map((c) => ({ userId, codeHash: hashRecoveryCode(c) })));
    });
    return codes;
  }

  async setupTwoFactor(ctx: AuthContext, currentPassword: string): Promise<{ secret: string; otpauthUrl: string }> {
    await this.requirePassword(ctx.user, currentPassword);
    if (ctx.user.twoFactorEnabledAt) throw new AppError('CONFLICT', 'Two-factor authentication is already on');
    const secret = newTotpSecret();
    await this.db
      .update(users)
      .set({ twoFactorPendingSecret: this.box.seal(secret), updatedAt: this.now() })
      .where(eq(users.id, ctx.user.id));
    return { secret, otpauthUrl: otpauthUrl(this.config.TOTP_ISSUER, ctx.user.email, secret) };
  }

  /** Confirms the pending secret with a code; this session counts as 2FA-verified. */
  async enableTwoFactor(ctx: AuthContext, code: string, ip?: string): Promise<string[]> {
    const [user] = await this.db.select().from(users).where(eq(users.id, ctx.user.id));
    if (!user) throw new AppError('UNAUTHENTICATED', 'Sign in required');
    if (user.twoFactorEnabledAt) throw new AppError('CONFLICT', 'Two-factor authentication is already on');
    if (!user.twoFactorPendingSecret) throw new AppError('VALIDATION_ERROR', 'Start the setup first');
    await this.requireCode(user, code, user.twoFactorPendingSecret);
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ twoFactorSecret: user.twoFactorPendingSecret, twoFactorPendingSecret: null, twoFactorEnabledAt: this.now(), updatedAt: this.now() })
        .where(eq(users.id, user.id));
      await tx.update(sessions).set({ mfaVerified: true }).where(eq(sessions.id, ctx.session.id));
      await writeAudit(tx, { actorId: user.id, action: 'TWO_FACTOR_ENABLE', targetType: 'USER', targetId: user.id, ip });
    });
    return this.replaceRecoveryCodes(user.id);
  }

  /** Staff accounts must keep 2FA. */
  async disableTwoFactor(ctx: AuthContext, currentPassword: string, code: string, ip?: string): Promise<void> {
    if (STAFF_ROLES.includes(ctx.user.role)) throw new AppError('FORBIDDEN', 'Staff accounts must keep two-factor authentication');
    if (!ctx.user.twoFactorEnabledAt) throw new AppError('CONFLICT', 'Two-factor authentication is off');
    await this.requirePassword(ctx.user, currentPassword);
    await this.requireCode(ctx.user, code);
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ twoFactorSecret: null, twoFactorPendingSecret: null, twoFactorEnabledAt: null, twoFactorLastStep: null, updatedAt: this.now() })
        .where(eq(users.id, ctx.user.id));
      await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, ctx.user.id));
      await tx.update(sessions).set({ mfaVerified: false }).where(eq(sessions.userId, ctx.user.id));
      await writeAudit(tx, { actorId: ctx.user.id, action: 'TWO_FACTOR_DISABLE', targetType: 'USER', targetId: ctx.user.id, ip });
    });
  }

  async regenerateRecoveryCodes(ctx: AuthContext, code: string): Promise<string[]> {
    if (!ctx.user.twoFactorEnabledAt) throw new AppError('CONFLICT', 'Two-factor authentication is off');
    await this.requireCode(ctx.user, code);
    return this.replaceRecoveryCodes(ctx.user.id);
  }

  /** The service clock (tests move it); AdminService uses it for session expiry so both agree. */
  currentTime(): Date {
    return this.now();
  }

  async logout(sessionId: string): Promise<void> {
    await this.db.update(sessions).set({ revokedAt: this.now() }).where(eq(sessions.id, sessionId));
  }

  // ───────── email verification / password reset

  private async issueToken(userId: string, purpose: 'EMAIL_VERIFY' | 'PASSWORD_RESET' | 'LOGIN_2FA', ttlMs: number): Promise<string> {
    const token = newToken();
    await this.db.insert(verificationTokens).values({ userId, purpose, tokenHash: sha256(token), expiresAt: new Date(this.now().getTime() + ttlMs) });
    return token;
  }

  private async consumeToken(token: string, purpose: 'EMAIL_VERIFY' | 'PASSWORD_RESET'): Promise<string> {
    const [row] = await this.db
      .update(verificationTokens)
      .set({ usedAt: this.now() })
      .where(
        and(
          eq(verificationTokens.tokenHash, sha256(token)),
          eq(verificationTokens.purpose, purpose),
          isNull(verificationTokens.usedAt),
          gt(verificationTokens.expiresAt, this.now()),
        ),
      )
      .returning();
    if (!row) throw new AppError('VALIDATION_ERROR', 'Invalid or expired link', { field: 'token' });
    return row.userId;
  }

  async sendVerification(user: UserRow): Promise<void> {
    if (user.emailVerifiedAt) return;
    const token = await this.issueToken(user.id, 'EMAIL_VERIFY', EMAIL_VERIFY_TTL_MS);
    await this.email.send({
      to: user.email,
      subject: 'Xác minh email — Sàn mô phỏng',
      text: withAntiPhishing(user, `Xin chào ${user.name},\n\nBấm vào liên kết để xác minh email (hết hạn sau 24 giờ):\n${this.config.APP_URL}/verify-email?token=${token}\n`),
    });
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await this.consumeToken(token, 'EMAIL_VERIFY');
    await this.db.update(users).set({ emailVerifiedAt: this.now(), updatedAt: this.now() }).where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)));
  }

  /** Always succeeds (no account enumeration). */
  async forgotPassword(emailInput: string): Promise<void> {
    const email = emailInput.trim().toLowerCase();
    const [user] = await this.db.select().from(users).where(eq(users.email, email));
    if (!user || !user.passwordHash || user.isBot) return;
    const token = await this.issueToken(user.id, 'PASSWORD_RESET', PASSWORD_RESET_TTL_MS);
    await this.email.send({
      to: user.email,
      subject: 'Đặt lại mật khẩu — Sàn mô phỏng',
      text: withAntiPhishing(user, `Bấm vào liên kết để đặt lại mật khẩu (hết hạn sau 1 giờ):\n${this.config.APP_URL}/reset-password?token=${token}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.`),
    });
  }

  /** Sets a new password and signs out every session. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const userId = await this.consumeToken(token, 'PASSWORD_RESET');
    await this.db.update(users).set({ passwordHash: await hashPassword(newPassword), passwordChangedAt: this.now(), updatedAt: this.now() }).where(eq(users.id, userId));
    await this.db.update(sessions).set({ revokedAt: this.now() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }

  /** Changes the password and signs out every OTHER session. */
  async changePassword(ctx: AuthContext, currentPassword: string, newPassword: string): Promise<void> {
    if (!ctx.user.passwordHash || !(await verifyPassword(currentPassword, ctx.user.passwordHash))) {
      throw new AppError('VALIDATION_ERROR', 'Current password is incorrect', { field: 'currentPassword' });
    }
    await this.db.update(users).set({ passwordHash: await hashPassword(newPassword), passwordChangedAt: this.now(), updatedAt: this.now() }).where(eq(users.id, ctx.user.id));
    await this.db
      .update(sessions)
      .set({ revokedAt: this.now() })
      .where(and(eq(sessions.userId, ctx.user.id), ne(sessions.id, ctx.session.id), isNull(sessions.revokedAt)));
  }

  // ───────── profile + anti-phishing code

  async updateProfile(ctx: AuthContext, p: { name?: string; avatar?: AvatarId | null }): Promise<UserRow> {
    const [u] = await this.db
      .update(users)
      .set({ ...(p.name !== undefined ? { name: p.name.trim() } : {}), ...(p.avatar !== undefined ? { avatar: p.avatar } : {}), updatedAt: this.now() })
      .where(eq(users.id, ctx.user.id))
      .returning();
    return u!;
  }

  /** Needs the password, plus a 2FA code (TOTP or recovery) when 2FA is on. null removes the code. */
  async setAntiPhishing(ctx: AuthContext, code: string | null, currentPassword: string, twoFactorCode?: string): Promise<UserRow> {
    if (!ctx.user.passwordHash || !(await verifyPassword(currentPassword, ctx.user.passwordHash))) {
      throw new AppError('VALIDATION_ERROR', 'Current password is incorrect', { field: 'currentPassword' });
    }
    if (ctx.user.twoFactorEnabledAt) {
      const key = `user:${ctx.user.id}`;
      this.codeFailures.check(key);
      if (!twoFactorCode || !(await this.checkSecondFactor(ctx.user, twoFactorCode))) {
        try {
          this.codeFailures.consume(key);
        } catch {
          // blocked on the next try
        }
        throw new AppError('INVALID_TWO_FACTOR_CODE', 'Invalid code');
      }
      this.codeFailures.reset(key);
    }
    const [u] = await this.db.update(users).set({ antiPhishingCode: code, updatedAt: this.now() }).where(eq(users.id, ctx.user.id)).returning();
    return u!;
  }

  async listSessions(ctx: AuthContext): Promise<SessionInfo[]> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, ctx.user.id), isNull(sessions.revokedAt), gt(sessions.expiresAt, this.now())))
      .orderBy(desc(sessions.lastSeenAt));
    return rows.map((s) => ({
      id: s.id,
      current: s.id === ctx.session.id,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
    }));
  }

  async revokeSession(ctx: AuthContext, sessionId: string): Promise<void> {
    if (!/^[0-9a-f-]{36}$/.test(sessionId)) throw new AppError('NOT_FOUND', 'Session not found');
    const [row] = await this.db
      .update(sessions)
      .set({ revokedAt: this.now() })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, ctx.user.id), isNull(sessions.revokedAt)))
      .returning();
    if (!row) throw new AppError('NOT_FOUND', 'Session not found');
  }
}
