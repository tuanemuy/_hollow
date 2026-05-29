import { BusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { MediaService } from "@/core/domain/media/service";
import type { MediaAssetId } from "@/core/domain/media/valueObject";
import { Note } from "@/core/domain/note/entity";
import { NoteErrorCode } from "@/core/domain/note/errorCode";
import { NoteRevision } from "@/core/domain/note/revision";
import { NoteService } from "@/core/domain/note/service";
import {
  ContentHtml,
  FrontMatter,
  type FrontMatterRecord,
  InternalLinkRef,
  type InternalLinkRef as InternalLinkRefType,
  type NoteId,
  NoteTitle,
} from "@/core/domain/note/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import { TagName } from "@/core/domain/tag/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import type { InternalLinkRefDTO, NoteDTO } from "./view";
import { toNoteView } from "./view";

export type SaveNoteInput = Readonly<{
  actorUserId: UserId;
  noteId: NoteId;
  title?: string;
  contentHtml?: string;
  frontMatter?: FrontMatterRecord;
  tagNames?: readonly string[];
  internalLinkRefs?: readonly InternalLinkRefDTO[];
  requireLock: boolean;
}>;

export type SaveNoteOutput = Readonly<{ note: NoteDTO }>;

type AssembledContent = Readonly<{
  contentHtml: ContentHtml;
  tagIds: readonly TagId[];
  internalLinkRefs: readonly InternalLinkRefType[];
  mediaRefs: readonly MediaAssetId[];
}>;

function liftDeclaredLinks(
  refs: readonly InternalLinkRefDTO[],
): readonly InternalLinkRefType[] {
  return refs.map((ref) =>
    InternalLinkRef.create({
      kind: ref.kind,
      target: ref.target,
      displayText: ref.displayText,
    }),
  );
}

export async function saveNote({
  container,
  input,
}: ServiceArgs<SaveNoteInput>): Promise<SaveNoteOutput> {
  const now = container.clock.now();
  const titleOverride =
    input.title === undefined ? undefined : NoteTitle.create(input.title);
  const frontMatterOverride =
    input.frontMatter === undefined
      ? undefined
      : FrontMatter.create(input.frontMatter);

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
        `Cannot save trashed note ${input.noteId}`,
      );
    }

    const previousMediaRefs = found.entity.mediaRefs;

    let assembled: AssembledContent | undefined;
    if (
      input.contentHtml !== undefined ||
      input.tagNames !== undefined ||
      input.internalLinkRefs !== undefined
    ) {
      const declaredTagNames = (input.tagNames ?? []).map((name) =>
        TagName.create(name),
      );
      const declaredLinks =
        input.internalLinkRefs === undefined
          ? []
          : liftDeclaredLinks(input.internalLinkRefs);

      const out = await NoteService.assembleFromInputs(
        {
          ownerId: found.entity.ownerId,
          rawContent: input.contentHtml ?? (found.entity.contentHtml as string),
          declaredTagNames,
          declaredInternalLinkRefs: declaredLinks,
          selfNoteId: found.entity.id,
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
      assembled = {
        contentHtml: ContentHtml.create(out.html as string),
        tagIds: out.tagIds,
        internalLinkRefs: out.internalLinkRefs,
        mediaRefs: out.mediaRefs,
      };
    }

    const { entity: next, eventDrafts } = Note.updateContent(found.entity, {
      ...(titleOverride !== undefined ? { title: titleOverride } : {}),
      ...(assembled !== undefined
        ? {
            contentHtml: assembled.contentHtml,
            tagIds: assembled.tagIds,
            internalLinkRefs: assembled.internalLinkRefs,
            mediaRefs: assembled.mediaRefs,
          }
        : {}),
      ...(frontMatterOverride !== undefined
        ? { frontMatter: frontMatterOverride }
        : {}),
      now,
      actorUserId: input.actorUserId,
      requireLock: input.requireLock,
    });

    await ctx.noteRepository.save(next, found.expectedVersion);
    ctx.collectEvents(eventDrafts);

    await MediaService.reconcileRefs(
      previousMediaRefs,
      next.mediaRefs,
      now,
      ctx.mediaAssetRepository,
    );

    // Issue #158 ADR-002: every successful SaveNote appends a fresh
    // immutable snapshot to `note_revisions`. The retention ceiling
    // (ADR-004) is enforced inside the same UoW so an over-quota state
    // never persists.
    const revision = NoteRevision.create(
      {
        id: container.idGenerator.next(),
        noteId: next.id,
        ownerId: next.ownerId,
        title: next.title,
        contentHtml: next.contentHtml,
        frontMatter: next.frontMatter,
        createdByUserId: input.actorUserId,
      },
      now,
    );
    await ctx.noteRevisionRepository.insert(revision);

    const { entity: settings } = await ctx.instanceSettingsRepository.get();
    const cap = settings.limits.maxNoteRevisionsPerNote;
    // The freshly-inserted revision above is buffered on the pending
    // batch; the count + prune queries below see only committed rows.
    // Once the batch flushes we will have `committed + 1` rows total —
    // we want at most `cap`, so the prune must leave `cap - 1` rows of
    // committed history behind.
    const count = await ctx.noteRevisionRepository.countByNoteId(next.id);
    if (count + 1 > cap) {
      await ctx.noteRevisionRepository.deleteOldestForNote(next.id, cap - 1);
    }

    return next;
  });

  return { note: toNoteView(note) };
}
