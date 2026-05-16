import type { SearchHit } from "@/core/domain/search/valueObject";
import { type SearchHitDTO, toSearchHitDTO } from "../dto/search";

export type { SearchHitDTO } from "../dto/search";

/**
 * Projection helper for a single `SearchHit`. Delegates to the
 * common DTO module so callers can import the helper from the search
 * usecase package alongside its sibling usecases.
 */
export function toSearchHitView(hit: SearchHit): SearchHitDTO {
  return toSearchHitDTO(hit);
}
