import { EmailAddress } from "@/core/domain/identity/valueObject";
import type { Instant } from "../dto/common";
import { toInstant } from "../dto/common";
import type { SessionToken } from "../dto/identity";
import { AuthenticationError } from "../errors";
import type { ServiceArgs } from "../types";

export type LogInInput = {
  email: string;
  password: string;
  userAgent: string | null;
  ipAddress: string | null;
};

export type LogInOutput = {
  userId: string;
  sessionToken: SessionToken;
  expiresAt: Instant;
};

export async function logIn({
  container,
  input,
}: ServiceArgs<LogInInput>): Promise<LogInOutput> {
  let email: EmailAddress;
  try {
    email = EmailAddress.create(input.email);
  } catch {
    // Email shape failure is collapsed into the same single-failure
    // path as wrong credentials to keep the enumeration defence.
    throw new AuthenticationError(
      "invalid_credentials",
      "Invalid email or password",
    );
  }

  const verified = await container.unitOfWorkProvider.run(
    ({ credentialStore }) =>
      credentialStore.verifyPassword(email, input.password),
  );
  if (verified === null) {
    throw new AuthenticationError(
      "invalid_credentials",
      "Invalid email or password",
    );
  }
  const { userId, needsRehash } = verified;

  const status = await container.unitOfWorkProvider.run(
    async ({ userRepository }) => {
      const found = await userRepository.findById(userId);
      return found === null ? null : found.entity.status;
    },
  );
  if (status === null) {
    // Credential resolved a user that the user repo can't find; treat
    // as `account_unavailable` (the credential row is orphaned).
    throw new AuthenticationError(
      "account_unavailable",
      "Account is no longer available",
    );
  }
  if (status === "pending") {
    throw new AuthenticationError(
      "unverified",
      "Email address is not verified",
    );
  }
  if (status === "suspended" || status === "deleted") {
    throw new AuthenticationError(
      "account_unavailable",
      "Account is no longer available",
    );
  }

  // Status confirmed OK: now (and only now) upgrade a legacy hash. Done
  // before issuing the session so a rehash failure fails the whole login
  // cleanly rather than leaving a session issued behind a 500 (Issue #456).
  if (needsRehash) {
    await container.unitOfWorkProvider.run(({ credentialStore }) =>
      credentialStore.rehashLegacyPassword(userId, input.password),
    );
  }

  const issued = await container.sessionService.issue(userId, {
    userAgent: input.userAgent,
    ipAddress: input.ipAddress,
  });

  return {
    userId,
    sessionToken: issued.token,
    expiresAt: toInstant(issued.expiresAt),
  };
}
