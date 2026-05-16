import { User } from "@/core/domain/identity/entity";
import type { UserRepository } from "@/core/domain/identity/ports/userRepository";
import { ForbiddenError, NotFoundError } from "../errors";

/**
 * AdminSettings usecases all require `actor.role === 'admin'`. The check
 * is centralised here so each usecase can share the exact same error
 * shape (`ForbiddenError('FORBIDDEN_ADMIN_ONLY')`) and the same
 * "deleted / suspended actors are forbidden too" semantics.
 *
 * Returns the resolved actor on success so the caller can inspect any
 * additional state (e.g. status) without re-fetching.
 */
export async function assertAdmin(
  userRepository: UserRepository,
  actorUserId: string,
): Promise<User> {
  const versioned = await userRepository.findById(actorUserId);
  if (versioned === null) {
    throw new NotFoundError(
      "USER_NOT_FOUND",
      `Actor user not found: ${actorUserId}`,
    );
  }
  const actor = versioned.entity;
  if (User.isDeleted(actor) || !User.isLive(actor)) {
    throw new ForbiddenError(
      "FORBIDDEN_ADMIN_ONLY",
      "Admin-only operation requires an active admin actor",
    );
  }
  if (actor.role !== "admin") {
    throw new ForbiddenError(
      "FORBIDDEN_ADMIN_ONLY",
      "Admin-only operation requires an admin actor",
    );
  }
  return actor;
}
