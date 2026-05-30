import { DirectoryService } from "@/core/domain/directory/service";
import { User } from "@/core/domain/identity/entity";
import {
  EmailAddress,
  RawPassword,
  Username,
} from "@/core/domain/identity/valueObject";
import type { UserId as UserIdDTO } from "../dto/identity";
import { AuthenticationError } from "../errors";
import type { ServiceArgs } from "../types";
import { buildVerificationLink } from "./signUp";
import { assertSignUpAvailability } from "./signUpAvailability";

export type AdminSignUpInput = {
  username: string;
  email: string;
  password: string;
  displayName: string | null;
  setupToken: string;
  acceptTerms: true;
  locale?: string;
};

export type AdminSignUpOutput = {
  userId: UserIdDTO;
};

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export async function adminSignUp({
  container,
  input,
}: ServiceArgs<AdminSignUpInput>): Promise<AdminSignUpOutput> {
  if (!container.setupTokenVerifier.isEnabled()) {
    throw new AuthenticationError(
      "setup_token_disabled",
      "Admin setup token is not configured",
    );
  }
  if (!container.setupTokenVerifier.verify(input.setupToken)) {
    throw new AuthenticationError(
      "invalid_setup_token",
      "Invalid admin setup token",
    );
  }

  const now = container.clock.now();
  const id = container.idGenerator.next();

  const username = Username.create(input.username);
  const email = EmailAddress.create(input.email);
  const password = RawPassword.create(input.password);

  // `RegistrationPolicy` is intentionally bypassed for admin sign-up
  // (ADR 007): operators must be able to seed a successor admin after
  // closing open registration.
  const { userId, plainToken, emailForSend } =
    await container.unitOfWorkProvider.run(
      async ({
        userRepository,
        credentialStore,
        verificationChallenge,
        directoryRepository,
        collectEvents,
      }) => {
        await assertSignUpAvailability(username, email, userRepository);

        const { entity: user, eventDrafts } = User.create(
          {
            id,
            username,
            email,
            displayName: input.displayName,
            role: "admin",
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

  const link = buildVerificationLink(container.config.appUrl, plainToken);
  try {
    await container.emailSender.sendVerification(
      emailForSend,
      link,
      input.locale ?? "en",
    );
  } catch (error) {
    container.logger.error("identity.adminSignUp.email_send_failed", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return { userId: userId as unknown as UserIdDTO };
}
