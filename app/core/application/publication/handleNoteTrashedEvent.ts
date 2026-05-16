import type { NoteId } from "@/core/domain/note/valueObject";
import { PublicationService } from "@/core/domain/publication/service";
import type { ServiceArgs } from "../types";

export type HandleNoteTrashedEventInput = Readonly<{
  noteId: NoteId;
}>;

/**
 * Reaction handler for `note.trashed`.
 *
 * The spec says: "trashed note → PublicationState を非公開化、ShareLink を一括失効".
 * Trash is reversible — the matching `note.restored` does not re-publish
 * the state, but it does keep the state row around so the previous
 * visibility history is preserved.
 *
 * The state transition cascades to a full link revoke via the
 * publication service. Idempotent: if the state is already private the
 * service returns no drafts; revoking already-revoked links is a no-op.
 */
export async function handleNoteTrashedEvent({
  container,
  input,
}: ServiceArgs<HandleNoteTrashedEventInput>): Promise<void> {
  const now = container.clock.now();

  await container.unitOfWorkProvider.run(
    async ({
      publicationStateRepository,
      shareLinkRepository,
      collectEvents,
    }) => {
      const state = await publicationStateRepository.findById(input.noteId);
      if (state === null) return;

      const { eventDrafts } =
        await PublicationService.changeVisibilityAndCascade(
          state.entity,
          "private",
          now,
          {
            pubRepo: publicationStateRepository,
            linkRepo: shareLinkRepository,
          },
        );

      if (eventDrafts.length > 0) {
        collectEvents(eventDrafts);
      }
    },
  );
}
