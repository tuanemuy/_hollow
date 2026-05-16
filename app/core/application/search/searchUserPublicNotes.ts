import type { UserId } from "@/core/domain/identity/valueObject";
import type { ServiceArgs } from "../types";
import {
  type SearchPublicNotesOutput,
  searchPublicNotes,
} from "./searchPublicNotes";

export type SearchUserPublicNotesInput = Readonly<{
  targetUsername: string;
  viewerUserId: UserId | null;
  keyword?: string;
  tagNames?: readonly string[];
  cursor?: string | null;
  limit: number;
}>;

export type SearchUserPublicNotesOutput = SearchPublicNotesOutput;

/**
 * Author-scoped public search.
 *
 * Thin wrapper around `searchPublicNotes` that fixes `username` to
 * the targeted author. Keeping the wrapper as a distinct usecase makes
 * the route surface explicit (`/users/:username/search` vs `/search`)
 * and isolates future personalisation knobs that may diverge between
 * the global feed and a single-author page.
 *
 * Empty keyword falls back to `*` so the call still satisfies
 * `SearchKeyword.create`'s 1-char minimum; downstream FTS treats the
 * single token as match-anything within the author scope.
 */
export async function searchUserPublicNotes({
  container,
  input,
}: ServiceArgs<SearchUserPublicNotesInput>): Promise<SearchUserPublicNotesOutput> {
  return searchPublicNotes({
    container,
    input: {
      viewerUserId: input.viewerUserId,
      keyword:
        input.keyword === undefined || input.keyword.trim().length === 0
          ? "*"
          : input.keyword,
      tagNames: input.tagNames ?? [],
      dateRange: null,
      username: input.targetUsername,
      cursor: input.cursor ?? null,
      limit: input.limit,
    },
  });
}
