import type { NoteId } from "@/core/domain/note/valueObject";
import { SavedView } from "@/core/domain/view/entity";
import { BrokenConditionMarker } from "@/core/domain/view/valueObject";
import type { ServiceArgs } from "../types";

export type HandleNotePurgedEventInput = Readonly<{
  noteId: string;
  // Title of the deleted note, snapshotted at purge time so the marker
  // can surface a concrete title (Issue #405 ADR-A). Empty string for the
  // `note.trashed` route (which carries no title) and legacy events.
  title: string;
}>;

/**
 * Mark every SavedView whose query references `noteId` (as
 * `referencingNoteId`) as having a broken note reference. Idempotent.
 */
export async function handleNotePurgedEvent({
  container,
  input,
}: ServiceArgs<HandleNotePurgedEventInput>): Promise<void> {
  const now = container.clock.now();
  const noteId = input.noteId as NoteId;

  await container.unitOfWorkProvider.run(async ({ savedViewRepository }) => {
    const candidates = await savedViewRepository.findReferencingNote(noteId);
    for (const view of candidates) {
      const marker = BrokenConditionMarker.note(noteId, input.title, now);
      const next = SavedView.markBroken(view, [marker], now);
      if (next === view) {
        continue;
      }
      const versioned = await savedViewRepository.findById(view.id);
      if (versioned === null) {
        continue;
      }
      await savedViewRepository.save(next, versioned.expectedVersion);
    }
  });
}
