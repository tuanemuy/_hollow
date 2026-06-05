import type { UserId } from "@/core/domain/identity/valueObject";
import { Note } from "@/core/domain/note/entity";
import type { NoteId } from "@/core/domain/note/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import type { NoteDTO } from "./view";
import { toNoteView } from "./view";

export type AcquireEditLockInput = Readonly<{
  actorUserId: string;
  noteId: string;
  ttlSec: number;
}>;

export type AcquireEditLockOutput = Readonly<{ note: NoteDTO }>;

export async function acquireEditLock({
  container,
  input,
}: ServiceArgs<AcquireEditLockInput>): Promise<AcquireEditLockOutput> {
  const now = container.clock.now();
  const actorUserId = input.actorUserId as UserId;
  const note = await container.unitOfWorkProvider.run(async (ctx) => {
    const found = await ctx.noteRepository.findById(input.noteId as NoteId);
    if (!found) {
      throw new NotFoundError(
        "NOTE_NOT_FOUND",
        `Note not found: ${input.noteId}`,
      );
    }
    if (found.entity.ownerId !== actorUserId) {
      throw new ForbiddenError(
        "NOTE_FORBIDDEN",
        `Note ${input.noteId} is owned by another user`,
      );
    }
    const next = Note.acquireEditLock(
      found.entity,
      actorUserId,
      now,
      input.ttlSec,
    );
    await ctx.noteRepository.save(next, found.expectedVersion);
    return next;
  });
  return { note: toNoteView(note) };
}
