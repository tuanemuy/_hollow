import { z } from "zod";
import {
  BULK_NOTE_IDS_MAX,
  DISPLAY_MODES,
  EXPORT_BULK_LIMIT,
  NOTE_LIST_LIMIT_DEFAULT,
  NOTE_LIST_LIMIT_MAX,
} from "./constants";

export const NOTE_TITLE_MAX_LENGTH = 200;
export const NOTE_BODY_MAX_BYTES = 1024 * 1024;
export const FRONT_MATTER_JSON_MAX_BYTES = 64 * 1024;

export const visibilitySchema = z.enum(["private", "unlisted", "public"]);

export const createNoteSchema = z.object({
  title: z.string().trim().max(NOTE_TITLE_MAX_LENGTH).default(""),
  contentHtml: z.string().max(NOTE_BODY_MAX_BYTES).default(""),
  directoryId: z.string().min(1).nullable().default(null),
  tagNames: z.array(z.string().trim().min(1)).default([]),
  frontMatterJson: z.string().max(FRONT_MATTER_JSON_MAX_BYTES).optional(),
});

export const saveNoteSchema = z.object({
  noteId: z.string().min(1),
  title: z.string().trim().max(NOTE_TITLE_MAX_LENGTH).optional(),
  contentHtml: z.string().max(NOTE_BODY_MAX_BYTES).optional(),
  tagNames: z.array(z.string().trim().min(1)).optional(),
  frontMatterJson: z.string().max(FRONT_MATTER_JSON_MAX_BYTES).optional(),
});

export const renameNoteSchema = z.object({
  noteId: z.string().min(1),
  newTitle: z.string().trim().min(1).max(NOTE_TITLE_MAX_LENGTH),
  regenerateSlug: z.boolean().default(false),
});

export const moveNoteSchema = z.object({
  noteId: z.string().min(1),
  newDirectoryId: z.string().min(1),
});

export const deleteNoteSchema = z.object({
  noteId: z.string().min(1),
});

export const restoreNoteSchema = z.object({
  noteId: z.string().min(1),
  restoreDirectoryId: z.string().min(1).nullable().default(null),
});

export const purgeNoteSchema = z.object({
  noteId: z.string().min(1),
});

export const duplicateNoteSchema = z.object({
  noteId: z.string().min(1),
});

/**
 * URL `?` search shape for the home / note-list route.
 *
 * Every field is `optional().catch(undefined)` (or `default()`) so that
 * partial Link targets such as `<Link search={{ directoryId }}>` from
 * the Sidebar do not blow up `validateSearch` by omitting other keys.
 */
export const noteListSearchSchema = z.object({
  display: z.enum(DISPLAY_MODES).optional().catch(undefined),
  directoryId: z.string().min(1).optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  viewId: z.string().min(1).optional().catch(undefined),
  visibility: visibilitySchema.optional().catch(undefined),
  referencingNoteId: z.string().min(1).optional().catch(undefined),
  tagNames: z.array(z.string().min(1)).optional().catch(undefined),
  from: z.string().date().optional().catch(undefined),
  to: z.string().date().optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(NOTE_LIST_LIMIT_MAX)
    .optional()
    .catch(undefined)
    .default(NOTE_LIST_LIMIT_DEFAULT),
});

export type NoteListSearch = z.infer<typeof noteListSearchSchema>;

export const bulkMoveSchema = z.object({
  noteIds: z.array(z.string().min(1)).min(1).max(BULK_NOTE_IDS_MAX),
  newDirectoryId: z.string().min(1),
});

export const bulkTrashSchema = z.object({
  noteIds: z.array(z.string().min(1)).min(1).max(BULK_NOTE_IDS_MAX),
});

export const bulkExportSchema = z
  .object({
    noteIds: z.array(z.string().min(1)).min(1).max(EXPORT_BULK_LIMIT),
    format: z.enum(["html", "markdown", "pdf"]),
    options: z.object({
      includeFrontMatter: z.boolean().default(true),
      embedMedia: z.boolean().default(false),
      pdfPaperSize: z.enum(["A4", "Letter"]).nullable().default(null),
    }),
  })
  .refine((v) => v.format !== "pdf" || v.options.pdfPaperSize !== null, {
    message: "pdfPaperSize is required for pdf format",
    path: ["options", "pdfPaperSize"],
  });

export const saveDraftSchema = z.object({
  noteId: z.string().min(1),
  title: z.string().trim().max(NOTE_TITLE_MAX_LENGTH).optional(),
  contentHtml: z.string().max(NOTE_BODY_MAX_BYTES).optional(),
  frontMatterJson: z.string().max(FRONT_MATTER_JSON_MAX_BYTES).optional(),
  tagNames: z.array(z.string().trim().min(1)).optional(),
});

export const acquireLockSchema = z.object({
  noteId: z.string().min(1),
});

export const extendLockSchema = z.object({
  noteId: z.string().min(1),
});

export const releaseLockSchema = z.object({
  noteId: z.string().min(1),
});

/**
 * Issue #158: input contract for the `restoreNoteRevision` server fn.
 * Both ids travel as opaque strings — the usecase layer brands them to
 * `NoteId` / `NoteRevisionId` after the schema accepts them.
 */
export const restoreNoteRevisionSchema = z.object({
  noteId: z.string().min(1),
  revisionId: z.string().min(1),
});

/**
 * Issue #158: URL search shape for `/notes/$noteId/history`. `page` is
 * 1-based to mirror the home / note-list route; `limit` is clamped on
 * the server side too. Both fields fall back to safe defaults when
 * absent or malformed.
 */
export const noteHistorySearchSchema = z.object({
  page: z.coerce.number().int().min(1).optional().catch(undefined).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .catch(undefined)
    .default(20),
});

export type NoteHistorySearch = z.infer<typeof noteHistorySearchSchema>;

// `query.max(NOTE_TITLE_MAX_LENGTH)` is sized so a user can prefix-match
// a full note title without the transport layer rejecting the request.
// `limit` is clamped server-side as well, but the schema cap is a cheap
// DoS guard before the usecase runs.
export const searchInternalLinkTargetsSchema = z.object({
  query: z.string().trim().min(1).max(NOTE_TITLE_MAX_LENGTH),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});
