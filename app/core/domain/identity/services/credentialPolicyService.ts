import { BusinessRuleError } from "@/core/domain/error";
import { IdentityErrorCode } from "../errorCode";
import type { CredentialStore } from "../ports/credentialStore";
import type { UserId } from "../valueObject";

/**
 * Cross-aggregate invariants on the `CredentialStore` side. Mirrors
 * `IdentityService` but for the credential layer: keeps usecases from
 * leaving a live user without any way to sign in.
 *
 * MVP note: these are **not** invoked from any MVP usecase. They are
 * defined now so the future `RemovePassword` / `UnlinkProvider`
 * usecases (added when SSO / Passkey land) have a stable contract to
 * call into. Removing this file later would couple credential-policy
 * decisions to those new usecases, so the abstraction is paid for
 * up-front.
 */
export const CredentialPolicyService = {
  /**
   * Asserts that the user has at least one credential remaining.
   * Intended for "remove credential" flows: the caller checks the
   * post-condition (state *after* the removal) by reading the live
   * credential list inside the same UoW.
   *
   * @throws BusinessRuleError("no_credential_remaining") when the
   *   credential list is empty.
   */
  async assertHasAtLeastOne(
    userId: UserId,
    store: CredentialStore,
  ): Promise<void> {
    const credentials = await store.listCredentials(userId);
    if (credentials.length === 0) {
      throw new BusinessRuleError(
        IdentityErrorCode.NoCredentialRemaining,
        `User ${userId} has no remaining credentials`,
      );
    }
  },

  /**
   * Asserts that removing the password credential would not leave the
   * user without any sign-in method. The user must retain at least
   * one non-password credential.
   *
   * @throws BusinessRuleError("cannot_remove_last_credential") when
   *   the password is the user's only credential.
   */
  async assertCanRemovePassword(
    userId: UserId,
    store: CredentialStore,
  ): Promise<void> {
    const credentials = await store.listCredentials(userId);
    const remaining = credentials.filter((c) => c.kind !== "password");
    if (remaining.length === 0) {
      throw new BusinessRuleError(
        IdentityErrorCode.CannotRemoveLastCredential,
        `Cannot remove password: it is the last credential for user ${userId}`,
      );
    }
  },

  /**
   * Asserts that unlinking the given OAuth provider would not leave
   * the user without any sign-in method.
   *
   * @throws BusinessRuleError("cannot_remove_last_credential") when
   *   the provider link is the user's only credential.
   */
  async assertCanUnlinkProvider(
    userId: UserId,
    providerId: string,
    store: CredentialStore,
  ): Promise<void> {
    const credentials = await store.listCredentials(userId);
    const remaining = credentials.filter(
      (c) => !(c.kind === "oauth" && c.providerId === providerId),
    );
    if (remaining.length === 0) {
      throw new BusinessRuleError(
        IdentityErrorCode.CannotRemoveLastCredential,
        `Cannot unlink provider "${providerId}": it is the last credential for user ${userId}`,
      );
    }
  },
};
