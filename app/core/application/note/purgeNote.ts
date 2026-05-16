import { BusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { NoteErrorCode } from "@/core/domain/note/errorCode";
import { NoteEvents } from "@/core/domain/note/events";
import type { NoteId } from "@/core/domain/note/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type PurgeNoteInput = Readonly<{
  actorUserId: UserId;
  noteId: NoteId;
}>;

export async function purgeNote({
  container,
  input,
}: ServiceArgs<PurgeNoteInput>): Promise<void> {
  const now = container.clock.now();

  await container.unitOfWorkProvider.run(async (ctx) => {
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
    if (found.entity.status !== "trashed") {
      throw new BusinessRuleError(
        NoteErrorCode.NotTrashed,
        `Note ${input.noteId} is not trashed`,
      );
    }
    await ctx.noteRepository.purge(found.entity.id);
    ctx.collectEvents([
      NoteEvents.purged(
        {
          noteId: found.entity.id,
          ownerId: found.entity.ownerId,
          mediaRefs: found.entity.mediaRefs,
        },
        now,
      ),
    ]);
  });
}
