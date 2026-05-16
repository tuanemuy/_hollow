import { BusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { Note } from "@/core/domain/note/entity";
import { NoteErrorCode } from "@/core/domain/note/errorCode";
import { NoteService } from "@/core/domain/note/service";
import { type NoteId, NoteTitle } from "@/core/domain/note/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import type { NoteDTO } from "./view";
import { toNoteView } from "./view";

export type RenameNoteInput = Readonly<{
  actorUserId: UserId;
  noteId: NoteId;
  newTitle: string;
  regenerateSlug: boolean;
}>;

export type RenameNoteOutput = Readonly<{ note: NoteDTO }>;

export async function renameNote({
  container,
  input,
}: ServiceArgs<RenameNoteInput>): Promise<RenameNoteOutput> {
  const now = container.clock.now();
  const newTitle = NoteTitle.create(input.newTitle);

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
        NoteErrorCode.AlreadyTrashed,
        `Cannot rename trashed note ${input.noteId}`,
      );
    }

    const newSlug = input.regenerateSlug
      ? await NoteService.generateUniqueSlug(
          found.entity.ownerId,
          newTitle,
          ctx.noteRepository,
        )
      : found.entity.slug;

    const { entity: next, eventDrafts } = Note.rename(
      found.entity,
      newTitle,
      newSlug,
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
