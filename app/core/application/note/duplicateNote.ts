import { BusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { MediaService } from "@/core/domain/media/service";
import { NoteErrorCode } from "@/core/domain/note/errorCode";
import { NoteService } from "@/core/domain/note/service";
import type { NoteId } from "@/core/domain/note/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import type { NoteDTO } from "./view";
import { toNoteView } from "./view";

export type DuplicateNoteInput = Readonly<{
  actorUserId: UserId;
  noteId: NoteId;
}>;

export type DuplicateNoteOutput = Readonly<{ note: NoteDTO }>;

export async function duplicateNote({
  container,
  input,
}: ServiceArgs<DuplicateNoteInput>): Promise<DuplicateNoteOutput> {
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
        NoteErrorCode.AlreadyTrashed,
        `Cannot duplicate trashed note: ${input.noteId}`,
      );
    }
    const { entity: copy, eventDrafts } = await NoteService.duplicate(
      found.entity,
      now,
      () => container.idGenerator.next(),
      ctx.noteRepository,
    );
    await ctx.noteRepository.insert(copy);
    ctx.collectEvents(eventDrafts);

    // The duplicate carries the same `mediaRefs`; bump their ref counts
    // so the originals do not get reaped while the copy holds them.
    await MediaService.reconcileRefs(
      [],
      copy.mediaRefs,
      now,
      ctx.mediaAssetRepository,
    );

    return copy;
  });

  return { note: toNoteView(note) };
}
