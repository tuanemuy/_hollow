import { User } from "@/core/domain/identity/entity";
import type {
  IssuedSession,
  SessionService,
} from "@/core/domain/identity/ports/sessionService";
import { isChallengeError } from "@/core/domain/identity/ports/verificationChallenge";
import {
  UserId,
  type UserId as UserIdDomain,
} from "@/core/domain/identity/valueObject";
import type { RequestContainer } from "../di/types";
import type { Instant } from "../dto/common";
import { toInstant } from "../dto/common";
import type { SessionToken, UserId as UserIdDTO } from "../dto/identity";
import { NotFoundError, SystemError, SystemErrorCode } from "../errors";
import type { Logger } from "../ports/logger";
import type { ServiceArgs } from "../types";
import { challengeErrorToBusinessRule } from "./challenge";

export type VerifyEmailInput = {
  token: string;
  /** Optional session metadata, forwarded to `SessionService.issue`. */
  userAgent?: string | null;
  ipAddress?: string | null;
};

export type VerifyEmailOutput = {
  userId: UserIdDTO;
  sessionToken: SessionToken;
  expiresAt: Instant;
};

export async function verifyEmail({
  container,
  input,
}: ServiceArgs<VerifyEmailInput>): Promise<VerifyEmailOutput> {
  const now = container.clock.now();

  const verifiedUserId = await container.unitOfWorkProvider.run(
    async ({ userRepository, verificationChallenge }) => {
      const consumed = await verificationChallenge.consume(
        input.token,
        "email_verification",
      );
      if (isChallengeError(consumed)) {
        throw challengeErrorToBusinessRule(consumed);
      }
      const userId = UserId.create(consumed.userId);
      const found = await userRepository.findById(userId);
      if (found === null) {
        throw new NotFoundError("user", `User not found: ${userId}`);
      }
      // `User.activate` throws `BusinessRuleError('user_not_pending')`
      // if the user is already active / suspended / deleted. The throw
      // rolls back the UoW including the token `consume`, so the user
      // can retry with the same flow once they are back to `pending`
      // (which they won't be — this is intentional: re-verification
      // for an already-active user is meaningless, and the same token
      // cannot be reused after consume).
      const activated = User.activate(found.entity, now);
      await userRepository.save(activated, found.expectedVersion);
      return activated.id;
    },
  );

  // SessionService runs outside the UoW. Failure here leaves the user
  // active but without an auto-issued session — per spec, surface a
  // SystemError so the client falls back to manual LogIn.
  const issued = await issueSessionOrFail(container, verifiedUserId, input);

  return {
    userId: verifiedUserId as unknown as UserIdDTO,
    sessionToken: issued.token,
    expiresAt: toInstant(issued.expiresAt),
  };
}

async function issueSessionOrFail(
  container: RequestContainer,
  userId: UserIdDomain,
  meta: { userAgent?: string | null; ipAddress?: string | null },
): Promise<IssuedSession> {
  try {
    return await (container.sessionService as SessionService).issue(userId, {
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
    });
  } catch (error) {
    (container.logger as Logger).error(
      "identity.verifyEmail.session_issue_failed",
      {
        userId,
        error: error instanceof Error ? error.message : String(error),
      },
    );
    throw new SystemError(
      SystemErrorCode.ExternalApiError,
      "Failed to issue session after email verification",
    );
  }
}
