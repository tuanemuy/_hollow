import { BusinessRuleError } from "@/core/domain/error";
import type { NoteId } from "@/core/domain/note/valueObject";
import { ShareLink } from "@/core/domain/publication/entity";
import { PublicationErrorCode } from "@/core/domain/publication/errorCode";
import { PublicationService } from "@/core/domain/publication/service";
import { ShareLinkTokenHash } from "@/core/domain/publication/valueObject";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import { hashShareLinkToken } from "./token";

export type ResolveShareLinkInput = Readonly<{
  token: string;
  password: string | null;
  viewerIpHash: string | null;
}>;

export type ResolveShareLinkOutput = Readonly<{
  noteId: NoteId;
  ownerUsername: string;
}>;

/**
 * Public-side share-link resolution. Verifies the link is open and the
 * password (if any) is valid, then returns the underlying note id +
 * owner username so the caller can render the page.
 *
 * Side-effects:
 * - Successful resolution records the access timestamp and resets the
 *   failure counter.
 * - Failure increments the failure counter (and arms the lockout
 *   threshold). The mutated link is persisted regardless so the
 *   counter / lockout state survives.
 *
 * `viewerIpHash` is accepted for parity with the spec but is not
 * currently persisted — there is no field on the aggregate for it. It
 * remains in the input shape for forward-compat; an abuse-prevention
 * sink can pick it up later without changing the call site.
 */
export async function resolveShareLink({
  container,
  input,
}: ServiceArgs<ResolveShareLinkInput>): Promise<ResolveShareLinkOutput> {
  const now = container.clock.now();
  const tokenHashRaw = await hashShareLinkToken(input.token);
  const tokenHash = ShareLinkTokenHash.create(tokenHashRaw);

  // `viewerIpHash` is intentionally not persisted today (no aggregate
  // field). Reading it here makes the unused-parameter analysis pass
  // while preserving the input shape for forward compatibility with a
  // future abuse-prevention sink.
  void input.viewerIpHash;

  const { note, ownerUsername } = await container.unitOfWorkProvider.run(
    async ({ shareLinkRepository, noteRepository, userRepository }) => {
      const lookup = await shareLinkRepository.findByTokenHash(tokenHash);
      if (lookup === null) {
        throw new NotFoundError("SHARE_LINK_NOT_FOUND", "Share link not found");
      }

      if (ShareLink.isRevoked(lookup)) {
        throw new BusinessRuleError(
          PublicationErrorCode.ShareLinkRevoked,
          `Share link ${lookup.id} is revoked`,
        );
      }

      if (
        lookup.lockedUntil !== null &&
        lookup.lockedUntil.getTime() > now.getTime()
      ) {
        throw new BusinessRuleError(
          "share_link_locked",
          `Share link ${lookup.id} is temporarily locked`,
        );
      }

      const versioned = await shareLinkRepository.findById(lookup.id);
      if (versioned === null) {
        throw new NotFoundError(
          "SHARE_LINK_NOT_FOUND",
          `Share link disappeared between lookup and verification: ${lookup.id}`,
        );
      }

      const result = await PublicationService.verifyShareLinkAccess(
        versioned.entity,
        input.password,
        container.passwordHasher,
        now,
      );

      await shareLinkRepository.save(
        result.updatedLink,
        versioned.expectedVersion,
      );

      if (!result.ok) {
        throw new BusinessRuleError(
          "share_link_password_invalid",
          `Share link ${lookup.id} password verification failed`,
        );
      }

      const noteFound = await noteRepository.findById(versioned.entity.noteId);
      if (noteFound === null) {
        throw new NotFoundError(
          "NOTE_NOT_FOUND",
          `Note for share link ${lookup.id} not found`,
        );
      }

      const ownerFound = await userRepository.findById(
        versioned.entity.ownerId,
      );
      if (ownerFound === null) {
        throw new NotFoundError(
          "USER_NOT_FOUND",
          `Owner ${versioned.entity.ownerId} for share link ${lookup.id} not found`,
        );
      }

      return {
        note: noteFound.entity,
        ownerUsername: ownerFound.entity.username as string,
      };
    },
  );

  return { noteId: note.id, ownerUsername };
}
