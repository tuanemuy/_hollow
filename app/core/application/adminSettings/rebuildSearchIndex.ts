import type { UserId } from "@/core/domain/identity/valueObject";
import type { Note } from "@/core/domain/note/entity";
import type { SearchDocument as SearchDocumentType } from "@/core/domain/search/entity";
import { SearchDocument } from "@/core/domain/search/entity";
import { buildNoteSnapshots } from "../search/buildNoteSnapshot";
import type { ServiceArgs } from "../types";
import { assertAdmin } from "./authorization";

/**
 * Owner-page size for the cursor-based `userRepository.listAll` walk.
 * Kept independent from `SearchLimit` so the UI's search page-size cap
 * (current 50) is not coupled to the rebuild fan-out — see
 * `.issue/93/adr.md` ADR-002.
 */
const REBUILD_USER_PAGE_SIZE = 50;

/**
 * Note-page size for the per-owner offset walk through
 * `noteRepository.findByOwner({ status: 'active' })`. Also intentionally
 * independent from `SearchLimit` (ADR-002).
 */
const REBUILD_PAGE_SIZE = 50;

export type RebuildSearchIndexInput = Readonly<{
  actorUserId: string;
}>;

export type RebuildSearchIndexOutput = Readonly<{
  processedCount: number;
  startedAt: Date;
  finishedAt: Date;
}>;

/**
 * Admin-only rebuild of the entire search index from upstream Note
 * aggregates. The rebuild is the canonical recovery path when the host
 * table `search_documents` is stale or corrupt: `bulkRebuildFromSnapshots`
 * performs a single `DELETE FROM search_documents` followed by chunked
 * `INSERT`s, so the index converges to the most recent active-note
 * snapshot regardless of prior state.
 *
 * Pagination strategy:
 * - Users are enumerated via the cursor-based `userRepository.listAll`
 *   (the port shape is `{ limit, cursor?: UserId }`); the walk
 *   terminates when a page returns no rows or fewer than the requested
 *   `REBUILD_USER_PAGE_SIZE`.
 * - Per-owner active notes are walked via the offset-based
 *   `noteRepository.findByOwner({ status: 'active', limit, offset })`;
 *   the walk terminates on a short page.
 * - Each page opens a fresh UoW (read-only) so the in-flight statement
 *   budget per D1 batch stays well under the per-transaction cap. See
 *   ADR-002 for the budget calculation.
 *
 * Concurrency:
 * - No server-side rebuild lock (ADR-003). The DELETE + INSERT inside
 *   `bulkRebuildFromSnapshots` is idempotent and concurrent runs
 *   converge to the snapshot of whichever generator finishes last.
 *   Client-side multiple-submit guards live in the admin UI.
 *
 * Errors:
 * - `ForbiddenError('FORBIDDEN_ADMIN_ONLY')` when the actor is not an
 *   active admin (via `assertAdmin`).
 * - `SearchIndexUnavailableError` and `SystemError(DatabaseError)` from
 *   the adapter flow through unchanged — the presentation layer maps
 *   them to HTTP responses.
 */
export async function rebuildSearchIndex({
  container,
  input,
}: ServiceArgs<RebuildSearchIndexInput>): Promise<RebuildSearchIndexOutput> {
  await container.unitOfWorkProvider.run(async ({ userRepository }) => {
    await assertAdmin(userRepository, input.actorUserId);
  });

  const now = container.clock.now();
  const startedAt = now;
  let processedCount = 0;

  async function* iterate(): AsyncGenerator<SearchDocumentType, void, unknown> {
    let cursor: UserId | undefined;
    while (true) {
      const users = await container.unitOfWorkProvider.run(
        async ({ userRepository }) =>
          userRepository.listAll(
            cursor === undefined
              ? { limit: REBUILD_USER_PAGE_SIZE }
              : { limit: REBUILD_USER_PAGE_SIZE, cursor },
          ),
      );
      if (users.length === 0) break;
      for (const user of users) {
        let offset = 0;
        while (true) {
          const { snapshots, fetched } = await container.unitOfWorkProvider.run(
            async ({
              noteRepository,
              directoryRepository,
              tagRepository,
              publicationStateRepository,
            }) => {
              const notes = await noteRepository.findByOwner(user.id, {
                status: "active",
                limit: REBUILD_PAGE_SIZE,
                offset,
              });
              if (notes.length === 0) {
                return {
                  snapshots: [] as const,
                  fetched: 0,
                };
              }
              const snaps = await buildNoteSnapshots(notes as readonly Note[], {
                directoryRepository,
                tagRepository,
                publicationStateRepository,
                htmlSanitizer: container.htmlSanitizer,
              });
              return { snapshots: snaps, fetched: notes.length };
            },
          );
          for (const snap of snapshots) {
            processedCount += 1;
            yield SearchDocument.fromSnapshot(snap, now);
          }
          if (fetched < REBUILD_PAGE_SIZE) break;
          offset += fetched;
        }
      }
      if (users.length < REBUILD_USER_PAGE_SIZE) break;
      cursor = users[users.length - 1]?.id;
      if (cursor === undefined) break;
    }
  }

  await container.searchIndex.bulkRebuildFromSnapshots(iterate());

  return {
    processedCount,
    startedAt,
    finishedAt: container.clock.now(),
  };
}
