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
    const target = await userRepository.findById(targetId);
    if (target === null) {
      throw new NotFoundError("user", `User not found: ${targetId}`);
    }
    const adminCount = await userRepository.countAdmins();
    IdentityService.assertNotLastAdmin(targetId, adminCount);
    // last-admin is evaluated before self-operation on purpose: for demote,
    // `last_admin_protected` is only reachable when actor === target, so
    // guarding self first would make it dead code. See .issue/315 ADR-003.
    IdentityService.assertNotSelf(actorId, targetId);
    const demoted = User.demoteToMember(target.entity, now);
    await userRepository.save(demoted, target.expectedVersion);
  });
}
