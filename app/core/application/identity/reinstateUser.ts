import { User } from "@/core/domain/identity/entity";
import { UserId } from "@/core/domain/identity/valueObject";
import type { UserId as UserIdDTO } from "../dto/identity";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type ReinstateUserInput = {
  actorAdminId: UserIdDTO;
  targetUserId: UserIdDTO;
};

export async function reinstateUser({
  container,
  input,
}: ServiceArgs<ReinstateUserInput>): Promise<void> {
  const now = container.clock.now();
  const actorId = UserId.create(input.actorAdminId);
  const targetId = UserId.create(input.targetUserId);

  await container.unitOfWorkProvider.run(
    async ({ userRepository, collectEvents }) => {
      const actor = await userRepository.findById(actorId);
      if (actor === null || actor.entity.role !== "admin") {
        throw new ForbiddenError(
          "not_admin",
          "Actor is not authorised to reinstate users",
        );
      }
      const target = await userRepository.findById(targetId);
      if (target === null) {
        throw new NotFoundError("user", `User not found: ${targetId}`);
      }
      const { entity: reinstated, eventDrafts } = User.reinstate(
        target.entity,
        now,
      );
      await userRepository.save(reinstated, target.expectedVersion);
      collectEvents(eventDrafts);
    },
  );
}
