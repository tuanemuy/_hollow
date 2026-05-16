import { EmailAddress } from "@/core/domain/identity/valueObject";
import type { ServiceArgs } from "../types";
import { buildVerificationLink } from "./signUp";

export type ResendVerificationInput = {
  email: string;
  locale?: string;
};

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Re-issue an email-verification token for a pending user. The response
 * is intentionally indistinguishable between "no such email", "user is
 * not pending", and "mail re-sent" so the endpoint cannot be used as
 * an enumeration oracle (spec note).
 */
export async function resendVerification({
  container,
  input,
}: ServiceArgs<ResendVerificationInput>): Promise<void> {
  let email: EmailAddress;
  try {
    email = EmailAddress.create(input.email);
  } catch {
    // Malformed email is silently ignored to preserve the
    // "no enumeration signal" contract.
    return;
  }

  const issued = await container.unitOfWorkProvider.run(
    async ({ userRepository, verificationChallenge }) => {
      const user = await userRepository.findByEmail(email);
      if (user === null) return null;
      if (user.status !== "pending") return null;
      const result = await verificationChallenge.issue(
        user.id,
        "email_verification",
        EMAIL_VERIFICATION_TTL_MS,
      );
      return { userEmail: user.email, plainToken: result.plainToken };
    },
  );

  if (issued === null) return;
  const link = buildVerificationLink(
    container.config.appUrl,
    issued.plainToken,
  );
  try {
    await container.emailSender.sendVerification(
      issued.userEmail,
      link,
      input.locale ?? "en",
    );
  } catch (error) {
    container.logger.error("identity.resendVerification.email_send_failed", {
      email: issued.userEmail,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
