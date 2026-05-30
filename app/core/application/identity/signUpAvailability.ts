import { isBusinessRuleError } from "@/core/domain/error";
import { IdentityErrorCode } from "@/core/domain/identity/errorCode";
import type { UserRepository } from "@/core/domain/identity/ports/userRepository";
import { IdentityService } from "@/core/domain/identity/services/identityService";
import type {
  EmailAddress,
  Username,
} from "@/core/domain/identity/valueObject";
import { ValidationError } from "../errors";

const ALREADY_REGISTERED_MESSAGE = "すでに登録されています";

/**
 * Checks username / email availability for the sign-up usecases and converts
 * the `username_taken` / `email_taken` `BusinessRuleError`s into a field-bound
 * `ValidationError` so the form surfaces the conflict directly under the
 * offending field (see `.issue/201/adr.md` ADR-002). Any other
 * `BusinessRuleError` is re-thrown unchanged.
 *
 * The race-path `ConflictError("UNIQUE_VIOLATION")` from the DB UNIQUE
 * constraint is intentionally left untouched: the column is not identifiable
 * there, so it stays a generic conflict.
 */
export async function assertSignUpAvailability(
  username: Username,
  email: EmailAddress,
  userRepository: UserRepository,
): Promise<void> {
  try {
    await IdentityService.assertUsernameAvailable(username, userRepository);
  } catch (error) {
    if (
      isBusinessRuleError(error) &&
      error.code === IdentityErrorCode.UsernameTaken
    ) {
      throw new ValidationError({
        username: [ALREADY_REGISTERED_MESSAGE],
      });
    }
    throw error;
  }

  try {
    await IdentityService.assertEmailAvailable(email, userRepository);
  } catch (error) {
    if (
      isBusinessRuleError(error) &&
      error.code === IdentityErrorCode.EmailTaken
    ) {
      throw new ValidationError({
        email: [ALREADY_REGISTERED_MESSAGE],
      });
    }
    throw error;
  }
}
