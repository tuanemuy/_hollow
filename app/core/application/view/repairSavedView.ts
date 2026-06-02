import type { UserId } from "@/core/domain/identity/valueObject";
import { SavedView } from "@/core/domain/view/entity";
import { type SavedViewDTO, toSavedViewDTO } from "../dto/view";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type RepairSavedViewInput = Readonly<{
  actorUserId: string;
  viewId: string;
}>;

export type RepairSavedViewOutput = Readonly<{ view: SavedViewDTO }>;

/**
 * Strip every broken reference out of a SavedView's query and clear its
 * broken-condition markers (`SavedView.repairBrokenConditions`). A view
 * with no broken conditions is a no-op — the entity returns the same
 * instance and nothing is persisted.
 */
export async function repairSavedView({
  container,
  input,
}: ServiceArgs<RepairSavedViewInput>): Promise<RepairSavedViewOutput> {
  const now = container.clock.now();
  const actorUserId = input.actorUserId as UserId;

  const persisted = await container.unitOfWorkProvider.run(
    async ({ savedViewRepository }) => {
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

      const next = SavedView.repairBrokenConditions(found.entity, now);
      if (next === found.entity) {
        return found.entity;
      }
      await savedViewRepository.save(next, found.expectedVersion);
      return next;
    },
  );

  return { view: toSavedViewDTO(persisted) };
}
