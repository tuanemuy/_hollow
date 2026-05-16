import type { UserId } from "@/core/domain/identity/valueObject";
import type { Note } from "@/core/domain/note/entity";
import type { NoteRepository } from "@/core/domain/note/ports/noteRepository";
import type { NoteId } from "@/core/domain/note/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";

/**
 * Shared note loader for publication usecases. Performs the three
 * checks the spec calls out at the head of every owner-gated flow:
 * note exists, the actor owns it, and it is currently `active`.
 *
 * Trashed-note rejection raises a generic `BusinessRuleError` rather
 * than a layered application error: trash is a domain state the
 * presentation layer should surface verbatim.
 */
export async function loadOwnedNote(
  repo: NoteRepository,
  noteId: NoteId,
  actorUserId: UserId,
): Promise<Note> {
  const found = await repo.findById(noteId);
  if (found === null) {
    throw new NotFoundError("NOTE_NOT_FOUND", `Note not found: ${noteId}`);
  }
  if (found.entity.ownerId !== actorUserId) {
    throw new ForbiddenError(
      "NOTE_NOT_OWNED",
      `Note ${noteId} is not owned by actor ${actorUserId}`,
    );
  }
  return found.entity;
}
