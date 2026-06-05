import { BusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { NoteErrorCode } from "@/core/domain/note/errorCode";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { ServiceArgs } from "../types";
import { loadOwnedNote } from "./internal";
import { type ShareLinkDTO, toShareLinkDTOFromId } from "./view";

export type ListShareLinksInput = Readonly<{
  actorUserId: string;
  noteId: string;
}>;

export type ListShareLinksOutput = Readonly<{
  links: readonly ShareLinkDTO[];
}>;

/**
 * Owner-facing listing of every share link issued for a note, including
 * revoked ones (so the owner can inspect lifecycle history).
 *
 * The plaintext token is no longer available at this point — the DTO's
 * `url` is materialised via the link id; the presentation layer's
 * route handles redirection to the canonical `/share/<token>` URL.
 */
export async function listShareLinks({
  container,
  input,
}: ServiceArgs<ListShareLinksInput>): Promise<ListShareLinksOutput> {
  const actorUserId = input.actorUserId as UserId;
  const noteId = input.noteId as NoteId;
  const links = await container.unitOfWorkProvider.run(
    async ({ noteRepository, shareLinkRepository }) => {
      const note = await loadOwnedNote(noteRepository, noteId, actorUserId);
      if (note.status !== "active") {
        throw new BusinessRuleError(
          NoteErrorCode.Trashed,
          `Note ${input.noteId} is trashed; share links are not listable`,
        );
      }
      return shareLinkRepository.findByNoteId(note.id);
    },
  );

  return {
    links: links.map((link) =>
      toShareLinkDTOFromId(link, container.config.appUrl),
    ),
  };
}
