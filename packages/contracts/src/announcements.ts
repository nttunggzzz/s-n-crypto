import { z } from 'zod';
import { IsoDateTime } from './common.ts';

/** INFO: news · IMPORTANT: highlighted · MAINTENANCE: planned downtime / trading pauses. */
export const AnnouncementLevel = z.enum(['INFO', 'IMPORTANT', 'MAINTENANCE']);
export type AnnouncementLevel = z.infer<typeof AnnouncementLevel>;

/** Exchange news written by staff. `body` is plain text (render as text, keep line breaks). */
export const Announcement = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  level: AnnouncementLevel,
  pinned: z.boolean(),
  publishedAt: IsoDateTime,
  /** After this time it is no longer listed. */
  expiresAt: IsoDateTime.nullable(),
});
export type Announcement = z.infer<typeof Announcement>;

/** Public list: published, not hidden, not expired — pinned first, then newest. */
export const AnnouncementListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const Title = z.string().trim().min(1).max(120);
const Body = z.string().trim().min(1).max(5000);

export const AdminAnnouncement = Announcement.extend({
  /** null = draft (not visible to users). */
  publishedAt: IsoDateTime.nullable(),
  hidden: z.boolean(),
  createdBy: z.object({ id: z.string(), email: z.string() }).nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type AdminAnnouncement = z.infer<typeof AdminAnnouncement>;

export const CreateAnnouncementRequest = z.object({
  title: Title,
  body: Body,
  level: AnnouncementLevel.default('INFO'),
  pinned: z.boolean().default(false),
  /** false = save as draft. */
  publish: z.boolean().default(true),
  expiresAt: IsoDateTime.nullable().default(null),
});

/** PATCH: only the fields sent change. `published: true` publishes a draft (now); false unpublishes. */
export const UpdateAnnouncementRequest = z.object({
  title: Title.optional(),
  body: Body.optional(),
  level: AnnouncementLevel.optional(),
  pinned: z.boolean().optional(),
  published: z.boolean().optional(),
  /** Hide = soft delete (kept for the audit log). */
  hidden: z.boolean().optional(),
  expiresAt: IsoDateTime.nullable().optional(),
});

export const AnnouncementIdParam = z.object({ announcementId: z.string().regex(/^\d+$/) });

export const AdminAnnouncementListQuery = z.object({
  /** Include hidden ones (default false). */
  includeHidden: z.enum(['true', 'false']).default('false'),
});
