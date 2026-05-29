import type { NoteId } from "@/core/domain/note/valueObject";
import type { ServiceArgs } from "../types";

export type HandleLinkTargetTrashedInput = Readonly<{
  noteId: NoteId;
}>;

/**
 * Reaction handler (NOT a mutation usecase) for `note.trashed` (Issue
 * #321). When a note is logically deleted, every `note_internal_links`
 * row that currently resolves to it (both `kind=title` and `kind=id`)
 * must drop back to unresolved so dependent backlinks / link rendering
 * stop pointing at a trashed note. The FK `ON DELETE SET NULL` on
 * `resolved_note_id` fires only on a physical delete, so trash (a
 * status change) needs this explicit unresolve.
 *
 * Like `handleLinkTargetResolution` this only mutates the
 * `resolved_note_id` projection — no aggregate is touched and **no
 * domain events are collected**. Idempotent: a second delivery finds no
 * rows still resolved to the note and the pending batch stays empty
 * (pure-read UoW). The matching re-resolution on `note.restored` is
 * handled by `handleLinkTargetResolution`.
 */
export async function handleLinkTargetTrashed({
  container,
  input,
}: ServiceArgs<HandleLinkTargetTrashedInput>): Promise<void> {
  await container.unitOfWorkProvider.run(async ({ noteRepository }) => {
    const resolvedRows = await noteRepository.findResolvedLinkRowsByTarget(
      input.noteId,
    );
    const rowIds = resolvedRows.map((row) => row.id);
    await noteRepository.setLinkResolution(rowIds, null);
  });
}
