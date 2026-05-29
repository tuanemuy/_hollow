import { NoteService } from "@/core/domain/note/service";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { ServiceArgs } from "../types";

export type HandleLinkTargetResolutionInput = Readonly<{
  noteId: NoteId;
}>;

/**
 * Reaction handler (NOT a mutation usecase) for the lifecycle events
 * that can make a note a fresh / changed link target:
 * `note.created` / `note.content_updated` / `note.renamed` /
 * `note.restored` (Issue #321). It re-resolves the `resolved_note_id`
 * projection on **other** notes' `note_internal_links` rows so that
 * `[[title]]` / `[[<uuid>]]` references converge on the latest catalogue
 * state. `resolved_note_id` is a body-derived projection, so it is
 * updated row-wise outside the aggregate boundary (ADR-008) — the
 * referenced notes' aggregates / versions are never touched and **no
 * domain events are collected** (the outbox stays unpolluted).
 *
 * The current title / owner / status are read at consume time from the
 * live aggregate rather than the event payload (the payload of
 * `note.restored` carries no title, and consume-time read converges on
 * the latest value under stale / reordered delivery — #145 ADR-001 /
 * #321 ADR-010). When the note is absent or no longer `active` the
 * handler is a no-op; the `trashed` transition is handled by
 * `handleLinkTargetTrashed`.
 *
 * All reads run before any `setLinkResolution` write so the deferred
 * pending-batch flush never depends on its own write (D1 has no
 * read-your-write within a UoW — #321 ADR-008). When nothing needs
 * (un)resolving the pending batch stays empty and the UoW returns as a
 * pure-read with no `db.batch` call.
 */
export async function handleLinkTargetResolution({
  container,
  input,
}: ServiceArgs<HandleLinkTargetResolutionInput>): Promise<void> {
  await container.unitOfWorkProvider.run(async ({ noteRepository }) => {
    const versioned = await noteRepository.findById(input.noteId);
    if (versioned === null) return;
    const note = versioned.entity;
    if (note.status !== "active") return;

    const noteId = note.id;
    const ownerId = note.ownerId;
    const currentTitle = note.title as string;

    // --- reads (decide before any write) ---

    // (a) stale title rows: resolved to this note but whose target no
    //     longer matches the current title. kind=id rows are id-stable
    //     so they never go stale here.
    const resolvedRows =
      await noteRepository.findResolvedLinkRowsByTarget(noteId);
    const staleTitleRowIds = resolvedRows
      .filter(
        (row) =>
          row.refKind === "title" &&
          row.refTarget.toLowerCase() !== currentTitle.toLowerCase(),
      )
      .map((row) => row.id);

    // (b) unresolved title rows pointing at the current title where the
    //     decision rule picks this note as the winner.
    const unresolvedTitleRows =
      await noteRepository.findUnresolvedTitleLinkRows(ownerId, currentTitle);
    const titleCandidates = await noteRepository.findActiveByOwnerAndTitle(
      ownerId,
      currentTitle,
    );
    const titleRowIdsToResolve = unresolvedTitleRows
      .filter(
        (row) =>
          NoteService.chooseResolutionForTitle(
            titleCandidates,
            row.fromNoteId,
          ) === noteId,
      )
      .map((row) => row.id);

    // (c) unresolved id rows pointing at this note's id (owner-scoped,
    //     active from, non-self). created mints a fresh id so this is
    //     usually empty; restore revives id rows cleared on trash.
    const unresolvedIdRows = await noteRepository.findUnresolvedIdLinkRows(
      ownerId,
      noteId,
    );
    const idRowIdsToResolve = unresolvedIdRows.map((row) => row.id);

    // --- writes (buffered onto the UoW pending batch) ---
    await noteRepository.setLinkResolution(staleTitleRowIds, null);
    await noteRepository.setLinkResolution(
      [...titleRowIdsToResolve, ...idRowIdsToResolve],
      noteId,
    );
  });
}
