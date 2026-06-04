import { isChallengeError } from "@/core/domain/identity/ports/verificationChallenge";
import { RawPassword, UserId } from "@/core/domain/identity/valueObject";
import type { Instant } from "../dto/common";
import { toInstant } from "../dto/common";
import type { SessionToken } from "../dto/identity";
import type { ServiceArgs } from "../types";
import { challengeErrorToBusinessRule } from "./challenge";

export type ResetPasswordInput = {
  token: string;
  newPassword: string;
  userAgent?: string | null;
  ipAddress?: string | null;
};

export type ResetPasswordOutput = {
  userId: string;
  sessionToken: SessionToken;
  expiresAt: Instant;
};

export async function resetPassword({
  container,
  input,
}: ServiceArgs<ResetPasswordInput>): Promise<ResetPasswordOutput> {
  const newPassword = RawPassword.create(input.newPassword);

  const resetUserId = await container.unitOfWorkProvider.run(
    async ({ verificationChallenge, credentialStore }) => {
      const consumed = await verificationChallenge.consume(
        input.token,
        "password_reset",
      );
      if (isChallengeError(consumed)) {
        throw challengeErrorToBusinessRule(consumed);
      }
      const userId = UserId.create(consumed.userId);
      await credentialStore.resetPassword(userId, newPassword);
      return userId;
    },
  );

  // Revoke any sessions from the (presumed compromised) prior password
  // before issuing the new one.
  await container.sessionService.revokeAllForUser(resetUserId);
  const issued = await container.sessionService.issue(resetUserId, {
    userAgent: input.userAgent ?? null,
    ipAddress: input.ipAddress ?? null,
  });

  return {
    userId: resetUserId,
    sessionToken: issued.token,
    expiresAt: toInstant(issued.expiresAt),
  };
}
