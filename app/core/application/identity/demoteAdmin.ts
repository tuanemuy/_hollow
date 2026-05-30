import { User } from "@/core/domain/identity/entity";
import { IdentityService } from "@/core/domain/identity/services/identityService";
import { UserId } from "@/core/domain/identity/valueObject";
import type { UserId as UserIdDTO } from "../dto/identity";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type DemoteAdminInput = {
  actorAdminId: UserIdDTO;
  targetUserId: UserIdDTO;
};

export async function demoteAdmin({
  container,
  input,
}: ServiceArgs<DemoteAdminInput>): Promise<void> {
  const now = container.clock.now();
  const actorId = UserId.create(input.actorAdminId);
  const targetId = UserId.create(input.targetUserId);

  await container.unitOfWorkProvider.run(async ({ userRepository }) => {
    const actor = await userRepository.findById(actorId);
    if (actor === null || actor.entity.role !== "admin") {
      throw new ForbiddenError(
        "not_admin",
        "Actor is not authorised to demote admins",
      );
    }
    // No last-admin check: demoting the last admin requires self-demote,
    // which this guard already blocks (see .issue/315 ADR-003).
    IdentityService.assertNotSelf(actorId, targetId);
    const target = await userRepository.findById(targetId);
    if (target === null) {
      throw new NotFoundError("user", `User not found: ${targetId}`);
    }
    const demoted = User.demoteToMember(target.entity, now);
    await userRepository.save(demoted, target.expectedVersion);
  });
}
