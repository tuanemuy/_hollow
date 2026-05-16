import { BusinessRuleError } from "@/core/domain/error";
import { IdentityService } from "@/core/domain/identity/services/identityService";
import { EmailAddress, UserId } from "@/core/domain/identity/valueObject";
import type { UserId as UserIdDTO } from "../dto/identity";
import { AuthenticationError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type RequestEmailChangeInput = {
  actorUserId: UserIdDTO;
  newEmail: string;
  currentPassword: string;
  locale?: string;
};

const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000;

export async function requestEmailChange({
  container,
  input,
}: ServiceArgs<RequestEmailChangeInput>): Promise<void> {
  const actor = UserId.create(input.actorUserId);
  const newEmail = EmailAddress.create(input.newEmail);

  const result = await container.unitOfWorkProvider.run(
    async ({ userRepository, credentialStore, verificationChallenge }) => {
      const found = await userRepository.findById(actor);
      if (found === null) {
        throw new NotFoundError("user", `User not found: ${actor}`);
      }
      const user = found.entity;

      const verified = await credentialStore.verifyPasswordForUser(
        actor,
        input.currentPassword,
      );
      if (!verified) {
        throw new AuthenticationError(
          "invalid_credentials",
          "Current password is incorrect",
        );
      }

      if (user.email === newEmail) {
        // Same address — surface as `email_taken` to keep the
        // response shape uniform.
        throw new BusinessRuleError(
          "email_taken",
          "Email address is already in use",
        );
      }

      await IdentityService.assertEmailAvailable(newEmail, userRepository);

      const issued = await verificationChallenge.issue(
        actor,
        "email_change",
        EMAIL_CHANGE_TTL_MS,
        { newEmail },
      );

      return {
        oldEmail: user.email,
        newEmail,
        plainToken: issued.plainToken,
      };
    },
  );

  const link = buildEmailChangeLink(container.config.appUrl, result.plainToken);
  const locale = input.locale ?? "en";
  // Fire both notices best-effort; failures are logged. The change
  // itself is not committed until `VerifyEmailChange`, so a missed
  // notice is recoverable by the user.
  try {
    await container.emailSender.sendEmailChangeNotice(
      result.newEmail,
      link,
      locale,
    );
  } catch (error) {
    container.logger.error("identity.requestEmailChange.notice_send_failed", {
      userId: actor,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    await container.emailSender.sendEmailChangeWarning(
      result.oldEmail,
      result.newEmail,
      locale,
    );
  } catch (error) {
    container.logger.error("identity.requestEmailChange.warning_send_failed", {
      userId: actor,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function buildEmailChangeLink(appUrl: string, token: string): URL {
  const url = new URL("/account/verify-email-change", appUrl);
  url.searchParams.set("token", token);
  return url;
}
