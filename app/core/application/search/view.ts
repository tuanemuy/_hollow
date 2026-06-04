import type { Note } from "@/core/domain/note/entity";
import type { SearchHit } from "@/core/domain/search/valueObject";
import {
  type OwnedSearchHitDTO,
  type SearchHitDTO,
  toSearchHitDTO,
} from "../dto/search";

export type { OwnedSearchHitDTO, SearchHitDTO } from "../dto/search";

/**
 * Projection helper for a single `SearchHit`. Delegates to the
 * common DTO module so callers can import the helper from the search
 * usecase package alongside its sibling usecases.
 */
export function toSearchHitView(hit: SearchHit): SearchHitDTO {
  return toSearchHitDTO(hit);
}

/**
 * Owner-scope variant: combine a `SearchHit` (eventually-consistent
 * index projection) with the matching `Note` aggregate (latest DB row)
 * to produce an `OwnedSearchHitDTO`. The caller is responsible for
 * resolving the `Note` for `hit.noteId` — typically via a single
 * `NoteRepository.findByIds` re-indexed into a `Map`. `Note.updatedAt`
 * is a `Date`; it is serialised here as ISO 8601 for transport.
 */
export function toOwnedSearchHitView(
  hit: SearchHit,
  note: Note,
): OwnedSearchHitDTO {
  return {
    ...toSearchHitDTO(hit),
    directoryId: note.directoryId,
    slug: note.slug,
    updatedAt: note.updatedAt.toISOString(),
  };
}
