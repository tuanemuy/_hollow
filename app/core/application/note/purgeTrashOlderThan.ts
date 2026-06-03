import type { UserId } from "@/core/domain/identity/valueObject";
import { NoteEvents } from "@/core/domain/note/events";
import type { ServiceArgs } from "../types";

export type PurgeTrashOlderThanInput = Readonly<{
  actorUserId: UserId;
  retentionDays: number;
}>;

export type PurgeTrashOlderThanOutput = Readonly<{ purgedCount: number }>;

/**
 * Batch worker entry point. Trashed notes older than the configured
 * retention window are physically deleted and a `note.purged` event is
 * emitted for each so downstream Media / Publication / View consumers can
 * reconcile their projections. Each note is purged in its own UoW so a
 * single failure does not block the rest of the batch.
 */
export async function purgeTrashOlderThan({
  container,
  input,
}: ServiceArgs<PurgeTrashOlderThanInput>): Promise<PurgeTrashOlderThanOutput> {
  const now = container.clock.now();
  const cutoff = new Date(
    now.getTime() - input.retentionDays * 24 * 60 * 60 * 1000,
  );

  let purgedCount = 0;
  const candidates = await container.unitOfWorkProvider.run(async (ctx) => {
    return ctx.noteRepository.findTrashedOlderThan(input.actorUserId, cutoff);
  });

  for (const note of candidates) {
    try {
      await container.unitOfWorkProvider.run(async (ctx) => {
        await ctx.noteRepository.purge(note.id);
        ctx.collectEvents([
          NoteEvents.purged(
            {
              noteId: note.id,
              ownerId: note.ownerId,
              title: note.title,
              mediaRefs: note.mediaRefs,
              sourceFileId: note.sourceFileId,
            },
            now,
          ),
        ]);
      });
      purgedCount += 1;
    } catch (error) {
      // Partial-failure tolerance: surface the failure to the logger and
      // continue with the remaining candidates. The next batch run will
      // retry the failed row.
      container.logger.warn(
        `[note.purgeTrashOlderThan] failed to purge note ${note.id}`,
        { noteId: note.id, cause: error },
      );
    }
  }

  return { purgedCount };
}
