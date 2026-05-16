import type { ChallengePurpose, UserId } from "../valueObject";

/**
 * Failure modes returned (not thrown) from `VerificationChallenge.consume`.
 *
 * - `not_found` and `consumed` are intentionally indistinguishable from
 *   the caller's standpoint: when `issue` invalidates prior tokens for
 *   the same `(userId, purpose)`, an adapter may either hard-delete the
 *   old row (→ `not_found` on later use) or flag it consumed
 *   (→ `consumed`). Callers must accept either, per the domain spec.
 * - `expired` means the token's TTL has lapsed.
 * - `purpose_mismatch` means the token exists but was issued for a
 *   different `purpose` than the caller expected (defence against using
 *   an email-verification link as a password-reset proof, etc.).
 */
export type ChallengeError =
  | "not_found"
  | "expired"
  | "consumed"
  | "purpose_mismatch";

export type IssuedChallenge = Readonly<{
  plainToken: string;
}>;

export type ConsumedChallenge = Readonly<{
  userId: UserId;
  payload: Readonly<Record<string, string>>;
}>;

/**
 * Duration in milliseconds. The domain expresses TTLs as raw ms so
 * `Clock.now()` arithmetic stays trivial; richer duration types are an
 * adapter concern.
 */
export type DurationMs = number;

/**
 * Single-use token issuance / consumption for email verification,
 * password reset, and email-change confirmation. All three flows share
 * one port; `purpose` discriminates them and is re-checked at consume
 * time to prevent cross-purpose token reuse.
 *
 * - `issue` invalidates any prior un-consumed tokens for the same
 *   `(userId, purpose)` pair before minting a new one. Implementation
 *   may be hard-delete or `consumed_at` flag (see `ChallengeError`
 *   note above).
 * - `payload` carries purpose-specific metadata. For `email_change`,
 *   for example, it is expected to include `newEmail`. Schema is open
 *   so future purposes can extend without changing the port.
 * - Both `issue` and `consume` participate in the UoW so they can be
 *   rolled back atomically with the User mutations that motivated them.
 */
export interface VerificationChallenge {
  issue(
    userId: UserId,
    purpose: ChallengePurpose,
    ttl: DurationMs,
    payload?: Readonly<Record<string, string>>,
  ): Promise<IssuedChallenge>;

  consume(
    token: string,
    expectedPurpose: ChallengePurpose,
  ): Promise<ConsumedChallenge | ChallengeError>;
}

const CHALLENGE_ERROR_VALUES: ReadonlySet<ChallengeError> =
  new Set<ChallengeError>([
    "not_found",
    "expired",
    "consumed",
    "purpose_mismatch",
  ]);

export function isChallengeError(
  value: ConsumedChallenge | ChallengeError,
): value is ChallengeError {
  return (
    typeof value === "string" &&
    CHALLENGE_ERROR_VALUES.has(value as ChallengeError)
  );
}
