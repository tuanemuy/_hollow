import type { UserId } from "@/core/domain/identity/valueObject";
import { NoteService } from "@/core/domain/note/service";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { ServiceArgs } from "../types";

export type BackfillInternalLinkResolutionInput = Readonly<{
  ownerId: UserId;
}>;

export type BackfillInternalLinkResolutionOutput = Readonly<{
  /**
   * Number of active-note *scans* performed (page rows read), not a
   * distinct note count. Under concurrent mutation of the owner's active
   * notes the offset paging may re-read or skip rows, so this can differ
   * from the true note count — treat it as a progress figure, not a
   * cardinality. See the function JSDoc for the convergence guarantee.
   */
  scannedNotes: number;
  /** Number of `note_internal_links` rows newly resolved. */
  resolvedRows: number;
}>;

// Page size for walking the owner's active notes. Each note becomes a
// potential link target; bounding the page keeps per-UoW memory and the
// per-note resolution queries within practical limits.
const PAGE_LIMIT = 100;

/**
 * Operational, owner-scoped backfill for `note_internal_links` rows that
 * were left `resolved_note_id IS NULL` before the Issue #321 reaction
 * handlers existed (e.g. links whose target already existed at save time
 * but predate the #127 resolution fix, or whose target was created
 * without an intervening re-save).
 *
 * Walks the owner's active notes and, for each, resolves the unresolved
 * `kind=title` link rows that the decision rule
 * ({@link NoteService.chooseResolutionForTitle}) assigns to it — the same
 * rule the save-time and reaction-handler paths use, so the result is
 * consistent across all three. Idempotent: already-resolved rows do not
 * appear in `findUnresolvedTitleLinkRows`, so re-running is a no-op.
 *
 * This is a projection-only repair (ADR-008): it never touches aggregates
 * or emits domain events. Each page runs in its own UoW with all reads
 * ordered before the buffered `setLinkResolution` write.
 *
 * Paging is offset/limit over the owner's active notes across independent
 * UoWs. This usecase never changes a note's active status, so it induces
 * no drift itself; but a *concurrent* trash/restore/create during a long
 * run can make the offset window skip or re-read a note. That only affects
 * single-run completeness, never correctness: because resolution is
 * idempotent (resolved rows drop out of `findUnresolvedTitleLinkRows`) and
 * deterministic (same decision rule everywhere), a re-run converges on the
 * complete result. Intended as a re-runnable operational repair, not a
 * one-shot snapshot.
 *
 * `kind=id` rows are not backfilled here: a `[[<uuid>]]` link resolves at
 * save time when its target is present (ADR-007), and the
 * `note.restored` reaction handler revives id rows cleared on trash. A
 * stale unresolved id row implies the target never existed while active,
 * which a title-keyed backfill cannot repair.
 */
export async function backfillInternalLinkResolution({
  container,
  input,
}: ServiceArgs<BackfillInternalLinkResolutionInput>): Promise<BackfillInternalLinkResolutionOutput> {
  let scannedNotes = 0;
  let resolvedRows = 0;
  let offset = 0;

  for (;;) {
    const pageResolved = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) => {
        const notes = await noteRepository.findByOwner(input.ownerId, {
          status: "active",
          limit: PAGE_LIMIT,
          offset,
        });
        if (notes.length === 0) return { processed: 0, resolved: 0 };

        // Reads first: collect every row that should be resolved across
        // the whole page before issuing any buffered write (D1 has no
        // read-your-write within a UoW — ADR-008).
        const rowIdsByTarget = new Map<NoteId, string[]>();
        for (const note of notes) {
          const title = note.title as string;
          const unresolved = await noteRepository.findUnresolvedTitleLinkRows(
            input.ownerId,
            title,
          );
          if (unresolved.length === 0) continue;
          const candidates = await noteRepository.findActiveByOwnerAndTitle(
            input.ownerId,
            title,
          );
          for (const row of unresolved) {
            if (
              NoteService.chooseResolutionForTitle(
                candidates,
                row.fromNoteId,
              ) === note.id
            ) {
              const arr = rowIdsByTarget.get(note.id) ?? [];
              arr.push(row.id);
              rowIdsByTarget.set(note.id, arr);
            }
          }
        }

        let resolved = 0;
        for (const [targetId, rowIds] of rowIdsByTarget) {
          await noteRepository.setLinkResolution(rowIds, targetId);
          resolved += rowIds.length;
        }

        return { processed: notes.length, resolved };
      },
    );

    scannedNotes += pageResolved.processed;
    resolvedRows += pageResolved.resolved;
    if (pageResolved.processed < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }

  return { scannedNotes, resolvedRows };
}
