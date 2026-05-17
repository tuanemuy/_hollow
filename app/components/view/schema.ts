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

/**
 * Schema for "save current filter + display as view" form.
 *
 * Tags are passed by **name** to match the URL representation used in
 * `noteListSearchSchema`. The server-fn handler resolves names → ids via
 * `listTags` before delegating to the `createSavedView` usecase.
 */
export const createSavedViewSchema = z.object({
  name: z.string().trim().min(1).max(SAVED_VIEW_NAME_MAX),
  kind: z.enum(["personal", "public"]).default("personal"),
  query: z.object({
    tagNames: z.array(z.string().min(1)).default([]),
    directoryId: z.string().min(1).nullable().default(null),
    dateRange: z
      .object({
        from: z.string().date().nullable().default(null),
        to: z.string().date().nullable().default(null),
      })
      .nullable()
      .default(null),
    keyword: z.string().nullable().default(null),
    referencingNoteId: z.string().min(1).nullable().default(null),
  }),
  displayMode: z.enum(["list", "tile", "calendar"]).default("list"),
  calendarDateKey: z
    .enum(["updated", "created", "frontMatterDate"])
    .default("updated"),
  sort: z
    .object({
      by: z.enum(["updatedAt", "createdAt", "title"]).default("updatedAt"),
      direction: z.enum(["asc", "desc"]).default("desc"),
    })
    .default({ by: "updatedAt", direction: "desc" }),
  isDefault: z.boolean().default(false),
});
