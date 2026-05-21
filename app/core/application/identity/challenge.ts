import { BusinessRuleError } from "@/core/domain/error";
import { IdentityErrorCode } from "@/core/domain/identity/errorCode";
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
  | typeof IdentityErrorCode.TokenNotFound
  | typeof IdentityErrorCode.TokenExpired
  | typeof IdentityErrorCode.TokenConsumed
  | typeof IdentityErrorCode.TokenPurposeMismatch
> {
  switch (err) {
    case "not_found":
      return new BusinessRuleError(
        IdentityErrorCode.TokenNotFound,
        "Token not found",
      );
    case "expired":
      return new BusinessRuleError(
        IdentityErrorCode.TokenExpired,
        "Token has expired",
      );
    case "consumed":
      return new BusinessRuleError(
        IdentityErrorCode.TokenConsumed,
        "Token has already been consumed",
      );
    case "purpose_mismatch":
      return new BusinessRuleError(
        IdentityErrorCode.TokenPurposeMismatch,
        "Token was issued for a different purpose",
      );
  }
}
