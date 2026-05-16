import { notFound } from "@tanstack/react-router";
import { cache } from "react";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { serverData } from "@/core/presentation/serverAction";

export type PublishStateLoaderInput = Readonly<{
  noteId: NoteId;
  actorUserId: UserId;
}>;

/**
 * Load both the share-links and the current publication state in a
 * single UoW. `listShareLinks` already asserts ownership + active
 * status; we piggyback the publication-state lookup so the modal can
 * render the current radio selection without a second round-trip.
 *
 * Returns `null` for `state` when no `PublicationState` row exists
 * yet — the modal treats that as "private" (the spec's default).
 */
export const loadPublishState = cache(
  serverData(
    () => import("@/core/application/publication/listShareLinks"),
    async (
      { container },
      { listShareLinks },
      input: PublishStateLoaderInput,
    ) => {
      const { links } = await listShareLinks({
        container,
        input: { actorUserId: input.actorUserId, noteId: input.noteId },
      });

      const publication = await container.unitOfWorkProvider.run(
        async ({ publicationStateRepository }) => {
          const found = await publicationStateRepository.findById(input.noteId);
          if (found === null) return null;
          return found.entity;
        },
      );

      if (publication === null) {
        return {
          visibility: "private" as const,
          publishedAt: null as string | null,
          links,
        };
      }

      return {
        visibility: publication.visibility,
        publishedAt:
          publication.publishedAt === null
            ? null
            : publication.publishedAt.toISOString(),
        links,
      };
    },
  ),
);

/**
 * Helper that re-throws `notFound()` when the publication state load
 * raises a NotFound — keeps the route's notFoundComponent in charge of
 * the 404 surface.
 */
export async function loadPublishStateOrNotFound(
  input: PublishStateLoaderInput,
) {
  try {
    return await loadPublishState(input);
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "NOTE_NOT_FOUND"
    ) {
      throw notFound();
    }
    throw error;
  }
}
