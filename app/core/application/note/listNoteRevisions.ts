import {
  type NoteRevisionSummaryDTO,
  toNoteRevisionSummaryDTO,
} from "@/core/application/dto/note";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type ListNoteRevisionsInput = Readonly<{
  actorUserId: UserId;
  noteId: NoteId;
  limit: number;
  offset: number;
}>;

export type ListNoteRevisionsOutput = Readonly<{
  revisions: readonly NoteRevisionSummaryDTO[];
  totalCount: number;
}>;

/**
 * Owner-scoped listing of `NoteRevision` rows for a given note.
 *
 * Trashed notes are not filtered out — the user may want to inspect the
 * history of a note that has been moved to the trash but not yet purged.
 * The summary projection drops the body so the response stays small even
 * for the page near the retention ceiling.
 */
export async function listNoteRevisions({
  container,
  input,
}: ServiceArgs<ListNoteRevisionsInput>): Promise<ListNoteRevisionsOutput> {
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

    const [rows, totalCount] = await Promise.all([
      ctx.noteRevisionRepository.findByNoteId(input.noteId, {
        limit: input.limit,
        offset: input.offset,
      }),
      ctx.noteRevisionRepository.countByNoteId(input.noteId),
    ]);

    return {
      revisions: rows.map(toNoteRevisionSummaryDTO),
      totalCount,
    };
  });
}
