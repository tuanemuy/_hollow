import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import { SavedView } from "@/core/domain/view/entity";
import { SavedViewService } from "@/core/domain/view/service";
import { toInstant } from "../dto/common";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type BrokenConditionMarkerDTO = Readonly<{
  kind: "tag" | "directory" | "note";
  id: TagId | DirectoryId | NoteId | string;
  lastSeenName: string;
  lastSeenAt: string;
}>;

export type ValidateSavedViewInput = Readonly<{
  actorUserId: string;
  viewId: string;
}>;

export type ValidateSavedViewOutput = Readonly<{
  brokenConditions: readonly BrokenConditionMarkerDTO[];
}>;

export async function validateSavedView({
  container,
  input,
}: ServiceArgs<ValidateSavedViewInput>): Promise<ValidateSavedViewOutput> {
  const now = container.clock.now();
  const actorUserId = input.actorUserId as UserId;

  const markers = await container.unitOfWorkProvider.run(
    async ({
      savedViewRepository,
      directoryRepository,
      tagRepository,
      noteRepository,
    }) => {
      const found = await savedViewRepository.findById(input.viewId);
      if (found === null) {
        throw new NotFoundError(
          "SAVED_VIEW_NOT_FOUND",
          `Saved view not found: ${input.viewId}`,
        );
      }
      if (found.entity.ownerId !== actorUserId) {
        throw new ForbiddenError(
          "SAVED_VIEW_FORBIDDEN",
          `Saved view ${input.viewId} is not owned by actor`,
        );
      }

      const detected = await SavedViewService.detectBrokenConditions(
        found.entity,
        now,
        {
          dirRepo: directoryRepository,
          tagRepo: tagRepository,
          noteRepo: noteRepository,
        },
      );
      const next = SavedView.markBroken(found.entity, detected, now);
      if (next !== found.entity) {
        await savedViewRepository.save(next, found.expectedVersion);
      }
      return next.brokenConditions;
    },
  );

  return {
    brokenConditions: markers.map((marker) => ({
      kind: marker.kind,
      id: marker.id as string,
      lastSeenName: marker.lastSeenName,
      lastSeenAt: toInstant(marker.lastSeenAt),
    })),
  };
}
