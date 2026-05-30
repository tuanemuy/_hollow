import type {
  CredentialSummary,
  EmailAddress,
  RawPassword,
  UserId,
} from "../valueObject";

/**
 * Abstraction over a user's authentication credentials (password / SSO).
 *
 * The domain treats credentials as opaque — hash algorithms, token
 * formats, and the choice between rotation / re-issue live entirely in
 * the adapter. The store participates in the UoW so credential mutations
 * commit atomically with the User aggregate change that motivated them
 * (e.g. `DeleteAccount` purging credentials alongside `User.markDeleted`).
 *
 * Error contract for adapter implementations:
 * - `registerPassword` on a user that already has a password →
 *   `BusinessRuleError('password_already_set')` (domain error code
 *   `IdentityErrorCode.PasswordAlreadySet`).
 * - `linkProvider` on a `(providerId, providerAccountId)` already linked
 *   → `BusinessRuleError('provider_already_linked')`.
 * - `changePassword` with mismatching current password →
 *   `AuthenticationError('invalid_credentials')` (application layer). It
 *   does not legacy-rehash the current password — the new hash overwrites
 *   the row regardless, so any lazy upgrade would be wasted work.
 * - `verifyPassword` / `verifyPasswordForUser` return `null` / `false`
 *   for any failure (wrong password, unknown user, soft-deleted user)
 *   — never throw — so callers cannot leak existence via timing or
 *   error-shape differences.
 */
export interface CredentialStore {
  // -- password credential ------------------------------------------------

  registerPassword(userId: UserId, raw: RawPassword): Promise<void>;

  /**
   * Sign-in entry point. Returns the owning `UserId` on success and
   * `null` for any failure (wrong password / unknown email / deleted
   * user). The single null return path is a deliberate enumeration
   * defence.
   */
  verifyPassword(email: EmailAddress, raw: string): Promise<UserId | null>;

  /**
   * Re-authentication for sensitive operations (e.g. RequestEmailChange).
   * Returns `false` for any failure, including a soft-deleted user.
   */
  verifyPasswordForUser(userId: UserId, raw: string): Promise<boolean>;

  changePassword(
    userId: UserId,
    currentRaw: string,
    newRaw: RawPassword,
  ): Promise<void>;

  /**
   * Force-reset path. Skips current-password verification — the caller
   * must have already authenticated the user out-of-band (e.g. via
   * `VerificationChallenge`).
   */
  resetPassword(userId: UserId, newRaw: RawPassword): Promise<void>;

  removePassword(userId: UserId): Promise<void>;

  hasPassword(userId: UserId): Promise<boolean>;

  // -- external-provider credential (SSO; MVP defines the shape) --------

  linkProvider(
    userId: UserId,
    providerId: string,
    providerAccountId: string,
  ): Promise<void>;

  unlinkProvider(userId: UserId, providerId: string): Promise<void>;

  resolveProvider(
    providerId: string,
    providerAccountId: string,
  ): Promise<UserId | null>;

  // -- cross-cutting ----------------------------------------------------

  listCredentials(userId: UserId): Promise<readonly CredentialSummary[]>;

  /**
   * Idempotent physical purge of every credential (password + linked
   * providers) owned by `userId`. Used exclusively by `DeleteAccount`
   * inside the same UoW as `User.markDeleted` so a logged-out, soft-
   * deleted user has no live sign-in surface.
   */
  purgeAll(userId: UserId): Promise<void>;
}
