import { BusinessRuleError } from "@/core/domain/error";
import { ShareLink } from "@/core/domain/publication/entity";
import { PublicationErrorCode } from "@/core/domain/publication/errorCode";
import {
  type ShareLinkId,
  ShareLinkPassword,
} from "@/core/domain/publication/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type SetShareLinkPasswordInput = Readonly<{
  actorUserId: string;
  shareLinkId: string;
  newPassword: string | null;
}>;

/**
 * Set or clear the password on an active share link. Clearing is the
 * `newPassword === null` path; setting validates the raw password
 * through `ShareLinkPassword.create` (8..128) before hashing.
 *
 * Revoked links are rejected with `BusinessRuleError('share_link_revoked')`
 * before any hashing work runs, so we never spend CPU on a credential
 * that cannot be applied.
 */
export async function setShareLinkPassword({
  container,
  input,
}: ServiceArgs<SetShareLinkPasswordInput>): Promise<void> {
  const now = container.clock.now();

  const newHash =
    input.newPassword === null
      ? null
      : await container.passwordHasher.hash(
          ShareLinkPassword.create(input.newPassword),
        );

  await container.unitOfWorkProvider.run(async ({ shareLinkRepository }) => {
    const found = await shareLinkRepository.findById(
      input.shareLinkId as ShareLinkId,
    );
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
    if (ShareLink.isRevoked(found.entity)) {
      throw new BusinessRuleError(
        PublicationErrorCode.ShareLinkRevoked,
        `Share link ${input.shareLinkId} is revoked; password cannot be set`,
      );
    }

    const updated = ShareLink.setPassword(found.entity, newHash, now);
    await shareLinkRepository.save(updated, found.expectedVersion);
  });
}
