import { z } from 'zod';
import { CandleInterval, IsoDateTime, Role, SymbolCode } from './common.ts';
import { Permission } from './permissions.ts';
import { AvatarId } from './security.ts';

/** The signed-in user. Auth itself (sign-up, sign-in, sessions…) lives under /api/v1/auth — see auth.ts. */
export const Me = z.object({
  id: z.string(),
  /** Short public account number shown in the UI (like an exchange UID), e.g. "10000042". */
  uid: z.string(),
  email: z.string(),
  name: z.string(),
  /** Preset avatar key; null = initials. */
  avatar: AvatarId.nullable(),
  emailVerified: z.boolean(),
  role: Role,
  /** Admin-controlled flag for the signals feature (phase 6). */
  signalsAccess: z.boolean(),
  /** Optional for users, required for staff (support/admin/owner) to use the admin API. */
  twoFactorEnabled: z.boolean(),
  /** What this account may do in the admin area (empty for regular users). UI hint only — the server decides. */
  permissions: z.array(Permission),
  createdAt: IsoDateTime,
});
export type Me = z.infer<typeof Me>;

/** Per-user UI preferences stored on the server (same on web and app). */
export const Preferences = z.object({
  /** Favorite pairs, in display order. */
  favorites: z.array(SymbolCode).max(30),
  /** Show a confirmation dialog before placing orders. */
  confirmOrders: z.boolean(),
  /** GREEN: green = up/buy (default) · RED: red = up (East-Asian convention). */
  upColor: z.enum(['GREEN', 'RED']),
  theme: z.enum(['system', 'light', 'dark']),
  locale: z.enum(['vi', 'en']),
  defaultInterval: CandleInterval,
});
export type Preferences = z.infer<typeof Preferences>;

/** PATCH: only the fields sent are changed. */
export const UpdatePreferencesRequest = Preferences.partial();

export const DEFAULT_PREFERENCES: Preferences = {
  favorites: [],
  confirmOrders: true,
  upColor: 'GREEN',
  theme: 'system',
  locale: 'vi',
  defaultInterval: '15m',
};
