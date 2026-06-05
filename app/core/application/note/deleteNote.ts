import { Note } from "@/core/domain/note/entity";
import type { NoteId } from "@/core/domain/note/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type DeleteNoteInput = Readonly<{
  actorUserId: string;
  noteId: string;
}>;

export async function deleteNote({
  container,
  input,
}: ServiceArgs<DeleteNoteInput>): Promise<void> {
  const now = container.clock.now();

  await container.unitOfWorkProvider.run(async (ctx) => {
    const found = await ctx.noteRepository.findById(input.noteId as NoteId);
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
    const { entity: next, eventDrafts } = Note.trash(found.entity, now);
    await ctx.noteRepository.save(next, found.expectedVersion);
    ctx.collectEvents(eventDrafts);
  });
}
