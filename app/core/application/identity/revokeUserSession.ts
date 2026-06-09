import { UserId } from "@/core/domain/identity/valueObject";
import type { ServiceArgs } from "../types";

export type RevokeUserSessionInput = {
  actorUserId: string;
  sessionId: string;
};

/**
 * Per-row sign-out for the P22 active-sessions list. Revocation is scoped
 * to the actor by `sessionId` + owner predicate — it never receives or
 * uses a session token (see `.issue/572/adr.md` ADR-001). Idempotent: an
 * unknown id, or one owned by another user, is a no-op. The token-based
 * `revokeSession` usecase is unrelated and stays as-is.
 */
export async function revokeUserSession({
  container,
  input,
}: ServiceArgs<RevokeUserSessionInput>): Promise<void> {
  const actor = UserId.create(input.actorUserId);
  await container.sessionService.revokeByIdForUser(actor, input.sessionId);
}
