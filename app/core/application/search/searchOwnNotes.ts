import { DirectoryService } from "@/core/domain/directory/service";
import { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import { SearchService } from "@/core/domain/search/service";
import { SearchQuery } from "@/core/domain/search/valueObject";
import type { RequestContainer } from "../di/types";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import { type SearchHitDTO, toSearchHitView } from "./view";

export type SearchOwnNotesInput = Readonly<{
  actorUserId: UserId;
  keyword: string;
  tagNames?: readonly string[];
  directoryId?: string | null;
  dateRange?: { from: Date; to: Date } | null;
  cursor?: string | null;
  limit: number;
}>;

export type SearchOwnNotesOutput = Readonly<{
  hits: readonly SearchHitDTO[];
  nextCursor: string | null;
}>;

/**
 * Full-text search across the actor's own notes (all visibilities).
 *
 * The directory filter is materialised as a `directoryPath` prefix so
 * the index can answer "this directory or any descendant" in a single
 * scan. `DirectoryService.computePath` does the resolution; an unknown
 * `directoryId` surfaces as `NotFoundError('directory')`.
 */
export async function searchOwnNotes({
  container,
  input,
}: ServiceArgs<SearchOwnNotesInput>): Promise<SearchOwnNotesOutput> {
  const directoryPathPrefix = await resolveDirectoryPathPrefix(
    container,
    input,
  );

  const query = SearchQuery.create({
    keyword: input.keyword,
    ownerIdFilter: input.actorUserId,
    visibilityFilter: ["private", "unlisted", "public"],
    tagNames: input.tagNames ?? [],
    directoryPathPrefix,
    dateRange: input.dateRange ?? null,
    limit: input.limit,
    cursor: input.cursor ?? null,
  });

  const result = await SearchService.runQuery(query, container.searchIndex);

  return {
    hits: result.hits.map(toSearchHitView),
    nextCursor: result.nextCursor,
  };
}

async function resolveDirectoryPathPrefix(
  container: RequestContainer,
  input: SearchOwnNotesInput,
): Promise<string | null> {
  if (input.directoryId === undefined || input.directoryId === null) {
    return null;
  }
  const directoryId = DirectoryId.create(input.directoryId);
  return container.unitOfWorkProvider.run(async ({ directoryRepository }) => {
    const found = await directoryRepository.findById(directoryId);
    if (found === null) {
      throw new NotFoundError(
        "directory",
        `Directory not found: ${directoryId}`,
      );
    }
    const path = await DirectoryService.computePath(
      found.entity,
      directoryRepository,
    );
    return path as string;
  });
}
