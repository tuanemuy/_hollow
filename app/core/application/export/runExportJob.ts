import { ExportJob } from "@/core/domain/export/entity";
import { isArchiveError } from "@/core/domain/export/ports/archiveBuilder";
import { isPDFRenderError } from "@/core/domain/export/ports/pdfRenderer";
import {
  type ExportAssemblyDeps,
  ExportService,
} from "@/core/domain/export/service";
import type { ExportJobId as ExportJobIdBrand } from "@/core/domain/export/valueObject";
import { isStorageUnavailableError } from "@/core/domain/media/ports/objectStorage";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { ServiceArgs } from "../types";
import { resolveExportDesignTokens } from "./designTokens";
import { type ExportJobDTO, toExportJobView } from "./view";

export type RunExportJobInput = Readonly<{
  jobId: string;
}>;

export type RunExportJobOutput = Readonly<{
  job: ExportJobDTO | null;
}>;

const DEFAULT_TTL_SEC = 7 * 24 * 60 * 60;

function artifactExtension(format: ExportJob["format"]): string {
  switch (format) {
    case "html":
      return "html";
    case "markdown":
      return "md";
    case "pdf":
      return "pdf";
  }
}

function artifactContentType(
  scope: ExportJob["scope"],
  format: ExportJob["format"],
): string {
  if (scope !== "single") return "application/zip";
  switch (format) {
    case "html":
      return "text/html";
    case "markdown":
      return "text/markdown";
    case "pdf":
      return "application/pdf";
  }
}

function artifactKeyFor(job: ExportJob): string {
  if (job.scope === "single") {
    return `exports/${job.ownerId}/${job.id}.${artifactExtension(job.format)}`;
  }
  return `exports/${job.ownerId}/${job.id}.zip`;
}

/**
 * Worker-side bulk export pipeline. Resolves the target note set,
 * transitions the job through `processing` → `completed` (or `failed`),
 * uploads the artifact via `ObjectStorage.put`, and records per-note
 * failures.
 *
 * The transition lifecycle is split across multiple UoW boundaries so
 * each state change commits independently — long renderer runs do not
 * hold the deferred-batch write set open, and a worker crash mid-render
 * leaves the job in `processing`. The next dispatch sees that state
 * and skips the run, leaving the operator to either reset the row or
 * let it expire.
 */
export async function runExportJob({
  container,
  input,
}: ServiceArgs<RunExportJobInput>): Promise<RunExportJobOutput> {
  const jobId = input.jobId as ExportJobIdBrand;
  const startedJob = await transitionPendingToProcessing(container, jobId);
  if (startedJob === null) return { job: null };

  try {
    const targetNoteIds = await container.unitOfWorkProvider.run(
      async ({ noteRepository, tagRepository }) =>
        ExportService.resolveTargetNotes(startedJob, {
          noteRepo: noteRepository,
          tagRepo: tagRepository,
        }),
    );

    if (targetNoteIds.length === 0) {
      const failed = await failJob(
        container,
        jobId,
        "export_no_targets",
        "Export has zero target notes",
      );
      return { job: failed === null ? null : toExportJobView(failed) };
    }

    const completed = await assembleAndComplete(
      container,
      startedJob.id,
      targetNoteIds,
    );
    return { job: completed === null ? null : toExportJobView(completed) };
  } catch (error) {
    const { code, reason } = classifyRunError(error);
    const failed = await failJob(container, jobId, code, reason);
    return { job: failed === null ? null : toExportJobView(failed) };
  }
}

async function transitionPendingToProcessing(
  container: ServiceArgs<RunExportJobInput>["container"],
  jobId: ExportJobIdBrand,
): Promise<ExportJob | null> {
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(
    async ({ exportJobRepository, collectEvents }) => {
      const found = await exportJobRepository.findById(jobId);
      if (found === null) return null;
      if (!ExportJob.isPending(found.entity)) return null;
      // `startProcessing` requires a `total`; we re-record the precise
      // count after `resolveTargetNotes` runs. Seed with 0 so the job
      // moves to `processing` even when the view-scope resolver fails
      // (the failure path still transitions through `failed`).
      const { entity, eventDrafts } = ExportJob.startProcessing(
        found.entity,
        0,
        now,
      );
      await exportJobRepository.save(entity, found.expectedVersion);
      collectEvents(eventDrafts);
      return entity;
    },
  );
}

async function assembleAndComplete(
  container: ServiceArgs<RunExportJobInput>["container"],
  jobId: ExportJobIdBrand,
  resolvedNoteIds: readonly NoteId[],
): Promise<ExportJob | null> {
  const snapshot = await container.unitOfWorkProvider.run(
    async ({ exportJobRepository, instanceSettingsRepository }) => {
      const found = await exportJobRepository.findById(jobId);
      if (found === null) return null;
      // Only html/pdf artifacts inject `:root` design tokens; markdown-only
      // jobs skip the instance-settings read (avoids a needless query).
      const needsDesignTokens =
        found.entity.format === "html" || found.entity.format === "pdf";
      const designTokens = needsDesignTokens
        ? resolveExportDesignTokens(
            (await instanceSettingsRepository.get()).entity,
          )
        : {};
      return { job: found.entity, designTokens };
    },
  );
  if (snapshot === null) return null;
  const jobSnapshot = snapshot.job;
  if (!ExportJob.isProcessing(jobSnapshot)) return null;

  // Substitute the freshly-resolved note ids for the rendering path so
  // view-scope jobs see the live result set. The persisted aggregate's
  // `targetNoteIds` stays empty (the view query is the canonical
  // source of truth there); the service's `assembleArtifact` reads
  // only `targetNoteIds` and immutable fields from this in-memory
  // object.
  const renderJob: ExportJob = {
    ...jobSnapshot,
    targetNoteIds: resolvedNoteIds,
  };

  const deps = buildAssemblyDeps(container, renderJob, snapshot.designTokens);
  const { key, size } = await ExportService.assembleArtifact(renderJob, deps);

  return container.unitOfWorkProvider.run(
    async ({ exportJobRepository, collectEvents }) => {
      const found = await exportJobRepository.findById(jobId);
      if (found === null) return null;
      if (!ExportJob.isProcessing(found.entity)) return null;
      const { entity, eventDrafts } = ExportJob.complete(
        found.entity,
        key,
        size,
        container.clock.now(),
        DEFAULT_TTL_SEC,
      );
      await exportJobRepository.save(entity, found.expectedVersion);
      collectEvents(eventDrafts);
      return entity;
    },
  );
}

function buildAssemblyDeps(
  container: ServiceArgs<RunExportJobInput>["container"],
  job: ExportJob,
  designTokens: Readonly<Record<string, string>>,
): ExportAssemblyDeps {
  return {
    // The service reads notes / media through these ports; each access
    // opens a fresh UoW so we do not hold a write set open across
    // streaming renders.
    noteRepo: {
      async findById(id) {
        return container.unitOfWorkProvider.run(async ({ noteRepository }) =>
          noteRepository.findById(id),
        );
      },
      async findByOwnerAndSlug() {
        return null;
      },
      async findByDirectory() {
        return [];
      },
      async findByIds(ids: readonly NoteId[]) {
        throw new Error(
          `runExportJob: noteRepo.findByIds is not implemented (received ${ids.length} ids)`,
        );
      },
      async findByOwner() {
        return [];
      },
      async searchByTitlePrefix() {
        return [];
      },
      async findActiveByOwnerAndTitle() {
        return [];
      },
      async findTrashedOlderThan() {
        return [];
      },
      async findReferrers() {
        return [];
      },
      async findUnresolvedTitleLinkRows() {
        return [];
      },
      async findUnresolvedIdLinkRows() {
        return [];
      },
      async findResolvedLinkRowsByTarget() {
        return [];
      },
      async setLinkResolution() {},
      async trashByDirectory() {
        return [];
      },
      async purge() {},
      async countByOwner() {
        return 0;
      },
      // Export pipeline never lists owner-scoped notes through this stub.
      async listWithCount() {
        return { items: [], count: 0 };
      },
      async insert() {},
      async save() {},
      async delete() {},
    },
    mediaRepo: {
      async findById(id) {
        return container.unitOfWorkProvider.run(
          async ({ mediaAssetRepository }) => mediaAssetRepository.findById(id),
        );
      },
      async findByIds(ids) {
        return container.unitOfWorkProvider.run(
          async ({ mediaAssetRepository }) =>
            mediaAssetRepository.findByIds(ids),
        );
      },
      async findByOwner() {
        return [];
      },
      async aggregateByOwner() {
        return { count: 0, totalBytes: 0 };
      },
      async findPurgeableOlderThan() {
        return [];
      },
      async save() {},
      async delete() {},
    },
    storage: container.objectStorage,
    pdfRenderer: container.pdfRenderer,
    markdownRenderer: container.markdownRenderer,
    htmlRenderer: container.htmlRenderer,
    archiveBuilder: container.archiveBuilder,
    designTokens,
    artifactKey: () => artifactKeyFor(job),
    artifactContentType: artifactContentType(job.scope, job.format),
  };
}

async function failJob(
  container: ServiceArgs<RunExportJobInput>["container"],
  jobId: ExportJobIdBrand,
  code: string,
  reason: string,
): Promise<ExportJob | null> {
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(
    async ({ exportJobRepository, collectEvents }) => {
      const found = await exportJobRepository.findById(jobId);
      if (found === null) return null;
      if (
        !ExportJob.isPending(found.entity) &&
        !ExportJob.isProcessing(found.entity)
      ) {
        return found.entity;
      }
      const { entity, eventDrafts } = ExportJob.fail(
        found.entity,
        code,
        reason,
        now,
      );
      await exportJobRepository.save(entity, found.expectedVersion);
      collectEvents(eventDrafts);
      return entity;
    },
  );
}

function classifyRunError(error: unknown): { code: string; reason: string } {
  if (isPDFRenderError(error)) {
    return { code: "pdf_render_error", reason: describe(error) };
  }
  if (isArchiveError(error)) {
    return { code: "archive_error", reason: describe(error) };
  }
  if (isStorageUnavailableError(error)) {
    return { code: "storage_unavailable", reason: describe(error) };
  }
  return { code: "export_run_failed", reason: describe(error) };
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}
