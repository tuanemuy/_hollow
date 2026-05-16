import type { UserId } from "@/core/domain/identity/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type DeleteSavedViewInput = Readonly<{
  actorUserId: string;
  viewId: string;
}>;

export async function deleteSavedView({
  container,
  input,
}: ServiceArgs<DeleteSavedViewInput>): Promise<void> {
  const actorUserId = input.actorUserId as UserId;

  await container.unitOfWorkProvider.run(async ({ savedViewRepository }) => {
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
    await savedViewRepository.delete(found.entity.id, found.expectedVersion);
  });
}
