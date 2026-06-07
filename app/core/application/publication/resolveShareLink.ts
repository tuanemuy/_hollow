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
 * - A failed password attempt increments the failure counter (and arms
 *   the lockout threshold once it is reached). Because the D1 UoW only
 *   flushes its batch when the callback returns normally, the failed
 *   attempt is signalled by *returning* a `password_invalid` outcome —
 *   not by throwing — so the counter / lockout `save()` is committed.
 *   The `BusinessRuleError("share_link_password_invalid")` is then
 *   thrown outside the UoW, after the write has been flushed.
 * - `note-not-found` / `owner-not-found` are thrown *inside* the UoW
 *   (after the access record / reset `save()` was enqueued) so that
 *   throw discards the batch: a link pointing at a missing note should
 *   not leave an access record behind.
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

  type RunOutcome =
    | Readonly<{ outcome: "ok"; noteId: NoteId; ownerUsername: string }>
    | Readonly<{ outcome: "password_invalid"; shareLinkId: string }>;

  const result = await container.unitOfWorkProvider.run<RunOutcome>(
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

      const verify = await PublicationService.verifyShareLinkAccess(
        versioned.entity,
        input.password,
        container.passwordHasher,
        now,
      );

      await shareLinkRepository.save(
        verify.updatedLink,
        versioned.expectedVersion,
      );

      // Returning (not throwing) lets the UoW flush the counter /
      // lockout write; the caller throws `share_link_password_invalid`
      // after the batch has committed.
      if (!verify.ok) {
        return { outcome: "password_invalid", shareLinkId: lookup.id };
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
        outcome: "ok",
        noteId: noteFound.entity.id,
        ownerUsername: ownerFound.entity.username as string,
      };
    },
  );

  if (result.outcome === "password_invalid") {
    throw new BusinessRuleError(
      "share_link_password_invalid",
      `Share link ${result.shareLinkId} password verification failed`,
    );
  }

  return { noteId: result.noteId, ownerUsername: result.ownerUsername };
}
