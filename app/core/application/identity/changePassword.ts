import { RawPassword, UserId } from "@/core/domain/identity/valueObject";
import type { ServiceArgs } from "../types";

export type ChangePasswordInput = {
  actorUserId: string;
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

  // `changePassword` verifies the current password and writes the new hash
  // in a single UoW, throwing `AuthenticationError('invalid_credentials')`
  // on mismatch. A separate pre-verify here would double the scrypt work
  // (verify twice + a wasted legacy rehash); the adapter owns the 401.
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
