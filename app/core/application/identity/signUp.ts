import { DirectoryService } from "@/core/domain/directory/service";
import { BusinessRuleError } from "@/core/domain/error";
import { User } from "@/core/domain/identity/entity";
import { IdentityService } from "@/core/domain/identity/services/identityService";
import {
  EmailAddress,
  RawPassword,
  Username,
} from "@/core/domain/identity/valueObject";
import type { UserId as UserIdDTO } from "../dto/identity";
import type { ServiceArgs } from "../types";

export type SignUpInput = {
  username: string;
  email: string;
  password: string;
  displayName: string | null;
  /**
   * Validated at the transport boundary (`acceptTerms: z.literal(true)`).
   * The literal `true` is preserved so the usecase signature documents
   * the precondition statically.
   */
  acceptTerms: true;
  /** BCP 47 tag forwarded to `EmailSender`. Defaults to `"en"`. */
  locale?: string;
};

export type SignUpOutput = {
  userId: UserIdDTO;
};

const REGISTRATION_CLOSED_CODE = "registration_closed";
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export async function signUp({
  container,
  input,
}: ServiceArgs<SignUpInput>): Promise<SignUpOutput> {
  const now = container.clock.now();
  const id = container.idGenerator.next();

  const username = Username.create(input.username);
  const email = EmailAddress.create(input.email);
  const password = RawPassword.create(input.password);

  const { userId, plainToken, emailForSend } =
    await container.unitOfWorkProvider.run(
      async ({
        userRepository,
        credentialStore,
        verificationChallenge,
        directoryRepository,
        instanceSettingsRepository,
        collectEvents,
      }) => {
        const settings = await instanceSettingsRepository.get();
        if (!settings.entity.registration.open) {
          throw new BusinessRuleError(
            REGISTRATION_CLOSED_CODE,
            "Registration is currently closed",
          );
        }

        await IdentityService.assertUsernameAvailable(username, userRepository);
        await IdentityService.assertEmailAvailable(email, userRepository);

        const { entity: user, eventDrafts } = User.create(
          {
            id,
            username,
            email,
            displayName: input.displayName,
            role: "member",
          },
          now,
        );
        await userRepository.insert(user);
        await credentialStore.registerPassword(user.id, password);
        await DirectoryService.ensureRoot(
          user.id,
          now,
          container.idGenerator,
          directoryRepository,
        );
        const issued = await verificationChallenge.issue(
          user.id,
          "email_verification",
          EMAIL_VERIFICATION_TTL_MS,
        );
        collectEvents(eventDrafts);
        return {
          userId: user.id,
          plainToken: issued.plainToken,
          emailForSend: user.email,
        };
      },
    );

  // Best-effort post-commit notification. Failures are logged but do
  // not roll back the user/credential which have been persisted; the
  // user can `ResendVerification` to retry the mail.
  const link = buildVerificationLink(container.config.appUrl, plainToken);
  try {
    await container.emailSender.sendVerification(
      emailForSend,
      link,
      input.locale ?? "en",
    );
  } catch (error) {
    container.logger.error("identity.signUp.email_send_failed", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return { userId: userId as unknown as UserIdDTO };
}

export function buildVerificationLink(appUrl: string, token: string): URL {
  const url = new URL("/verify-email", appUrl);
  url.searchParams.set("token", token);
  return url;
}
