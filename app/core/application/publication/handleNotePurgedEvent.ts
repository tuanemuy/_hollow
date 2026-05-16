import type { NoteId } from "@/core/domain/note/valueObject";
import type { ServiceArgs } from "../types";

export type HandleNotePurgedEventInput = Readonly<{
  noteId: NoteId;
}>;

/**
 * Reaction handler for `note.purged` (the post-retention physical
 * delete event emitted by the note domain).
 *
 * The publication side mirrors the purge: share links and the
 * publication state for the note are physically deleted, with no
 * accompanying domain events — the source-of-truth `note.purged`
 * already exists for downstream consumers.
 *
 * Idempotent: missing rows are skipped silently so a re-delivery of
 * the same event is a no-op.
 */
export async function handleNotePurgedEvent({
  container,
  input,
}: ServiceArgs<HandleNotePurgedEventInput>): Promise<void> {
  await container.unitOfWorkProvider.run(
    async ({ publicationStateRepository, shareLinkRepository }) => {
      const links = await shareLinkRepository.findByNoteId(input.noteId);
      for (const link of links) {
        const versioned = await shareLinkRepository.findById(link.id);
        if (versioned === null) continue;
        await shareLinkRepository.delete(link.id, versioned.expectedVersion);
      }

      const state = await publicationStateRepository.findById(input.noteId);
      if (state !== null) {
        await publicationStateRepository.delete(
          input.noteId,
          state.expectedVersion,
        );
      }
    },
  );
}
