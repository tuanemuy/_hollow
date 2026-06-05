import { DirectoryService } from "@/core/domain/directory/service";
import { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { Note } from "@/core/domain/note/entity";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { PublicationVisibility } from "@/core/domain/publication/valueObject";
import { SearchService } from "@/core/domain/search/service";
import { SearchQuery } from "@/core/domain/search/valueObject";
import type { RequestContainer } from "../di/types";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import { type OwnedSearchHitDTO, toOwnedSearchHitView } from "./view";

export type SearchOwnNotesInput = Readonly<{
  actorUserId: string;
  keyword: string;
  tagNames?: readonly string[];
  directoryId?: string | null;
  dateRange?: { from: Date; to: Date } | null;
  visibility?: readonly PublicationVisibility[];
  cursor?: string | null;
  limit: number;
}>;

export type SearchOwnNotesOutput = Readonly<{
  hits: readonly OwnedSearchHitDTO[];
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
    ownerIdFilter: input.actorUserId as UserId,
    visibilityFilter: input.visibility ?? ["private", "unlisted", "public"],
    tagNames: input.tagNames ?? [],
    directoryPathPrefix,
    dateRange: input.dateRange ?? null,
    limit: input.limit,
    cursor: input.cursor ?? null,
  });

  const result = await SearchService.runQuery(query, container.searchIndex);

  // Short-circuit the secondary projection lookup when the index has
  // nothing to materialise; the empty UoW open costs nothing but the
  // intent is clearer this way.
  if (result.hits.length === 0) {
    return { hits: [], nextCursor: result.nextCursor };
  }

  // Re-key the bulk read by id so we can preserve `result.hits` order
  // (score desc, which the search index already returns) regardless of
  // the adapter's row order. Ids missing from the DB are silently
  // dropped — see `.issue/48/adr.md` ADR-002 (search index eventual
  // consistency vs. UX integrity).
  const hitIds = result.hits.map((hit) => hit.noteId);
  // Open a fresh read-only UoW for the projection lookup rather than
  // extending `resolveDirectoryPathPrefix`'s UoW across the index RPC.
  // See `.issue/48/adr.md` ADR-001 (UoW の分離方針).
  const notesById = await container.unitOfWorkProvider.run(
    async ({ noteRepository }) => {
      const found = await noteRepository.findByIds(hitIds);
      const map = new Map<NoteId, Note>();
      for (const note of found) {
        map.set(note.id, note);
      }
      return map;
    },
  );

  const projected = result.hits.flatMap((hit) => {
    const note = notesById.get(hit.noteId);
    if (note === undefined) return [];
    return [toOwnedSearchHitView(hit, note)];
  });

  return {
    hits: projected,
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
