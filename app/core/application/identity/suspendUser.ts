import { User } from "@/core/domain/identity/entity";
import { UserId } from "@/core/domain/identity/valueObject";
import type { UserId as UserIdDTO } from "../dto/identity";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type SuspendUserInput = {
  actorAdminId: UserIdDTO;
  targetUserId: UserIdDTO;
};

export async function suspendUser({
  container,
  input,
}: ServiceArgs<SuspendUserInput>): Promise<void> {
  const now = container.clock.now();
  const actorId = UserId.create(input.actorAdminId);
  const targetId = UserId.create(input.targetUserId);

  await container.unitOfWorkProvider.run(
    async ({ userRepository, collectEvents }) => {
      const actor = await userRepository.findById(actorId);
      if (actor === null || actor.entity.role !== "admin") {
        throw new ForbiddenError(
          "not_admin",
          "Actor is not authorised to suspend users",
        );
      }
      const target = await userRepository.findById(targetId);
      if (target === null) {
        throw new NotFoundError("user", `User not found: ${targetId}`);
      }
      const { entity: suspended, eventDrafts } = User.suspend(
        target.entity,
        now,
      );
      await userRepository.save(suspended, target.expectedVersion);
      collectEvents(eventDrafts);
    },
  );

  // Force the suspended user out of every active session.
  await container.sessionService.revokeAllForUser(targetId);
}
