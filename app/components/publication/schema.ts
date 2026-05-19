import { z } from "zod";
import { BULK_NOTE_IDS_MAX } from "@/components/note/constants";

export const SHARE_LINK_PASSWORD_MAX = 128;

export const visibilitySchema = z.enum(["private", "unlisted", "public"]);

export const changeVisibilitySchema = z.object({
  noteId: z.string().min(1),
  nextVisibility: visibilitySchema,
});

export const issueShareLinkSchema = z.object({
  noteId: z.string().min(1),
  password: z
    .string()
    .max(SHARE_LINK_PASSWORD_MAX)
    .nullable()
    .transform((value) =>
      value === null || value.length === 0 ? null : value,
    ),
});

export const revokeShareLinkSchema = z.object({
  shareLinkId: z.string().min(1),
});

export const setShareLinkPasswordSchema = z.object({
  shareLinkId: z.string().min(1),
  newPassword: z
    .string()
    .max(SHARE_LINK_PASSWORD_MAX)
    .nullable()
    .transform((value) =>
      value === null || value.length === 0 ? null : value,
    ),
});

export const bulkVisibilitySchema = z.object({
  noteIds: z.array(z.string().min(1)).min(1).max(BULK_NOTE_IDS_MAX),
  nextVisibility: visibilitySchema,
});
