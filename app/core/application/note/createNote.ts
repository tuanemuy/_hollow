import type { UnitOfWorkContext } from "@/core/application/execution/unitOfWork";
import type { IdGenerator } from "@/core/application/ports/idGenerator";
import { DirectoryService } from "@/core/domain/directory/service";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import { MediaService } from "@/core/domain/media/service";
import { Note } from "@/core/domain/note/entity";
import { NoteService } from "@/core/domain/note/service";
import {
  ContentHtml,
  FrontMatter,
  type FrontMatterRecord,
  InternalLinkRef,
  type InternalLinkRef as InternalLinkRefType,
  NoteId,
  NoteTitle,
} from "@/core/domain/note/valueObject";
import { TagName } from "@/core/domain/tag/valueObject";
import { ForbiddenError } from "../errors";
import type { ServiceArgs } from "../types";
import type { InternalLinkRefDTO, NoteDTO } from "./view";
import { toNoteView } from "./view";

const DEFAULT_NOTE_TITLE = "無題";

export type CreateNoteInput = Readonly<{
  actorUserId: UserId;
  directoryId: DirectoryId | null;
  title: string;
  contentHtml: string;
  frontMatter: FrontMatterRecord;
  tagNames: readonly string[];
  internalLinkRefs: readonly InternalLinkRefDTO[];
}>;

export type CreateNoteOutput = Readonly<{ note: NoteDTO }>;

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

async function resolveDirectory(
  ctx: UnitOfWorkContext,
  ownerId: UserId,
  directoryId: DirectoryId | null,
  now: Date,
  idGenerator: IdGenerator,
) {
  if (directoryId === null) {
    return DirectoryService.ensureRoot(
      ownerId,
      now,
      idGenerator,
      ctx.directoryRepository,
    );
  }
  const found = await ctx.directoryRepository.findById(directoryId);
  if (!found) {
    throw new ForbiddenError(
      "DIRECTORY_NOT_FOUND",
      `Directory ${directoryId} is not accessible`,
    );
  }
  if (found.entity.ownerId !== ownerId) {
    throw new ForbiddenError(
      "DIRECTORY_FORBIDDEN",
      `Directory ${directoryId} is owned by another user`,
    );
  }
  return found.entity;
}

export async function createNote({
  container,
  input,
}: ServiceArgs<CreateNoteInput>): Promise<CreateNoteOutput> {
  const now = container.clock.now();
  const id = container.idGenerator.next();
  const declaredLinks = liftDeclaredLinks(input.internalLinkRefs);
  const declaredTagNames = input.tagNames.map((name) => TagName.create(name));
  const title = NoteTitle.create(
    input.title.trim().length === 0 ? DEFAULT_NOTE_TITLE : input.title,
  );
  const frontMatter = FrontMatter.create(input.frontMatter);

  const result = await container.unitOfWorkProvider.run(
    async (ctx: UnitOfWorkContext) => {
      const ownerId = input.actorUserId;
      const directory = await resolveDirectory(
        ctx,
        ownerId,
        input.directoryId,
        now,
        container.idGenerator,
      );

      const assembled = await NoteService.assembleFromInputs(
        {
          ownerId,
          rawContent: input.contentHtml,
          declaredTagNames,
          declaredInternalLinkRefs: declaredLinks,
          selfNoteId: NoteId.create(id),
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

      const slug = await NoteService.generateUniqueSlug(
        ownerId,
        title,
        ctx.noteRepository,
      );

      const { entity: note, eventDrafts } = Note.create(
        {
          id,
          ownerId,
          directoryId: directory.id,
          slug,
          title,
          contentHtml: ContentHtml.create(assembled.html as string),
          frontMatter,
          tagIds: assembled.tagIds,
          internalLinkRefs: assembled.internalLinkRefs,
          mediaRefs: assembled.mediaRefs,
        },
        now,
      );

      await ctx.noteRepository.insert(note);
      ctx.collectEvents(eventDrafts);

      // Diff against the empty "before" set so every freshly-attached
      // media asset gets its ref count bumped.
      await MediaService.reconcileRefs(
        [],
        note.mediaRefs,
        now,
        ctx.mediaAssetRepository,
      );

      return note;
    },
  );

  return { note: toNoteView(result) };
}
