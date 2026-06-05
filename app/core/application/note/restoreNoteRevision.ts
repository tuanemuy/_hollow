import { BusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { MediaService } from "@/core/domain/media/service";
import { Note } from "@/core/domain/note/entity";
import { NoteErrorCode } from "@/core/domain/note/errorCode";
import { NoteRevision } from "@/core/domain/note/revision";
import { NoteService } from "@/core/domain/note/service";
import {
  ContentHtml,
  type NoteId,
  type NoteRevisionId,
} from "@/core/domain/note/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import type { NoteDTO } from "./view";
import { toNoteView } from "./view";

export type RestoreNoteRevisionInput = Readonly<{
  actorUserId: string;
  noteId: string;
  revisionId: string;
}>;

export type RestoreNoteRevisionOutput = Readonly<{ note: NoteDTO }>;

/**
 * Restore a past `NoteRevision` into the live `Note` aggregate.
 *
 * Semantics (Issue #158 ADR-005):
 * 1. Current note state is captured as a fresh `NoteRevision` (safety
 *    net — the user can roll back the restoration by choosing this
 *    snapshot again).
 * 2. The target revision's body is run through
 *    `NoteService.assembleFromInputs` so tag / internal-link / media
 *    references are re-derived against current ownership rules.
 * 3. `Note.updateContent` writes the assembled state back to the
 *    aggregate (bumping `version`, emitting `note.contentUpdated`).
 * 4. The retention ceiling is enforced after the safety-net insert.
 *    Only step 1 appends a `note_revisions` row (we intentionally do NOT
 *    snapshot the restored body — that body is already in the existing
 *    revision and re-snapshotting would duplicate history), so the
 *    worst-case pre-prune state is `+1` row.
 *
 * `requireLock=false` because the restore is initiated from the history
 * view, not the editor. If another user holds a live lock,
 * `Note.updateContent` raises `BusinessRuleError(edit_locked_by_other)`.
 */
export async function restoreNoteRevision({
  container,
  input,
}: ServiceArgs<RestoreNoteRevisionInput>): Promise<RestoreNoteRevisionOutput> {
  const now = container.clock.now();
  const actorUserId = input.actorUserId as UserId;

  const restored = await container.unitOfWorkProvider.run(async (ctx) => {
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
    if (found.entity.status !== "active") {
      throw new BusinessRuleError(
        NoteErrorCode.AlreadyTrashed,
        `Cannot restore revision into trashed note ${input.noteId}`,
      );
    }

    const revision = await ctx.noteRevisionRepository.findById(
      input.revisionId as NoteRevisionId,
    );
    if (!revision) {
      throw new NotFoundError(
        "REVISION_NOT_FOUND",
        `Note revision not found: ${input.revisionId}`,
      );
    }
    // Defensive: `revision.ownerId` should always equal `note.ownerId` under
    // the current single-owner model, but we re-check here so a future owner
    // transfer feature cannot let a stale revision restore data the actor
    // never owned. Treated as `REVISION_NOT_FOUND` (not `FORBIDDEN`) to avoid
    // leaking the existence of cross-note revision IDs.
    if (revision.noteId !== input.noteId || revision.ownerId !== actorUserId) {
      throw new NotFoundError(
        "REVISION_NOT_FOUND",
        `Note revision not found: ${input.revisionId}`,
      );
    }

    const previousMediaRefs = found.entity.mediaRefs;

    // Step 1 — safety-net snapshot of the *current* note state.
    const safetyRevision = NoteRevision.create(
      {
        id: container.idGenerator.next(),
        noteId: found.entity.id,
        ownerId: found.entity.ownerId,
        title: found.entity.title,
        contentHtml: found.entity.contentHtml,
        frontMatter: found.entity.frontMatter,
        createdByUserId: actorUserId,
      },
      now,
    );
    await ctx.noteRevisionRepository.insert(safetyRevision);

    // Step 2 — re-assemble children from the revision's body so media /
    // tag / link references reflect current ownership policies.
    const assembled = await NoteService.assembleFromInputs(
      {
        ownerId: found.entity.ownerId,
        rawContent: revision.contentHtml as string,
        declaredTagNames: [],
        declaredInternalLinkRefs: [],
      },
      {
        sanitizer: container.htmlSanitizer,
        tagRepo: ctx.tagRepository,
        blacklistRepo: ctx.tagBlacklistRepository,
        noteRepo: ctx.noteRepository,
        mediaRepo: ctx.mediaAssetRepository,
        mintTagId: () => container.idGenerator.next(),
        now,
      },
    );

    // Step 3 — write the restored content back to the live aggregate.
    const { entity: next, eventDrafts } = Note.updateContent(found.entity, {
      title: revision.title,
      contentHtml: ContentHtml.create(assembled.html as string),
      frontMatter: revision.frontMatter,
      tagIds: assembled.tagIds,
      internalLinkRefs: assembled.internalLinkRefs,
      mediaRefs: assembled.mediaRefs,
      now,
      actorUserId,
      requireLock: false,
    });

    await ctx.noteRepository.save(next, found.expectedVersion);
    ctx.collectEvents(eventDrafts);

    await MediaService.reconcileRefs(
      previousMediaRefs,
      next.mediaRefs,
      now,
      ctx.mediaAssetRepository,
    );

    // Step 4 — retention enforcement. The +1 bias accounts for the
    // freshly-inserted safety revision which is not yet visible to the
    // count read (pending batch).
    const { entity: settings } = await ctx.instanceSettingsRepository.get();
    const cap = settings.limits.maxNoteRevisionsPerNote;
    // The safety-net revision above is buffered on the pending batch;
    // committed-row reads do not see it. Once the batch flushes the
    // total will be `committed + 1`, so prune to `cap - 1` committed
    // rows to keep the post-flush total at `cap`.
    const count = await ctx.noteRevisionRepository.countByNoteId(next.id);
    if (count + 1 > cap) {
      await ctx.noteRevisionRepository.deleteOldestForNote(next.id, cap - 1);
    }

    return next;
  });

  return { note: toNoteView(restored) };
}
