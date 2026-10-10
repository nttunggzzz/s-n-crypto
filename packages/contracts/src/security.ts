import { z } from 'zod';
import { IsoDateTime } from './common.ts';

/**
 * Profile + account security (phase 2.6, OKX-style).
 * Avatars are preset keys — the UI owns the artwork for each key.
 */
export const AvatarId = z.enum(['fox', 'owl', 'bull', 'bear', 'whale', 'shark', 'rocket', 'diamond', 'moon', 'star', 'bolt', 'leaf']);
export type AvatarId = z.infer<typeof AvatarId>;

export const UpdateProfileRequest = z
  .object({
    name: z.string().trim().min(2).max(40).optional(),
    avatar: AvatarId.nullable().optional(),
  })
  .refine((r) => r.name !== undefined || r.avatar !== undefined, { message: 'change at least one field' });

/** One sign-in attempt (kept 180 days). */
export const LoginEvent = z.object({
  id: z.string(),
  at: IsoDateTime,
  ip: z.string().nullable(),
  /** Short readable device, e.g. "Chrome · Windows"; null if unknown. */
  device: z.string().nullable(),
  success: z.boolean(),
  /** OK, BAD_PASSWORD, BAD_2FA, LOCKED */
  result: z.enum(['OK', 'BAD_PASSWORD', 'BAD_2FA', 'LOCKED']),
  /** First successful sign-in from this browser/device (an alert email was sent). */
  newDevice: z.boolean(),
});
export type LoginEvent = z.infer<typeof LoginEvent>;

export const SecurityOverview = z.object({
  twoFactorEnabled: z.boolean(),
  /** Masked anti-phishing code, e.g. "AB****"; null when not set. */
  antiPhishingCode: z.string().nullable(),
  emailVerified: z.boolean(),
  passwordChangedAt: IsoDateTime.nullable(),
  lastLogin: LoginEvent.nullable(),
  activeSessions: z.number().int(),
});
export type SecurityOverview = z.infer<typeof SecurityOverview>;

/**
 * Anti-phishing code: shown in every email we send, so the user can tell real emails from fakes.
 * 4–20 letters/digits; null removes it. Needs the password, plus a 2FA code when 2FA is on.
 */
export const SetAntiPhishingRequest = z.object({
  code: z.string().regex(/^[A-Za-z0-9]{4,20}$/, '4–20 letters or digits').nullable(),
  currentPassword: z.string().min(1),
  twoFactorCode: z.string().optional(),
});
