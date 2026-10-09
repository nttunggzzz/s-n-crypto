import { z } from 'zod';
import { IsoDateTime } from './common.ts';
import { Me } from './account.ts';

/**
 * Sessions use an httpOnly cookie (`cex_session`) set by the server — the UI never sees or stores the token.
 * The mobile app (phase 7) will use `Authorization: Bearer <token>` instead.
 */

const Email = z.email().max(254);
const Password = z.string().min(8, 'at least 8 characters').max(128);

export const RegisterRequest = z.object({
  email: Email,
  password: Password,
  name: z.string().trim().min(1).max(60),
  /** Cloudflare Turnstile token; required when captcha is enabled on the server. */
  captchaToken: z.string().optional(),
});

export const LoginRequest = z.object({
  email: Email,
  password: z.string().min(1).max(128),
});

export const AuthUserResponse = z.object({ user: Me });

export const VerifyEmailRequest = z.object({ token: z.string().min(10) });
export const ForgotPasswordRequest = z.object({ email: Email });
export const ResetPasswordRequest = z.object({ token: z.string().min(10), newPassword: Password });
export const ChangePasswordRequest = z.object({ currentPassword: z.string().min(1), newPassword: Password });

export const SessionInfo = z.object({
  id: z.string(),
  current: z.boolean(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
  createdAt: IsoDateTime,
  lastSeenAt: IsoDateTime,
  expiresAt: IsoDateTime,
});
export type SessionInfo = z.infer<typeof SessionInfo>;

export const SessionList = z.object({ items: z.array(SessionInfo) });
export const OkResponse = z.object({ ok: z.literal(true) });
