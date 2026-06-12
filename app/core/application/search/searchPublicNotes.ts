import { type UserId, Username } from "@/core/domain/identity/valueObject";
import { SearchService } from "@/core/domain/search/service";
import { SearchQuery, type SearchSort } from "@/core/domain/search/valueObject";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import { type SearchHitDTO, toSearchHitView } from "./view";

export type SearchPublicNotesInput = Readonly<{
  /** Tracked for future personalisation / rate-limit dispatch. */
  viewerUserId: UserId | null;
  keyword: string;
  tagNames?: readonly string[];
  dateRange?: { from: Date; to: Date } | null;
  /**
   * When set, narrows results to a single author. The username must
   * resolve to a live user (`status !== 'deleted'` and not suspended);
   * otherwise the usecase raises `NotFoundError('user')`.
   */
  username?: string | null;
  /**
   * Result ordering. `'newest'` orders by the index projection's
   * `updated_at` descending (the value shown on the result card);
   * omitted / null falls back to `'relevance'`.
   */
  sort?: SearchSort | null;
  cursor?: string | null;
  limit: number;
}>;

export type SearchPublicNotesOutput = Readonly<{
  hits: readonly SearchHitDTO[];
  nextCursor: string | null;
}>;

/**
 * Cross-instance public search.
 *
 * The visibility filter is locked to `['public']` so unlisted /
 * private notes never leak through the public surface even if a
 * future projection drifts. `username` is resolved against
 * `UserRepository.findByUsername` and rejected if the user is
 * deleted or suspended — both should appear as a missing author
 * from the public surface's perspective.
 *
 * `dateRange`, when set, narrows by the publication aggregate's
 * `published_at` (公開日) — not the note's `date_for_calendar`. The
 * adapter joins `publication_states` for the windowed read (ADR-003).
 */
export async function searchPublicNotes({
  container,
  input,
}: ServiceArgs<SearchPublicNotesInput>): Promise<SearchPublicNotesOutput> {
  const ownerIdFilter = await resolveOwnerIdFilter(container, input);

  const query = SearchQuery.create({
    keyword: input.keyword,
    ownerIdFilter,
    visibilityFilter: ["public"],
    tagNames: input.tagNames ?? [],
    directoryPathPrefix: null,
    dateRange: input.dateRange ?? null,
    // Public surface: the period window means 公開日, so it is evaluated
    // against the publication aggregate's `published_at` (ADR-006).
    dateBasis: "published_at",
    sort: input.sort ?? "relevance",
    limit: input.limit,
    cursor: input.cursor ?? null,
  });

  const result = await SearchService.runQuery(query, container.searchIndex);

  return {
    hits: result.hits.map(toSearchHitView),
    nextCursor: result.nextCursor,
  };
}

async function resolveOwnerIdFilter(
  container: ServiceArgs<SearchPublicNotesInput>["container"],
  input: SearchPublicNotesInput,
): Promise<UserId | null> {
  if (input.username === undefined || input.username === null) {
    return null;
  }
  const username = Username.create(input.username);
  return container.unitOfWorkProvider.run(async ({ userRepository }) => {
    const user = await userRepository.findByUsername(username);
    if (user === null) {
      throw new NotFoundError("user", `User not found: ${username}`);
    }
    if (user.status === "deleted" || user.status === "suspended") {
      throw new NotFoundError("user", `User not available: ${username}`);
    }
    return user.id;
  });
}
