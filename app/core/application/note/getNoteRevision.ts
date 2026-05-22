import {
  type NoteRevisionDTO,
  toNoteRevisionDTO,
} from "@/core/application/dto/note";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId, NoteRevisionId } from "@/core/domain/note/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import type { NoteDTO } from "./view";
import { toNoteView } from "./view";

export type GetNoteRevisionInput = Readonly<{
  actorUserId: UserId;
  noteId: NoteId;
  revisionId: NoteRevisionId;
}>;

export type GetNoteRevisionOutput = Readonly<{
  revision: NoteRevisionDTO;
  note: NoteDTO;
}>;

/**
 * Fetch a single revision plus the current note state. The current note
 * is bundled so the UI can render side-by-side ("you are viewing the
 * version from X; the current version is Y") without an extra round
 * trip. Authorisation is enforced through `notes.owner_id`; the
 * cross-note check protects against URL tampering where one user's
 * revision id is appended to another user's note id.
 */
export async function getNoteRevision({
  container,
  input,
}: ServiceArgs<GetNoteRevisionInput>): Promise<GetNoteRevisionOutput> {
  return container.unitOfWorkProvider.run(async (ctx) => {
    const found = await ctx.noteRepository.findById(input.noteId);
    if (!found) {
      throw new NotFoundError(
        "NOTE_NOT_FOUND",
        `Note not found: ${input.noteId}`,
      );
    }
    if (found.entity.ownerId !== input.actorUserId) {
      throw new ForbiddenError(
        "NOTE_FORBIDDEN",
        `Note ${input.noteId} is owned by another user`,
      );
    }

    const revision = await ctx.noteRevisionRepository.findById(
      input.revisionId,
    );
    if (!revision) {
      throw new NotFoundError(
        "REVISION_NOT_FOUND",
        `Note revision not found: ${input.revisionId}`,
      );
    }
    if (revision.noteId !== input.noteId) {
      // Cross-note tampering: the revision belongs to a different note.
      // Surface NotFound rather than Forbidden so the URL probe cannot
      // distinguish "exists but not yours" from "does not exist".
      throw new NotFoundError(
        "REVISION_NOT_FOUND",
        `Note revision not found: ${input.revisionId}`,
      );
    }

    return {
      revision: toNoteRevisionDTO(revision),
      note: toNoteView(found.entity),
    };
  });
}
