import { EmailAddress } from "@/core/domain/identity/valueObject";
import type { ServiceArgs } from "../types";

export type RequestPasswordResetInput = {
  email: string;
  locale?: string;
};

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Issue a password-reset token and email the link. Like
 * `ResendVerification`, the response is intentionally identical
 * whether the email maps to a known user or not (enumeration defence).
 */
export async function requestPasswordReset({
  container,
  input,
}: ServiceArgs<RequestPasswordResetInput>): Promise<void> {
  let email: EmailAddress;
  try {
    email = EmailAddress.create(input.email);
  } catch {
    return;
  }

  const issued = await container.unitOfWorkProvider.run(
    async ({ userRepository, verificationChallenge }) => {
      const user = await userRepository.findByEmail(email);
      if (user === null) return null;
      // Don't reset for soft-deleted users — they cannot sign back in
      // anyway and reissuing a token here would create a confusing UX.
      if (user.status === "deleted") return null;
      const result = await verificationChallenge.issue(
        user.id,
        "password_reset",
        PASSWORD_RESET_TTL_MS,
      );
      return { userEmail: user.email, plainToken: result.plainToken };
    },
  );

  if (issued === null) return;
  const link = buildPasswordResetLink(
    container.config.appUrl,
    issued.plainToken,
  );
  try {
    await container.emailSender.sendPasswordReset(
      issued.userEmail,
      link,
      input.locale ?? "en",
    );
  } catch (error) {
    container.logger.error("identity.requestPasswordReset.email_send_failed", {
      email: issued.userEmail,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function buildPasswordResetLink(appUrl: string, token: string): URL {
  const url = new URL("/auth/reset-password", appUrl);
  url.searchParams.set("token", token);
  return url;
}
