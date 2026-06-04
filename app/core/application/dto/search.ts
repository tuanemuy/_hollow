import type { SearchHit } from "@/core/domain/search/valueObject";
import type { DateRange } from "./common";

export type SearchHitDTO = Readonly<{
  noteId: string;
  ownerId: string;
  username: string;
  title: string;
  snippet: string;
  tagNames: readonly string[];
  score: number;
  visibility: "private" | "unlisted" | "public";
}>;

/**
 * Owner-scope search hit projection. Extends `SearchHitDTO` with the
 * per-note fields that the search index does not carry
 * (`directoryId` / `slug` / `updatedAt`) so the home / note-list page
 * can render visibility badges and `updatedAt` without falling back to
 * sentinel values. Source of values:
 * - `directoryId` / `slug` / `updatedAt`: latest DB row resolved via
 *   `NoteRepository.findByIds`.
 * - `noteId` / `ownerId` / `username` / `title` / `snippet` /
 *   `tagNames` / `score` / `visibility`: search index (eventually
 *   consistent).
 *
 * `directoryId` / `slug` are plain `string`, like every id and slug on
 * the DTO layer — the DTO layer carries no id brands (see `./index.ts`).
 * `updatedAt` is an ISO 8601 string.
 */
export type OwnedSearchHitDTO = SearchHitDTO &
  Readonly<{
    directoryId: string;
    slug: string;
    updatedAt: string;
  }>;

/**
 * Transport-shape query parameters accepted by the search usecase. The
 * domain `SearchQuery` value object is constructed from this DTO at the
 * usecase boundary so brands / length caps are enforced there.
 */
export type SearchQueryDTO = Readonly<{
  keyword: string;
  ownerIdFilter: string | null;
  visibilityFilter: readonly ("private" | "unlisted" | "public")[];
  tagNames: readonly string[];
  dateRange: DateRange | null;
  limit: number;
  cursor: string | null;
}>;

export function toSearchHitDTO(hit: SearchHit): SearchHitDTO {
  return {
    noteId: hit.noteId,
    ownerId: hit.ownerId,
    username: hit.username as string,
    title: hit.title as string,
    snippet: hit.snippet as string,
    tagNames: hit.tagNames.map((name) => name as string),
    score: hit.score as number,
    visibility: hit.visibility,
  };
}
