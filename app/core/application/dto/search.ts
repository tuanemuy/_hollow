import type { SearchHit } from "@/core/domain/search/valueObject";
import type { DateRange } from "./common";
import type { UserId } from "./identity";
import type { NoteId } from "./note";

export type SearchHitDTO = Readonly<{
  noteId: NoteId;
  ownerId: UserId;
  username: string;
  title: string;
  snippet: string;
  tagNames: readonly string[];
  score: number;
  visibility: "private" | "unlisted" | "public";
}>;

/**
 * Transport-shape query parameters accepted by the search usecase. The
 * domain `SearchQuery` value object is constructed from this DTO at the
 * usecase boundary so brands / length caps are enforced there.
 */
export type SearchQueryDTO = Readonly<{
  keyword: string;
  ownerIdFilter: UserId | null;
  visibilityFilter: readonly ("private" | "unlisted" | "public")[];
  tagNames: readonly string[];
  dateRange: DateRange | null;
  limit: number;
  cursor: string | null;
}>;

export function toSearchHitDTO(hit: SearchHit): SearchHitDTO {
  return {
    noteId: hit.noteId as unknown as NoteId,
    ownerId: hit.ownerId as unknown as UserId,
    username: hit.username as string,
    title: hit.title as string,
    snippet: hit.snippet as string,
    tagNames: hit.tagNames.map((name) => name as string),
    score: hit.score as number,
    visibility: hit.visibility,
  };
}
