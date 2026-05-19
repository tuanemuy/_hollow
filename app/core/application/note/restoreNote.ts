import { DirectoryService } from "@/core/domain/directory/service";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import { BusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { Note } from "@/core/domain/note/entity";
import { NoteErrorCode } from "@/core/domain/note/errorCode";
import { NoteService } from "@/core/domain/note/service";
import type { NoteId } from "@/core/domain/note/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import type { NoteDTO } from "./view";
import { toNoteView } from "./view";

export type RestoreNoteInput = Readonly<{
  actorUserId: UserId;
  noteId: NoteId;
  restoreDirectoryId: DirectoryId | null;
}>;

export type RestoreNoteOutput = Readonly<{ note: NoteDTO }>;

export async function restoreNote({
  container,
  input,
}: ServiceArgs<RestoreNoteInput>): Promise<RestoreNoteOutput> {
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
    if (found.entity.status !== "trashed") {
      throw new BusinessRuleError(
        NoteErrorCode.NotTrashed,
        `Note ${input.noteId} is not trashed`,
      );
    }

    // Fail-fast before directory resolution: `DirectoryService.ensureRoot`
    // creates a new root directory as a side effect when none exists, and
    // a slug collision raised after that would force the transaction to
    // roll back the newly-created root unnecessarily. `findByOwnerAndSlug`
    // is narrowed to `status='active'` (see ADR-007), so the trashed note
    // we are restoring never matches itself — `exceptId: null` makes that
    // intent explicit.
    await NoteService.assertSlugUnique(
      found.entity.ownerId,
      found.entity.slug,
      null,
      ctx.noteRepository,
      NoteErrorCode.SlugConflict,
    );

    let targetDirectoryId: DirectoryId;
    if (input.restoreDirectoryId === null) {
      const root = await DirectoryService.ensureRoot(
        found.entity.ownerId,
        now,
        container.idGenerator,
        ctx.directoryRepository,
      );
      targetDirectoryId = root.id;
    } else {
      const dir = await ctx.directoryRepository.findById(
        input.restoreDirectoryId,
      );
      if (!dir || dir.entity.ownerId !== found.entity.ownerId) {
        // Original directory may have been deleted while the note was
        // trashed — fall back to the owner's root.
        const root = await DirectoryService.ensureRoot(
          found.entity.ownerId,
          now,
          container.idGenerator,
          ctx.directoryRepository,
        );
        targetDirectoryId = root.id;
      } else {
        targetDirectoryId = dir.entity.id;
      }
    }

    const { entity: next, eventDrafts } = Note.restore(
      found.entity,
      targetDirectoryId,
      now,
    );
    await ctx.noteRepository.save(next, found.expectedVersion);
    ctx.collectEvents(eventDrafts);
    return next;
  });

  return { note: toNoteView(note) };
}
