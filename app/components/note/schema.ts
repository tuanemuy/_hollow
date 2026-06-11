import { z } from "zod";
import { PAGINATION_MAX_LIMIT } from "@/core/presentation/pagination";
import {
  BULK_NOTE_IDS_MAX,
  DISPLAY_MODES,
  EXPORT_BULK_LIMIT,
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
  // Trim at the transport boundary so a whitespace-only `?q=` can never make
  // the heading ("検索結果") and the listing disagree.
  q: z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const trimmed = v.trim();
    return trimmed === "" ? undefined : trimmed;
  }, z.string().optional().catch(undefined)),
  viewId: z.string().min(1).optional().catch(undefined),
  visibility: visibilitySchema.optional().catch(undefined),
  referencingNoteId: z.string().min(1).optional().catch(undefined),
  tagNames: z.array(z.string().min(1)).optional().catch(undefined),
  from: z.string().date().optional().catch(undefined),
  to: z.string().date().optional().catch(undefined),
  // Issue #215: `.default(...)` removed so the schema's output keeps
  // `page` / `limit` optional. TanStack Router uses the output shape
  // when computing `MakeRequiredSearchParams`; if `page` / `limit` were
  // required on the output side, `<Link to="/" search={HOME_SEARCH}>`
  // (where `HOME_SEARCH = {}`) would not type-check. Consumers fall
  // back to `NOTE_LIST_PAGE_DEFAULT` / `NOTE_LIST_LIMIT_DEFAULT` at
  // the loader boundary.
  page: z.coerce.number().int().min(1).optional().catch(undefined),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(NOTE_LIST_LIMIT_MAX)
    .optional()
    .catch(undefined),
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
export const NOTE_HISTORY_DEFAULT_PAGE = 1;
export const NOTE_HISTORY_DEFAULT_LIMIT = 20;

export const noteHistorySearchSchema = z.object({
  // Issue #215: same rationale as `noteListSearchSchema` above —
  // `.default(...)` is removed so the URL stays clean for default
  // pagination. The loader supplies `NOTE_HISTORY_DEFAULT_*` before
  // calling the server fn. `max` derives from `PAGINATION_MAX_LIMIT`
  // so the cap cannot drift from the shared transport-boundary
  // contract.
  page: z.coerce.number().int().min(1).optional().catch(undefined),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION_MAX_LIMIT)
    .optional()
    .catch(undefined),
});

export type NoteHistorySearch = z.infer<typeof noteHistorySearchSchema>;

// Issue #215 guards: pin that both search schemas keep `page` /
// `limit` truly optional on their output. If a future change re-adds
// `.default(...)` (which would resurrect the `?page=1&limit=20` URL),
// the empty-object extends check would fail and break typecheck.
type _NoteListSearchSchemaIsPartial =
  Record<string, never> extends Pick<NoteListSearch, "page" | "limit">
    ? true
    : never;
type _NoteHistorySearchSchemaIsPartial =
  Record<string, never> extends NoteHistorySearch ? true : never;
const _noteListSearchSchemaIsPartial: _NoteListSearchSchemaIsPartial = true;
const _noteHistorySearchSchemaIsPartial: _NoteHistorySearchSchemaIsPartial = true;
void _noteListSearchSchemaIsPartial;
void _noteHistorySearchSchemaIsPartial;

// `query.max(NOTE_TITLE_MAX_LENGTH)` is sized so a user can prefix-match
// a full note title without the transport layer rejecting the request.
// `limit` is clamped server-side as well, but the schema cap is a cheap
// DoS guard before the usecase runs.
export const searchInternalLinkTargetsSchema = z.object({
  query: z.string().trim().min(1).max(NOTE_TITLE_MAX_LENGTH),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});
