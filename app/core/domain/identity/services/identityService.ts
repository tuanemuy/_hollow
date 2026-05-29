import { BusinessRuleError } from "@/core/domain/error";
import { IdentityErrorCode } from "../errorCode";
import type { UserRepository } from "../ports/userRepository";
import type { EmailAddress, UserId, Username } from "../valueObject";

/**
 * Cross-aggregate invariants for the Identity domain. Rules that span
 * more than the User aggregate (uniqueness, "at least one admin"
 * protection) live here rather than on `User`, because the aggregate
 * cannot self-enforce them without leaking repository concerns.
 *
 * Usecases call these helpers explicitly at the relevant transition
 * points; nothing on the User aggregate calls them implicitly.
 */
export const IdentityService = {
  /**
   * Prevents the very last admin from being demoted or deleted.
   *
   * `adminCount` is the value of `UserRepository.countAdmins()` which
   * **includes suspended admins** (see the domain spec note). For MVP
   * scenarios this is sufficient; once an admin self-suspend path is
   * added, an active-only counter will need to layer on top.
   *
   * @throws BusinessRuleError("last_admin_protected") when the target
   *   is the only remaining admin (`adminCount <= 1`).
   */
  assertNotLastAdmin(_targetUserId: UserId, adminCount: number): void {
    if (adminCount <= 1) {
      throw new BusinessRuleError(
        IdentityErrorCode.LastAdminProtected,
        "Cannot demote or delete the last remaining admin",
      );
    }
  },

  /**
   * Prevents an admin from running a moderation action (demote /
   * suspend) against their own account. The actor already holds the
   * admin authority for the action (checked separately at the usecase);
   * what is rejected here is the actor and target being the same
   * account — a rule about valid actor/target relationships, not an
   * authorization failure.
   *
   * @throws BusinessRuleError("self_operation_not_allowed") when
   *   `actorId` equals `targetUserId`.
   */
  assertNotSelf(actorId: UserId, targetUserId: UserId): void {
    if (actorId === targetUserId) {
      throw new BusinessRuleError(
        IdentityErrorCode.SelfOperationNotAllowed,
        "Admins cannot demote or suspend their own account",
      );
    }
  },

  /**
   * Uniqueness check at the transition point. The adapter's UNIQUE
   * constraint is the ultimate source of truth, but checking here lets
   * usecases surface a domain-shaped error before the write attempt.
   *
   * The repository's `findByUsername` returns rows regardless of
   * `status === 'deleted'`, which is what makes username reservations
   * "permanent" across user deletion (deleted usernames cannot be
   * recycled).
   *
   * @throws BusinessRuleError("username_taken") when the username is in
   *   use by any user, deleted or not.
   */
  async assertUsernameAvailable(
    username: Username,
    repo: UserRepository,
  ): Promise<void> {
    const existing = await repo.findByUsername(username);
    if (existing !== null) {
      throw new BusinessRuleError(
        IdentityErrorCode.UsernameTaken,
        `Username "${username}" is already taken`,
      );
    }
  },

  /**
   * Email-address uniqueness, with the same "deleted rows still
   * collide" semantics as `assertUsernameAvailable`.
   *
   * @throws BusinessRuleError("email_taken") when the email is in use.
   */
  async assertEmailAvailable(
    email: EmailAddress,
    repo: UserRepository,
  ): Promise<void> {
    const existing = await repo.findByEmail(email);
    if (existing !== null) {
      throw new BusinessRuleError(
        IdentityErrorCode.EmailTaken,
        "Email address is already in use",
      );
    }
  },
};
