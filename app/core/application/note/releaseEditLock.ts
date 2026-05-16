import type { UserId } from "@/core/domain/identity/valueObject";
import { Note } from "@/core/domain/note/entity";
import type { NoteId } from "@/core/domain/note/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import type { NoteDTO } from "./view";
import { toNoteView } from "./view";

export type ReleaseEditLockInput = Readonly<{
  actorUserId: UserId;
  noteId: NoteId;
}>;

export type ReleaseEditLockOutput = Readonly<{ note: NoteDTO }>;

export async function releaseEditLock({
  container,
  input,
}: ServiceArgs<ReleaseEditLockInput>): Promise<ReleaseEditLockOutput> {
  const note = await container.unitOfWorkProvider.run(async (ctx) => {
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
    const next = Note.releaseEditLock(found.entity, input.actorUserId);
    if (next === found.entity) {
      return found.entity;
    }
    await ctx.noteRepository.save(next, found.expectedVersion);
    return next;
  });
  return { note: toNoteView(note) };
}
