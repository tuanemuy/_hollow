import { BusinessRuleError } from "@/core/domain/error";
import type { ChallengeError } from "@/core/domain/identity/ports/verificationChallenge";

/**
 * Translate a `VerificationChallenge.consume` failure (returned, not
 * thrown) into the `BusinessRuleError` the spec defines for the four
 * surfaced codes. Centralised so every challenge-consuming usecase
 * (`VerifyEmail`, `ResetPassword`, `VerifyEmailChange`) maps the same
 * value uniformly.
 */
export function challengeErrorToBusinessRule(
  err: ChallengeError,
): BusinessRuleError<
  | "token_not_found"
  | "token_expired"
  | "token_consumed"
  | "token_purpose_mismatch"
> {
  switch (err) {
    case "not_found":
      return new BusinessRuleError("token_not_found", "Token not found");
    case "expired":
      return new BusinessRuleError("token_expired", "Token has expired");
    case "consumed":
      return new BusinessRuleError(
        "token_consumed",
        "Token has already been consumed",
      );
    case "purpose_mismatch":
      return new BusinessRuleError(
        "token_purpose_mismatch",
        "Token was issued for a different purpose",
      );
  }
}
