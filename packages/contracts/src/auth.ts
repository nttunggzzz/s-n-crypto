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

/**
 * Login result: either signed in (`user`), or — when the account has 2FA — a short-lived
 * challenge to complete with `loginTwoFactor` (no session cookie is set yet).
 */
export const LoginResponse = z.union([
  z.object({ user: Me }),
  z.object({ twoFactorRequired: z.literal(true), challengeToken: z.string(), expiresAt: IsoDateTime }),
]);
export type LoginResponse = z.infer<typeof LoginResponse>;

/** 6-digit TOTP code from the authenticator app, or a one-time recovery code (xxxx-xxxx). */
const TwoFactorCode = z.string().trim().min(6).max(20);

export const LoginTwoFactorRequest = z.object({ challengeToken: z.string().min(10), code: TwoFactorCode });

/** Step 1: get a secret to scan (QR from otpauthUrl). Requires the current password. */
export const TwoFactorSetupRequest = z.object({ currentPassword: z.string().min(1) });
export const TwoFactorSetup = z.object({
  /** Base32 secret for manual entry. */
  secret: z.string(),
  /** otpauth://totp/... — render as a QR code. */
  otpauthUrl: z.string(),
});

/** Step 2: confirm with a code from the app → 2FA on; returns 10 one-time recovery codes (shown once). */
export const TwoFactorEnableRequest = z.object({ code: TwoFactorCode });
export const RecoveryCodes = z.object({ recoveryCodes: z.array(z.string()) });

/** Staff accounts cannot turn 2FA off (FORBIDDEN). */
export const TwoFactorDisableRequest = z.object({ currentPassword: z.string().min(1), code: TwoFactorCode });
export const RegenerateRecoveryCodesRequest = z.object({ code: TwoFactorCode });

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
