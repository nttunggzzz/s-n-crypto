import { z } from 'zod';
import { IsoDateTime, Role } from './common.ts';

/** The signed-in user. Auth itself (sign-up, sign-in, sessions…) lives under /api/v1/auth — see auth.ts. */
export const Me = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  emailVerified: z.boolean(),
  role: Role,
  /** Admin-controlled flag for the signals feature (phase 6). */
  signalsAccess: z.boolean(),
  createdAt: IsoDateTime,
});
export type Me = z.infer<typeof Me>;
