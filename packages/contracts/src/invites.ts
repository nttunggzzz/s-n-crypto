import { z } from 'zod';
import { IsoDateTime } from './common.ts';

/**
 * Closed staging (phase 0): with registration INVITE_ONLY, signing up needs an invite code that staff
 * create (or the owner from the server command line). Codes are shown ONCE, when created; the server keeps
 * only a hash. Every create / revoke is in the audit log.
 */

export const RegistrationMode = z.enum(['OPEN', 'INVITE_ONLY']);
export type RegistrationMode = z.infer<typeof RegistrationMode>;

/** Settings every web app needs before anyone signs in (no secrets). */
export const PublicConfig = z.object({
  registration: RegistrationMode,
  /** Cloudflare Turnstile site key for the sign-up form; null = no captcha on this server. */
  captchaSiteKey: z.string().nullable(),
  emailVerificationRequired: z.boolean(),
  /**
   * Admin area needs two-factor authentication (staff endpoints answer TWO_FACTOR_REQUIRED without it). false only on a
   * development server: the admin app must then NOT block staff on the "enable 2FA" screen (never guess from the hostname).
   */
  staffTwoFactorRequired: z.boolean(),
  /**
   * What the server does with the emails it "sends" (verification, password reset, new-device alerts):
   * "sent" = delivered to the user's inbox; "log" = only written to the server log / a test outbox (dev, e2e,
   * or a closed server before a mail domain exists). With "log", do not tell users "email sent" —
   * say the email is not delivered on this server.
   */
  emailDelivery: z.enum(['sent', 'log']),
  /** "sim" = synthetic prices (dev / test servers only) — show a clear banner. */
  marketFeed: z.enum(['binance', 'sim', 'off']),
});
export type PublicConfig = z.infer<typeof PublicConfig>;

/** As typed by the user: case, spaces and dashes do not matter ("abcd-efgh-jkmn" = "ABCDEFGHJKMN"). */
export const InviteCodeInput = z.string().trim().min(4).max(40);

/** Why an invite code was refused (`INVALID_INVITE`, details.reason). */
export const InviteRefusal = z.enum(['MISSING', 'UNKNOWN', 'EXPIRED', 'USED_UP', 'REVOKED']);
export type InviteRefusal = z.infer<typeof InviteRefusal>;

export const InviteStatus = z.enum(['ACTIVE', 'USED_UP', 'EXPIRED', 'REVOKED']);
export type InviteStatus = z.infer<typeof InviteStatus>;

export const Invite = z.object({
  id: z.string(),
  /** First 4 characters, to recognise a code (the full code is only shown when it is created). */
  codePrefix: z.string(),
  /** Who it is for, e.g. "Anh Minh — thử nghiệm Futures". */
  note: z.string(),
  maxUses: z.number().int(),
  uses: z.number().int(),
  status: InviteStatus,
  expiresAt: IsoDateTime,
  revokedAt: IsoDateTime.nullable(),
  /** null when created from the server command line. */
  createdBy: z.object({ id: z.string(), email: z.string() }).nullable(),
  createdAt: IsoDateTime,
});
export type Invite = z.infer<typeof Invite>;

export const CreateInviteRequest = z.object({
  note: z.string().trim().min(1).max(120),
  maxUses: z.number().int().min(1).max(100).default(1),
  expiresInDays: z.number().int().min(1).max(90).default(14),
});

export const CreatedInvite = z.object({
  invite: Invite,
  /** The code, formatted "ABCD-EFGH-JKMN" — shown once, never again. */
  code: z.string(),
  /** Ready to send: <APP_URL>/register?invite=<code> (the form fills the code in). */
  link: z.string(),
});
export type CreatedInvite = z.infer<typeof CreatedInvite>;

export const InviteIdParam = z.object({ inviteId: z.string().regex(/^\d+$/) });
export const AdminInviteListQuery = z.object({ status: InviteStatus.optional() });
