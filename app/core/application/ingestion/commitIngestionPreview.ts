import { Directory } from "@/core/domain/directory/entity";
import { DirectoryService } from "@/core/domain/directory/service";
import {
  DirectoryId,
  DirectoryName,
} from "@/core/domain/directory/valueObject";
import { BusinessRuleError } from "@/core/domain/error";
import { UserId } from "@/core/domain/identity/valueObject";
import { IngestionJob } from "@/core/domain/ingestion/entity";
import { IngestionErrorCode } from "@/core/domain/ingestion/errorCode";
import {
  isTempFileNotFoundError,
  isTempFileStorageUnavailableError,
} from "@/core/domain/ingestion/ports/tempFileStorage";
import type {
  IngestionJobId as IngestionJobIdBrand,
  IngestionPreview,
} from "@/core/domain/ingestion/valueObject";
import { Note } from "@/core/domain/note/entity";
import { NoteService } from "@/core/domain/note/service";
import {
  type FrontMatter,
  FrontMatter as FrontMatterVO,
  InternalLinkRef,
  type InternalLinkRef as InternalLinkRefType,
  NoteId,
  type NoteId as NoteIdBrand,
  NoteTitle,
} from "@/core/domain/note/valueObject";
import { TagName } from "@/core/domain/tag/valueObject";
import type { DirectoryId as DirectoryIdDTO } from "../dto/directory";
import type { UserId as UserIdDTO } from "../dto/identity";
import type { IngestionJobId } from "../dto/ingestion";
import type {
  FrontMatterDTO,
  InternalLinkRefDTO,
  NoteId as NoteIdDTO,
} from "../dto/note";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type CommitIngestionPreviewModifications = Readonly<{
  title?: string;
  directoryId?: DirectoryIdDTO;
  directoryNameToCreate?: string;
  frontMatter?: FrontMatterDTO;
  tagNames?: readonly string[];
  internalLinkRefs?: readonly InternalLinkRefDTO[];
  overwriteNoteId?: NoteIdDTO;
}>;

export type CommitIngestionPreviewInput = Readonly<{
  actorUserId: UserIdDTO;
  jobId: IngestionJobId;
  modifications: CommitIngestionPreviewModifications;
}>;

export type CommitIngestionPreviewOutput = Readonly<{
  noteId: NoteIdDTO;
}>;

export async function commitIngestionPreview({
  container,
  input,
}: ServiceArgs<CommitIngestionPreviewInput>): Promise<CommitIngestionPreviewOutput> {
  const now = container.clock.now();
  const actor = UserId.create(input.actorUserId);
  const mods = input.modifications;

  // Resolve the override directory name outside the UoW so the VO error
  // surfaces before any storage interaction.
  const directoryNameToCreate =
    mods.directoryNameToCreate !== undefined &&
    mods.directoryNameToCreate.trim().length > 0
      ? DirectoryName.create(mods.directoryNameToCreate)
      : null;
  const explicitTagNames = (mods.tagNames ?? []).map((raw) =>
    TagName.create(raw),
  );
  const declaredLinks: InternalLinkRefType[] = [];
  for (const ref of mods.internalLinkRefs ?? []) {
    if (ref.kind === "id") {
      declaredLinks.push(
        InternalLinkRef.create({
          kind: "id",
          target: ref.target,
          resolvedNoteId: NoteId.create(ref.target),
          displayText: ref.displayText,
        }),
      );
    } else {
      declaredLinks.push(
        InternalLinkRef.create({
          kind: "title",
          target: ref.target,
          displayText: ref.displayText,
        }),
      );
    }
  }

  const result = await container.unitOfWorkProvider.run(
    async ({
      ingestionJobRepository,
      noteRepository,
      directoryRepository,
      tagRepository,
      tagBlacklistRepository,
      mediaAssetRepository,
      collectEvents,
    }) => {
      const found = await ingestionJobRepository.findById(
        input.jobId as unknown as IngestionJobIdBrand,
      );
      if (found === null) {
        throw new NotFoundError(
          "INGESTION_JOB_NOT_FOUND",
          `Ingestion job not found: ${input.jobId}`,
        );
      }
      if (found.entity.ownerId !== actor) {
        throw new ForbiddenError(
          "INGESTION_JOB_FORBIDDEN",
          `Ingestion job ${input.jobId} is not owned by ${actor}`,
        );
      }
      if (!IngestionJob.isPreviewing(found.entity)) {
        throw new BusinessRuleError(
          IngestionErrorCode.InvalidStateForCommit,
          `Cannot commit job in state: ${found.entity.status}`,
        );
      }

      const preview = found.entity.preview;

      // Resolve target directory: explicit id > newly created directory >
      // preview's suggested id > owner's root.
      let directoryId = await resolveDirectoryId({
        actor,
        explicitId:
          mods.directoryId === undefined
            ? null
            : DirectoryId.create(mods.directoryId),
        nameToCreate: directoryNameToCreate,
        suggested: preview.suggestedDirectoryId,
        repo: directoryRepository,
        idGen: container.idGenerator,
        now,
      });

      const title = NoteTitle.create(
        mods.title !== undefined && mods.title.trim().length > 0
          ? mods.title
          : (preview.title as string),
      );

      const frontMatter: FrontMatter =
        mods.frontMatter === undefined
          ? preview.frontMatter
          : FrontMatterVO.create(
              mods.frontMatter as Parameters<typeof FrontMatterVO.create>[0],
            );

      const mergedTagNames = [
        ...explicitTagNames,
        ...preview.suggestedTagNames,
      ];

      const assembled = await NoteService.assembleFromInputs(
        {
          ownerId: actor,
          rawContent: preview.contentHtml as string,
          declaredTagNames: mergedTagNames,
          declaredInternalLinkRefs: [
            ...declaredLinks,
            ...preview.internalLinkRefs,
          ],
        },
        {
          sanitizer: container.htmlSanitizer,
          tagRepo: tagRepository,
          blacklistRepo: tagBlacklistRepository,
          noteRepo: noteRepository,
          mediaRepo: mediaAssetRepository,
          mintTagId: () => container.idGenerator.next(),
          now,
        },
      );

      let noteId: NoteIdBrand;
      if (mods.overwriteNoteId !== undefined) {
        const targetId = NoteId.create(mods.overwriteNoteId);
        const target = await noteRepository.findById(targetId);
        if (target === null) {
          throw new NotFoundError(
            "NOTE_NOT_FOUND",
            `Note not found: ${targetId}`,
          );
        }
        if (target.entity.ownerId !== actor) {
          throw new ForbiddenError(
            "NOTE_FORBIDDEN",
            `Note ${targetId} is not owned by ${actor}`,
          );
        }
        const updated = Note.updateContent(target.entity, {
          title,
          contentHtml: assembled.html,
          frontMatter,
          tagIds: assembled.tagIds,
          internalLinkRefs: assembled.internalLinkRefs,
          mediaRefs: assembled.mediaRefs,
          now,
          actorUserId: actor,
          requireLock: false,
        });
        await noteRepository.save(updated.entity, target.expectedVersion);
        collectEvents(updated.eventDrafts);
        noteId = target.entity.id;
        directoryId = target.entity.directoryId;
      } else {
        const slug = await NoteService.generateUniqueSlug(
          actor,
          title,
          noteRepository,
        );
        const newId = container.idGenerator.next();
        const created = Note.create(
          {
            id: newId,
            ownerId: actor,
            directoryId,
            slug,
            title,
            contentHtml: assembled.html,
            frontMatter,
            tagIds: assembled.tagIds,
            internalLinkRefs: assembled.internalLinkRefs,
            mediaRefs: assembled.mediaRefs,
          },
          now,
        );
        await noteRepository.insert(created.entity);
        collectEvents(created.eventDrafts);
        noteId = created.entity.id;
      }

      const commit = IngestionJob.commit(found.entity, noteId, now);
      await ingestionJobRepository.save(commit.entity, found.expectedVersion);
      collectEvents(commit.eventDrafts);

      return {
        noteId,
        tempStorageKey: found.entity.tempStorageKey,
      };
    },
  );

  if (result.tempStorageKey !== null) {
    try {
      await container.tempFileStorage.delete(result.tempStorageKey as string);
    } catch (cause) {
      if (
        !isTempFileNotFoundError(cause) &&
        !isTempFileStorageUnavailableError(cause)
      ) {
        throw cause;
      }
      container.logger.warn("ingestion.commit.temp_delete_failed", {
        jobId: input.jobId,
        cause: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  return { noteId: result.noteId as unknown as NoteIdDTO };
}

/**
 * Resolve which directory the new note should live in.
 *
 * Precedence — first hit wins:
 *   1. Caller-supplied `explicitId` (must be owned).
 *   2. Caller-supplied `nameToCreate` — provisions a new directory under
 *      the owner's root.
 *   3. The preview's `suggestedDirectoryId` (when the user accepted the
 *      LLM proposal as-is).
 *   4. The owner's root directory.
 */
async function resolveDirectoryId(args: {
  actor: UserId;
  explicitId: DirectoryId | null;
  nameToCreate: DirectoryName | null;
  suggested: IngestionPreview["suggestedDirectoryId"];
  repo: import("@/core/domain/directory/ports/directoryRepository").DirectoryRepository;
  idGen: import("@/core/application/ports/idGenerator").IdGenerator;
  now: Date;
}): Promise<DirectoryId> {
  if (args.explicitId !== null) {
    const found = await args.repo.findById(args.explicitId);
    if (found === null) {
      throw new NotFoundError(
        "DIRECTORY_NOT_FOUND",
        `Directory not found: ${args.explicitId}`,
      );
    }
    if (found.entity.ownerId !== args.actor) {
      throw new ForbiddenError(
        "DIRECTORY_FORBIDDEN",
        `Directory ${args.explicitId} is not owned by ${args.actor}`,
      );
    }
    return found.entity.id;
  }

  if (args.nameToCreate !== null) {
    const root = await DirectoryService.ensureRoot(
      args.actor,
      args.now,
      args.idGen,
      args.repo,
    );
    await DirectoryService.assertSiblingNameUnique(
      root.id,
      args.actor,
      args.nameToCreate,
      null,
      args.repo,
    );
    const directory = Directory.create(
      {
        id: args.idGen.next(),
        ownerId: args.actor,
        parent: root,
        name: args.nameToCreate,
      },
      args.now,
    );
    await args.repo.insert(directory);
    return directory.id;
  }

  if (args.suggested !== null) {
    const found = await args.repo.findById(args.suggested);
    if (found !== null && found.entity.ownerId === args.actor) {
      return found.entity.id;
    }
    // Suggested directory missing or no longer owned — fall through to
    // the user's root rather than failing the commit.
  }

  const root = await DirectoryService.ensureRoot(
    args.actor,
    args.now,
    args.idGen,
    args.repo,
  );
  return root.id;
}
