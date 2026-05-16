import type { UserId } from "@/core/domain/identity/valueObject";
import { SavedView } from "@/core/domain/view/entity";
import { SavedViewService } from "@/core/domain/view/service";
import { ViewKind } from "@/core/domain/view/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type SetDefaultSavedViewInput = Readonly<{
  actorUserId: string;
  kind: "personal" | "public";
  viewId: string | null;
}>;

export async function setDefaultSavedView({
  container,
  input,
}: ServiceArgs<SetDefaultSavedViewInput>): Promise<void> {
  const now = container.clock.now();
  const actorUserId = input.actorUserId as UserId;
  const kind = ViewKind.create(input.kind);

  await container.unitOfWorkProvider.run(async ({ savedViewRepository }) => {
    if (input.viewId === null) {
      await SavedViewService.ensureSingleDefault(
        actorUserId,
        kind,
        null,
        now,
        savedViewRepository,
      );
      return;
    }

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
    if (found.entity.kind !== kind) {
      throw new NotFoundError(
        "SAVED_VIEW_NOT_FOUND",
        `Saved view ${input.viewId} does not match kind ${kind}`,
      );
    }

    await SavedViewService.ensureSingleDefault(
      actorUserId,
      kind,
      found.entity.id,
      now,
      savedViewRepository,
    );

    if (found.entity.isDefault) {
      return;
    }
    const updated = SavedView.markDefault(found.entity, now);
    await savedViewRepository.save(updated, found.expectedVersion);
  });
}
