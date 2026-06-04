import { User } from "@/core/domain/identity/entity";
import { IdentityService } from "@/core/domain/identity/services/identityService";
import { UserId, Username } from "@/core/domain/identity/valueObject";
import type { UserDTO } from "../dto/identity";
import { toUserDTO } from "../dto/identity";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type ChangeUsernameInput = {
  actorUserId: string;
  newUsername: string;
};

export type ChangeUsernameOutput = {
  user: UserDTO;
};

export async function changeUsername({
  container,
  input,
}: ServiceArgs<ChangeUsernameInput>): Promise<ChangeUsernameOutput> {
  const now = container.clock.now();
  const actor = UserId.create(input.actorUserId);
  const newUsername = Username.create(input.newUsername);

  const updated = await container.unitOfWorkProvider.run(
    async ({ userRepository }) => {
      const found = await userRepository.findById(actor);
      if (found === null) {
        throw new NotFoundError("user", `User not found: ${actor}`);
      }
      // `changeUsername` enforces the 30-day cooldown and short-circuits
      // when the supplied value equals the current one.
      const renamed = User.changeUsername(found.entity, newUsername, now);
      if (renamed === found.entity) {
        return renamed;
      }
      await IdentityService.assertUsernameAvailable(
        newUsername,
        userRepository,
      );
      await userRepository.save(renamed, found.expectedVersion);
      return renamed;
    },
  );

  return { user: toUserDTO(updated) };
}
