import type { UserId } from "@/core/domain/identity/valueObject";
import { assertAdmin } from "../adminSettings/authorization";
import type { ServiceArgs } from "../types";
import { backfillInternalLinkResolution } from "./backfillInternalLinkResolution";

/**
 * Owner-page size for the cursor-based `userRepository.listAll` walk.
 * Mirrors `rebuildSearchIndex`'s `REBUILD_USER_PAGE_SIZE` — the admin
 * fan-out enumerates owners the same way.
 */
export const BACKFILL_OWNER_PAGE_SIZE = 50;

export type BackfillAllOwnersInternalLinkResolutionInput = Readonly<{
  actorUserId: string;
}>;

/**
 * `scannedNotes` is the sum of the per-owner `scannedNotes` figures — the
 * number of active-note *scans* performed across all owners, not a
 * distinct note count. Under concurrent mutation the per-owner offset
 * paging may re-read or skip rows, so treat it as a progress figure, not a
 * cardinality. `resolvedRows` is the total `note_internal_links` rows newly
 * resolved across all owners; `ownerCount` is the number of owners walked.
 */
export type BackfillAllOwnersInternalLinkResolutionOutput = Readonly<{
  ownerCount: number;
  scannedNotes: number;
  resolvedRows: number;
  startedAt: Date;
  finishedAt: Date;
}>;

/**
 * Admin-only operational backfill that walks every owner and applies the
 * owner-scoped {@link backfillInternalLinkResolution} to each, aggregating
 * the per-owner counts. This is the operational repair path for
 * `note_internal_links` rows left `resolved_note_id IS NULL` before the
 * Issue #127 resolution fix.
 *
 * Owners are enumerated via the cursor-based `userRepository.listAll`
 * (port shape `{ limit, cursor?: UserId }`); the walk terminates when a
 * page returns no rows or fewer than `BACKFILL_OWNER_PAGE_SIZE`.
 *
 * `scannedNotes` is the sum of the per-owner scan counts (number of scans,
 * not distinct notes — see the output type's JSDoc). The owner-scoped
 * usecase is idempotent and deterministic, so this admin usecase is too:
 * already-resolved rows drop out of `findUnresolvedTitleLinkRows`, and a
 * re-run after a partial failure or timeout converges on the complete
 * result.
 *
 * Authorization lives here: the owner-scoped {@link
 * backfillInternalLinkResolution} performs no admin check, so it must
 * always be invoked through this usecase (never directly from a server
 * function). `ForbiddenError('FORBIDDEN_ADMIN_ONLY')` is thrown via
 * `assertAdmin` when the actor is not an active admin.
 */
export async function backfillAllOwnersInternalLinkResolution({
  container,
  input,
}: ServiceArgs<BackfillAllOwnersInternalLinkResolutionInput>): Promise<BackfillAllOwnersInternalLinkResolutionOutput> {
  await container.unitOfWorkProvider.run(async ({ userRepository }) => {
    await assertAdmin(userRepository, input.actorUserId);
  });

  const startedAt = container.clock.now();
  let ownerCount = 0;
  let scannedNotes = 0;
  let resolvedRows = 0;

  let cursor: UserId | undefined;
  while (true) {
    const users = await container.unitOfWorkProvider.run(
      async ({ userRepository }) =>
        userRepository.listAll(
          cursor === undefined
            ? { limit: BACKFILL_OWNER_PAGE_SIZE }
            : { limit: BACKFILL_OWNER_PAGE_SIZE, cursor },
        ),
    );
    if (users.length === 0) break;
    for (const user of users) {
      const out = await backfillInternalLinkResolution({
        container,
        input: { ownerId: user.id },
      });
      ownerCount += 1;
      scannedNotes += out.scannedNotes;
      resolvedRows += out.resolvedRows;
    }
    if (users.length < BACKFILL_OWNER_PAGE_SIZE) break;
    cursor = users[users.length - 1]?.id;
    if (cursor === undefined) break;
  }

  return {
    ownerCount,
    scannedNotes,
    resolvedRows,
    startedAt,
    finishedAt: container.clock.now(),
  };
}
