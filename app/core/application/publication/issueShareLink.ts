import { BusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { NoteErrorCode } from "@/core/domain/note/errorCode";
import type { NoteId } from "@/core/domain/note/valueObject";
import { ShareLink } from "@/core/domain/publication/entity";
import { PublicationService } from "@/core/domain/publication/service";
import { ShareLinkPassword } from "@/core/domain/publication/valueObject";
import type { ServiceArgs } from "../types";
import { loadOwnedNote } from "./internal";
import { generateShareLinkToken, hashShareLinkToken } from "./token";

export type IssueShareLinkInput = Readonly<{
  actorUserId: UserId;
  noteId: NoteId;
  password: string | null;
}>;

export type IssueShareLinkOutput = Readonly<{
  shareLinkId: string;
  urlToken: string;
}>;

const TOKEN_BYTES = 32;

/**
 * Mint a new share link for a note.
 *
 * Pre-conditions enforced inside the UoW:
 * - The actor owns the note and the note is `active`.
 * - The note's current visibility is `unlisted` or `public` — `private`
 *   rejects share-link issuance per spec.
 * - The per-note active-link quota has not been reached.
 *
 * The raw token is returned **exactly once**; only its hash is
 * persisted on the link row.
 */
export async function issueShareLink({
  container,
  input,
}: ServiceArgs<IssueShareLinkInput>): Promise<IssueShareLinkOutput> {
  const now = container.clock.now();
  const id = container.idGenerator.next();
  const rawToken = generateShareLinkToken(TOKEN_BYTES);
  const tokenHash = await hashShareLinkToken(rawToken);

  const passwordHash =
    input.password === null
      ? null
      : await container.passwordHasher.hash(
          ShareLinkPassword.create(input.password),
        );

  const shareLinkId = await container.unitOfWorkProvider.run(
    async ({
      noteRepository,
      publicationStateRepository,
      shareLinkRepository,
      collectEvents,
    }) => {
      const note = await loadOwnedNote(
        noteRepository,
        input.noteId,
        input.actorUserId,
      );
      if (note.status !== "active") {
        throw new BusinessRuleError(
          NoteErrorCode.Trashed,
          `Note ${input.noteId} is trashed; cannot issue share link`,
        );
      }

      const state = await publicationStateRepository.findById(note.id);
      if (state === null || state.entity.visibility === "private") {
        throw new BusinessRuleError(
          "visibility_private",
          `Cannot issue share link for note ${input.noteId} while visibility is private`,
        );
      }

      await PublicationService.assertLinkQuota(
        note.id,
        PublicationService.DEFAULT_LINK_QUOTA,
        shareLinkRepository,
      );

      const { entity: link, eventDrafts } = ShareLink.create(
        {
          id,
          noteId: note.id,
          ownerId: input.actorUserId,
          tokenHash,
          passwordHash,
        },
        now,
      );

      await shareLinkRepository.insert(link);
      collectEvents(eventDrafts);
      return link.id;
    },
  );

  return { shareLinkId, urlToken: rawToken };
}
