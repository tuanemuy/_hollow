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
import { MediaAsset } from "@/core/domain/media/entity";
import type { MediaAssetId } from "@/core/domain/media/valueObject";
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
import { buildStorageKey, safeStoragePut } from "../media/uploadMedia";
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

  // Resolve the override directory path outside the UoW so VO errors
  // (forbidden chars / over-long / too deep segments) surface before any
  // storage interaction. A `/`-delimited path is split into one
  // `DirectoryName` per segment; the commit then ensures each in turn.
  const directorySegmentsToCreate = parseDirectoryPathToCreate(
    mods.directoryNameToCreate,
  );
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

  // Stage (a) — persist the source file BEFORE the UoW (Issue #452 plan
  // step 7). R2 has no two-phase commit, so the canonical ordering is
  // "put bytes first, then persist metadata" (matches `uploadMedia`).
  // The job is read here only as a projection to source the bytes /
  // mime / size / file name; the in-UoW read below still captures the
  // OCC `expectedVersion`. When `put` succeeds but the DB later rolls
  // back, the R2 blob is orphaned with no `MediaAsset` row to drive its
  // reclaim — an accepted edge for the (rare) commit DB failure, same as
  // `uploadMedia`'s pending-row orphan tolerance.
  const sourcePersist = await prepareSourcePersist({ container, input, actor });

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

      // Resolve target directory: explicit id > newly created path >
      // preview's suggested id > preview's suggested new path > owner's root.
      const directoryId = await resolveDirectoryId({
        actor,
        explicitId:
          mods.directoryId === undefined
            ? null
            : DirectoryId.create(mods.directoryId),
        segmentsToCreate: directorySegmentsToCreate,
        suggestedId: preview.suggestedDirectoryId,
        suggestedNameSegments: parseDirectoryPathToCreate(
          preview.suggestedDirectoryName ?? undefined,
        ),
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

      // Determine the destination note id up front so it can be excluded
      // from internal-link title resolution (self-link, ADR-005). The
      // overwrite target is fetched / authorised here; the create path
      // mints its id ahead of assembly.
      const overwriteRaw = mods.overwriteNoteId;
      const overwriteTarget =
        overwriteRaw === undefined
          ? null
          : await (async () => {
              const targetId = NoteId.create(overwriteRaw);
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
              return target;
            })();
      const selfNoteId =
        overwriteTarget !== null
          ? overwriteTarget.entity.id
          : NoteId.create(container.idGenerator.next());

      const assembled = await NoteService.assembleFromInputs(
        {
          ownerId: actor,
          rawContent: preview.contentHtml as string,
          declaredTagNames: mergedTagNames,
          declaredInternalLinkRefs: [
            ...declaredLinks,
            ...preview.internalLinkRefs,
          ],
          selfNoteId,
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

      // Stage (b) — persist the source MediaAsset (pending → attached,
      // refCount=1) and bind it to the note via `sourceFileId`. On an
      // overwrite that replaces an existing source, the old asset is
      // detached with `decrementRef` (→ orphan) so the standard purge
      // worker reclaims its blob (Issue #452 ADR-005).
      let sourceFileId: MediaAssetId | null = null;
      if (sourcePersist !== null) {
        const { entity: pending } = MediaAsset.create(
          {
            id: sourcePersist.mediaId,
            ownerId: actor,
            kind: "source",
            mimeType: sourcePersist.mimeType,
            byteSize: sourcePersist.byteSize,
            storageKey: sourcePersist.storageKey,
            originalFileName: sourcePersist.originalFileName,
          },
          now,
        );
        const attached = MediaAsset.markAttached(pending, now);
        await mediaAssetRepository.save(attached.entity);
        collectEvents(attached.eventDrafts);
        sourceFileId = attached.entity.id;
      }

      let noteId: NoteIdBrand;
      if (overwriteTarget !== null) {
        const target = overwriteTarget;
        const previousSourceFileId = target.entity.sourceFileId;
        const updated = Note.updateContent(target.entity, {
          title,
          contentHtml: assembled.html,
          frontMatter,
          tagIds: assembled.tagIds,
          internalLinkRefs: assembled.internalLinkRefs,
          mediaRefs: assembled.mediaRefs,
          // Only swap the binding when a new source was persisted;
          // otherwise leave the existing one untouched.
          ...(sourceFileId !== null ? { sourceFileId } : {}),
          now,
          actorUserId: actor,
          requireLock: false,
        });
        await noteRepository.save(updated.entity, target.expectedVersion);
        collectEvents(updated.eventDrafts);
        noteId = target.entity.id;

        if (
          sourceFileId !== null &&
          previousSourceFileId !== null &&
          previousSourceFileId !== sourceFileId
        ) {
          const oldAsset =
            await mediaAssetRepository.findById(previousSourceFileId);
          if (
            oldAsset !== null &&
            oldAsset.status !== "orphan" &&
            oldAsset.status !== "deleting"
          ) {
            const detached = MediaAsset.decrementRef(oldAsset, now);
            await mediaAssetRepository.save(detached.entity);
            collectEvents(detached.eventDrafts);
          }
        }
      } else {
        const slug = await NoteService.generateUniqueSlug(
          actor,
          title,
          noteRepository,
        );
        const created = Note.create(
          {
            id: selfNoteId,
            ownerId: actor,
            directoryId,
            slug,
            title,
            contentHtml: assembled.html,
            frontMatter,
            tagIds: assembled.tagIds,
            internalLinkRefs: assembled.internalLinkRefs,
            mediaRefs: assembled.mediaRefs,
            sourceFileId,
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

type SourcePersist = Readonly<{
  mediaId: string;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  originalFileName: string;
}>;

/**
 * Stage (a) of the source-file persistence flow (Issue #452 plan step 7).
 *
 * Reads the ingestion job as a projection (the OCC read happens inside the
 * UoW below), and — when the job still has a staged temp file — mints the
 * source `MediaAsset` id, fetches the bytes from temp storage, and copies
 * them to permanent object storage under `{ownerId}/source/{mediaId}`.
 * Returns `null` when there is no temp file to persist (e.g. a re-driven
 * job whose temp key was already reclaimed), in which case the note keeps
 * no bound source file.
 *
 * The instance upload limit is intentionally NOT re-checked here: the file
 * was already accepted at ingestion-upload time and commit is a
 * confirmation step (ADR-004).
 */
async function prepareSourcePersist({
  container,
  input,
  actor,
}: {
  container: ServiceArgs<CommitIngestionPreviewInput>["container"];
  input: CommitIngestionPreviewInput;
  actor: UserId;
}): Promise<SourcePersist | null> {
  const job = await container.unitOfWorkProvider.run(
    ({ ingestionJobRepository }) =>
      ingestionJobRepository.findById(
        input.jobId as unknown as IngestionJobIdBrand,
      ),
  );
  if (job === null) return null;
  if (job.entity.ownerId !== actor) return null;
  if (job.entity.tempStorageKey === null) return null;
  if (!IngestionJob.isPreviewing(job.entity)) return null;

  const mediaId = container.idGenerator.next();
  const storageKey = buildStorageKey(actor, "source", mediaId);
  let bytes: ArrayBuffer;
  try {
    bytes = await container.tempFileStorage.get(
      job.entity.tempStorageKey as string,
    );
  } catch (cause) {
    // The temp blob is gone (e.g. a re-driven job whose temp key was
    // already reclaimed): skip source persistence and let the commit
    // proceed without a bound source file. Transient backend failures
    // rethrow so the operation is retried.
    if (isTempFileNotFoundError(cause)) {
      container.logger.warn("ingestion.commit.source_temp_missing", {
        jobId: input.jobId,
        cause: cause.message,
      });
      return null;
    }
    throw cause;
  }
  await safeStoragePut(() =>
    container.objectStorage.put(storageKey, bytes, job.entity.mimeType),
  );

  return {
    mediaId,
    storageKey,
    mimeType: job.entity.mimeType,
    byteSize: job.entity.byteSize,
    originalFileName: job.entity.originalFileName,
  };
}

/**
 * Split a `/`-delimited directory path into one `DirectoryName` per
 * segment. Each segment is validated by `DirectoryName.create` (forbidden
 * chars / length) so a malformed segment surfaces a `BusinessRuleError`
 * before any storage interaction. Empty / whitespace-only input yields an
 * empty array, which `resolveDirectoryId` treats as "no new path".
 */
function parseDirectoryPathToCreate(
  raw: string | undefined,
): readonly DirectoryName[] {
  if (raw === undefined) return [];
  return raw
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((segment) => DirectoryName.create(segment));
}

/**
 * Resolve which directory the new note should live in.
 *
 * Precedence — first hit wins:
 *   1. Caller-supplied `explicitId` (must be owned).
 *   2. Caller-supplied `segmentsToCreate` — ensures a (possibly nested)
 *      new path under the owner's root, reusing existing intermediates.
 *   3. The preview's `suggestedId` (when the user accepted the LLM's
 *      existing-directory match as-is).
 *   4. The preview's `suggestedNameSegments` — the LLM's new nested-path
 *      proposal, ensured the same way as (2).
 *   5. The owner's root directory.
 */
async function resolveDirectoryId(args: {
  actor: UserId;
  explicitId: DirectoryId | null;
  segmentsToCreate: readonly DirectoryName[];
  suggestedId: IngestionPreview["suggestedDirectoryId"];
  suggestedNameSegments: readonly DirectoryName[];
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

  if (args.segmentsToCreate.length > 0) {
    return DirectoryService.ensureNestedPath(
      args.actor,
      args.segmentsToCreate,
      args.now,
      args.idGen,
      args.repo,
    );
  }

  if (args.suggestedId !== null) {
    const found = await args.repo.findById(args.suggestedId);
    if (found !== null && found.entity.ownerId === args.actor) {
      return found.entity.id;
    }
    // Suggested directory missing or no longer owned — fall through to
    // the suggested new path / root rather than failing the commit.
  }

  // `ensureNestedPath` returns the root id for an empty segment list, so
  // the suggested-new-path and root-fallback cases collapse into one call.
  return DirectoryService.ensureNestedPath(
    args.actor,
    args.suggestedNameSegments,
    args.now,
    args.idGen,
    args.repo,
  );
}
