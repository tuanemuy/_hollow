import { z } from "zod";

export const TAG_NAME_MAX_LENGTH = 64;

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(TAG_NAME_MAX_LENGTH),
});

export const renameTagSchema = z.object({
  tagId: z.string().min(1),
  newName: z.string().trim().min(1).max(TAG_NAME_MAX_LENGTH),
});

export const mergeTagsSchema = z.object({
  sourceTagId: z.string().min(1),
  targetTagId: z.string().min(1),
});

export const deleteTagSchema = z.object({
  tagId: z.string().min(1),
});

/**
 * Tag-list search / sort transport schema, modelled on
 * `@/core/presentation/pagination` — a single field-level SSOT feeds both
 * the strict RPC schema (`inputValidator`) and the URL search schema
 * (`validateSearch`), so the constraints cannot drift between the route
 * and the server function.
 */
export const TAG_LIST_SORTS = [
  "name",
  "noteCount",
  "createdAt",
  "lastUsedAt",
] as const;
export const TAG_LIST_ORDERS = ["asc", "desc"] as const;

// `q` reuses the tag-name ceiling — the search box matches tag names, so the
// same 64-char bound applies. The `.trim().min(1)` rejects a blank `?q=`; the
// URL variant then `.catch(undefined)`s that rejection into omission.
const qField = z.string().trim().min(1).max(TAG_NAME_MAX_LENGTH);
const sortField = z.enum(TAG_LIST_SORTS);
const orderField = z.enum(TAG_LIST_ORDERS);

// Strict schema for the server-function `inputValidator`. RPC payloads
// arrive already typed; bad values must fail loud rather than fall back.
export const tagListParamsSchema = z.object({
  q: qField.optional(),
  sort: sortField.optional(),
  order: orderField.optional(),
});

export type TagListParams = z.infer<typeof tagListParamsSchema>;

// URL search variant for `validateSearch`. Each field is
// `.optional().catch(undefined)` so a hand-typed `?sort=bogus` (or blank
// `?q=`) never errors the route — it collapses to omission and the loader
// re-defaults at the boundary.
export const tagListSearchSchema = z.object({
  q: qField.optional().catch(undefined),
  sort: sortField.optional().catch(undefined),
  order: orderField.optional().catch(undefined),
});

export type TagListSearch = z.infer<typeof tagListSearchSchema>;

// Structural guards. The strict params output must be assignable to the
// loose URL search output (the strict one only narrows), and the URL
// search output must keep every field optional so an empty `{}` parses.
type _TagListParamsMatches = TagListParams extends TagListSearch ? true : never;
type _TagListSearchIsPartial =
  Record<string, never> extends TagListSearch ? true : never;
const _tagListParamsMatches: _TagListParamsMatches = true;
const _tagListSearchIsPartial: _TagListSearchIsPartial = true;
void _tagListParamsMatches;
void _tagListSearchIsPartial;
