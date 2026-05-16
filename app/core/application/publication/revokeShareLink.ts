import type { UserId } from "@/core/domain/identity/valueObject";
import { ShareLink } from "@/core/domain/publication/entity";
import type { ShareLinkId } from "@/core/domain/publication/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type RevokeShareLinkInput = Readonly<{
  actorUserId: UserId;
  shareLinkId: ShareLinkId;
}>;

/**
 * Idempotently revoke a share link. Re-revoking an already-revoked
 * link is a no-op (no save, no event) — `revoke` raises a domain
 * invariant error if attempted, so we branch on `isRevoked` first.
 */
export async function revokeShareLink({
  container,
  input,
}: ServiceArgs<RevokeShareLinkInput>): Promise<void> {
  const now = container.clock.now();

  await container.unitOfWorkProvider.run(
    async ({ shareLinkRepository, collectEvents }) => {
      const found = await shareLinkRepository.findById(input.shareLinkId);
      if (found === null) {
        throw new NotFoundError(
          "SHARE_LINK_NOT_FOUND",
          `Share link not found: ${input.shareLinkId}`,
        );
      }
      if (found.entity.ownerId !== input.actorUserId) {
        throw new ForbiddenError(
          "SHARE_LINK_NOT_OWNED",
          `Share link ${input.shareLinkId} is not owned by actor ${input.actorUserId}`,
        );
      }
      if (ShareLink.isRevoked(found.entity)) return;

      const { entity: revoked, eventDrafts } = ShareLink.revoke(
        found.entity,
        now,
      );
      await shareLinkRepository.save(revoked, found.expectedVersion);
      collectEvents(eventDrafts);
    },
  );
}
