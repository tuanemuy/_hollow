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
 * The target's status is re-read at consume time (`findById`) before
 * unresolving — **symmetric with `handleLinkTargetResolution`** so the
 * pair converges under at-least-once / out-of-order delivery. Delivery
 * has no ordering guarantee, so a `note.trashed` can arrive after the
 * matching `note.restored` (reorder) or be redelivered after a restore.
 * In those cases the note is `active` again, and unconditionally clearing
 * its resolved rows would leave them permanently null with no later event
 * to repair them. So we unresolve **only when the note is currently
 * trashed**; an `active` note (a restore won) or an absent note (purged —
 * the FK already cleared the rows) is a no-op. The matching re-resolution
 * on `note.restored` is handled by `handleLinkTargetResolution`.
 *
 * Like `handleLinkTargetResolution` this only mutates the
 * `resolved_note_id` projection — no aggregate is touched and **no
 * domain events are collected**. Idempotent: a redelivery of a still-valid
 * trash finds no rows still resolved to the note and the pending batch
 * stays empty (pure-read UoW).
 */
export async function handleLinkTargetTrashed({
  container,
  input,
}: ServiceArgs<HandleLinkTargetTrashedInput>): Promise<void> {
  await container.unitOfWorkProvider.run(async ({ noteRepository }) => {
    const versioned = await noteRepository.findById(input.noteId);
    // Absent (purged → FK already set-null) or active again (a restore
    // superseded / reordered ahead of this trash) → nothing to unresolve.
    if (versioned === null || versioned.entity.status === "active") return;

    const resolvedRows = await noteRepository.findResolvedLinkRowsByTarget(
      input.noteId,
    );
    const rowIds = resolvedRows.map((row) => row.id);
    await noteRepository.setLinkResolution(rowIds, null);
  });
}
