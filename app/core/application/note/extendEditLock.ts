import type { UserId } from "@/core/domain/identity/valueObject";
import { Note } from "@/core/domain/note/entity";
import type { NoteId } from "@/core/domain/note/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import type { NoteDTO } from "./view";
import { toNoteView } from "./view";

export type ExtendEditLockInput = Readonly<{
  actorUserId: UserId;
  noteId: NoteId;
  ttlSec: number;
}>;

export type ExtendEditLockOutput = Readonly<{ note: NoteDTO }>;

export async function extendEditLock({
  container,
  input,
}: ServiceArgs<ExtendEditLockInput>): Promise<ExtendEditLockOutput> {
  const now = container.clock.now();
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
    const next = Note.extendEditLock(
      found.entity,
      input.actorUserId,
      now,
      input.ttlSec,
    );
    await ctx.noteRepository.save(next, found.expectedVersion);
    return next;
  });
  return { note: toNoteView(note) };
}
