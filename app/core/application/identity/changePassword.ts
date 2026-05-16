import { RawPassword, UserId } from "@/core/domain/identity/valueObject";
import type { UserId as UserIdDTO } from "../dto/identity";
import { AuthenticationError } from "../errors";
import type { ServiceArgs } from "../types";

export type ChangePasswordInput = {
  actorUserId: UserIdDTO;
  currentPassword: string;
  newPassword: string;
  revokeOtherSessions: boolean;
  currentSessionToken: string;
};

export async function changePassword({
  container,
  input,
}: ServiceArgs<ChangePasswordInput>): Promise<void> {
  const actor = UserId.create(input.actorUserId);
  const newPassword = RawPassword.create(input.newPassword);

  // Pre-verify so a mismatching current password fails with
  // `invalid_credentials` rather than an adapter-shaped error. The
  // CredentialStore contract only guarantees `null`/`throw` for
  // its own write path; explicit verification here gives us a
  // deterministic 401 surface.
  const verified = await container.unitOfWorkProvider.run(
    ({ credentialStore }) =>
      credentialStore.verifyPasswordForUser(actor, input.currentPassword),
  );
  if (!verified) {
    throw new AuthenticationError(
      "invalid_credentials",
      "Current password is incorrect",
    );
  }

  await container.unitOfWorkProvider.run(({ credentialStore }) =>
    credentialStore.changePassword(actor, input.currentPassword, newPassword),
  );

  if (input.revokeOtherSessions) {
    await container.sessionService.revokeAllForUser(
      actor,
      input.currentSessionToken,
    );
  }
}
