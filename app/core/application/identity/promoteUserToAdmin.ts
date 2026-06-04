import { User } from "@/core/domain/identity/entity";
import { UserId } from "@/core/domain/identity/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type PromoteUserToAdminInput = {
  actorAdminId: string;
  targetUserId: string;
};

export async function promoteUserToAdmin({
  container,
  input,
}: ServiceArgs<PromoteUserToAdminInput>): Promise<void> {
  const now = container.clock.now();
  const actorId = UserId.create(input.actorAdminId);
  const targetId = UserId.create(input.targetUserId);

  await container.unitOfWorkProvider.run(async ({ userRepository }) => {
    const actor = await userRepository.findById(actorId);
    if (actor === null || actor.entity.role !== "admin") {
      throw new ForbiddenError(
        "not_admin",
        "Actor is not authorised to promote users",
      );
    }
    const target = await userRepository.findById(targetId);
    if (target === null) {
      throw new NotFoundError("user", `User not found: ${targetId}`);
    }
    const promoted = User.promoteToAdmin(target.entity, now);
    await userRepository.save(promoted, target.expectedVersion);
  });
}
