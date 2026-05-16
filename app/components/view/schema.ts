import { z } from "zod";

export const SAVED_VIEW_NAME_MAX = 60;

export const deleteSavedViewSchema = z.object({
  viewId: z.string().min(1),
});

export const setDefaultSavedViewSchema = z.object({
  kind: z.enum(["personal", "public"]),
  viewId: z.string().min(1).nullable(),
});

export const renameSavedViewSchema = z.object({
  viewId: z.string().min(1),
  name: z.string().trim().min(1).max(SAVED_VIEW_NAME_MAX),
});
