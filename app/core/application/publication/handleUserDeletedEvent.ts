import type { UserId } from "@/core/domain/identity/valueObject";
import { PublicationService } from "@/core/domain/publication/service";
import type { ServiceArgs } from "../types";

export type HandleUserDeletedEventInput = Readonly<{
  userId: UserId;
}>;

const PAGE_LIMIT = 200;

/**
 * Reaction handler for `user.deleted`.
 *
 * Forces every publication state owned by the user back to `private`
 * and cascades a full link revocation. Implementation enumerates the
 * user's notes via `NoteRepository.findByOwner` (the publication
 * repository does not expose an "all-by-owner" iterator — there is no
 * domain need for one outside this cascade); for each note we run the
 * standard `changeVisibilityAndCascade` flow so the
 * `note.publish_changed` + `share_link.revoked` events fan out to the
 * usual downstream consumers.
 *
 * Idempotent: a state that is already private is a no-op (the service
 * returns empty drafts and does not write). Re-delivery is safe.
 */
export async function handleUserDeletedEvent({
  container,
  input,
}: ServiceArgs<HandleUserDeletedEventInput>): Promise<void> {
  const now = container.clock.now();

  // Pull the user's notes in pages so a deleted user with a very large
  // collection does not blow the UoW batch budget. Each page is its
  // own UoW so partial progress is durable across retries.
  let offset = 0;
  while (true) {
    const noteIds = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) => {
        const notes = await noteRepository.findByOwner(input.userId, {
          limit: PAGE_LIMIT,
          offset,
        });
        return notes.map((n) => n.id);
      },
    );

    if (noteIds.length === 0) break;

    for (const noteId of noteIds) {
      await container.unitOfWorkProvider.run(
        async ({
          publicationStateRepository,
          shareLinkRepository,
          collectEvents,
        }) => {
          const state = await publicationStateRepository.findById(noteId);
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

    if (noteIds.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }
}
