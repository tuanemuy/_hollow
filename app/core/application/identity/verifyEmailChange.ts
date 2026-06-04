import { User } from "@/core/domain/identity/entity";
import { isChallengeError } from "@/core/domain/identity/ports/verificationChallenge";
import { IdentityService } from "@/core/domain/identity/services/identityService";
import { EmailAddress, UserId } from "@/core/domain/identity/valueObject";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import { challengeErrorToBusinessRule } from "./challenge";

export type VerifyEmailChangeInput = {
  token: string;
};

export type VerifyEmailChangeOutput = {
  userId: string;
};

export async function verifyEmailChange({
  container,
  input,
}: ServiceArgs<VerifyEmailChangeInput>): Promise<VerifyEmailChangeOutput> {
  const now = container.clock.now();

  const verifiedUserId = await container.unitOfWorkProvider.run(
    async ({ userRepository, verificationChallenge }) => {
      const consumed = await verificationChallenge.consume(
        input.token,
        "email_change",
      );
      if (isChallengeError(consumed)) {
        throw challengeErrorToBusinessRule(consumed);
      }
      const userId = UserId.create(consumed.userId);
      const rawNewEmail = consumed.payload.newEmail;
      if (typeof rawNewEmail !== "string") {
        // Defensive: the challenge payload should carry `newEmail`
        // (set by `RequestEmailChange`). If the persistence layer
        // returned an unexpected shape, surface as `token_not_found`
        // so the user re-requests a new token.
        throw challengeErrorToBusinessRule("not_found");
      }
      const newEmail = EmailAddress.create(rawNewEmail);

      const found = await userRepository.findById(userId);
      if (found === null) {
        throw new NotFoundError("user", `User not found: ${userId}`);
      }

      // Re-check availability — another user may have claimed the
      // address between issue and consume.
      await IdentityService.assertEmailAvailable(newEmail, userRepository);

      const updated = User.changeEmail(found.entity, newEmail, now);
      await userRepository.save(updated, found.expectedVersion);
      return updated.id;
    },
  );

  return { userId: verifiedUserId };
}
