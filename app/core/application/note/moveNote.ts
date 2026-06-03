import type { DirectoryId } from "@/core/domain/directory/valueObject";
import { BusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { Note } from "@/core/domain/note/entity";
import { NoteErrorCode } from "@/core/domain/note/errorCode";
import type { NoteId } from "@/core/domain/note/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import type { NoteDTO } from "./view";
import { toNoteView } from "./view";

export type MoveNoteInput = Readonly<{
  actorUserId: UserId;
  noteId: NoteId;
  newDirectoryId: DirectoryId;
}>;

export type MoveNoteOutput = Readonly<{ note: NoteDTO }>;

export async function moveNote({
  container,
  input,
}: ServiceArgs<MoveNoteInput>): Promise<MoveNoteOutput> {
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
    if (found.entity.status !== "active") {
      throw new BusinessRuleError(
        NoteErrorCode.Trashed,
        `Cannot move trashed note ${input.noteId}`,
      );
    }
    const dir = await ctx.directoryRepository.findById(input.newDirectoryId);
    if (!dir) {
      throw new ForbiddenError(
        "DIRECTORY_NOT_FOUND",
        `Directory ${input.newDirectoryId} is not accessible`,
      );
    }
    if (dir.entity.ownerId !== input.actorUserId) {
      throw new ForbiddenError(
        "DIRECTORY_FORBIDDEN",
        `Directory ${input.newDirectoryId} is owned by another user`,
      );
    }

    const { entity: next, eventDrafts } = Note.moveTo(
      found.entity,
      input.newDirectoryId,
      now,
    );
    if (eventDrafts.length === 0) {
      return found.entity;
    }
    await ctx.noteRepository.save(next, found.expectedVersion);
    ctx.collectEvents(eventDrafts);
    return next;
  });

  return { note: toNoteView(note) };
}
