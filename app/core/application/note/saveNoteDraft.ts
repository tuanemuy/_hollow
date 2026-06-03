import { BusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { Note } from "@/core/domain/note/entity";
import { NoteErrorCode } from "@/core/domain/note/errorCode";
import {
  ContentHtml,
  FrontMatter,
  type FrontMatterRecord,
  type NoteId,
  NoteTitle,
} from "@/core/domain/note/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import type { NoteDTO } from "./view";
import { toNoteView } from "./view";

export type SaveNoteDraftInput = Readonly<{
  actorUserId: UserId;
  noteId: NoteId;
  title?: string;
  contentHtml?: string;
  frontMatter?: FrontMatterRecord;
}>;

export type SaveNoteDraftOutput = Readonly<{ note: NoteDTO }>;

export async function saveNoteDraft({
  container,
  input,
}: ServiceArgs<SaveNoteDraftInput>): Promise<SaveNoteDraftOutput> {
  const now = container.clock.now();
  const titleOverride =
    input.title === undefined ? undefined : NoteTitle.create(input.title);
  const frontMatterOverride =
    input.frontMatter === undefined
      ? undefined
      : FrontMatter.create(input.frontMatter);

  // Auto-save bypasses tag extraction / internal-link resolution / media
  // ownership checks — those run in the explicit `SaveNote` path. Body
  // text is still sent through the sanitiser to keep the on-disk HTML
  // free of disallowed nodes.
  const contentOverride =
    input.contentHtml === undefined
      ? undefined
      : ContentHtml.create(
          container.htmlSanitizer.sanitize(input.contentHtml, {
            allowMedia: true,
            allowInternalLinks: true,
          }).html as string,
        );

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
        `Cannot draft-save trashed note ${input.noteId}`,
      );
    }

    const { entity: next, eventDrafts } = Note.updateContent(found.entity, {
      ...(titleOverride !== undefined ? { title: titleOverride } : {}),
      ...(contentOverride !== undefined
        ? { contentHtml: contentOverride }
        : {}),
      ...(frontMatterOverride !== undefined
        ? { frontMatter: frontMatterOverride }
        : {}),
      now,
      actorUserId: input.actorUserId,
      requireLock: false,
    });

    // No-op autosave: `updateContent` returns the same reference when the
    // draft matches the stored content, so skip the save + event entirely
    // (mirrors the reset/update usecases' `next === current` guard).
    if (next === found.entity) {
      return next;
    }

    await ctx.noteRepository.save(next, found.expectedVersion);
    ctx.collectEvents(eventDrafts);

    return next;
  });

  return { note: toNoteView(note) };
}
