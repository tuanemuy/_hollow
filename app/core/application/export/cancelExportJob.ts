import { BusinessRuleError } from "@/core/domain/error";
import { ExportJob } from "@/core/domain/export/entity";
import { ExportErrorCode } from "@/core/domain/export/errorCode";
import type { ExportJobId as ExportJobIdBrand } from "@/core/domain/export/valueObject";
import type { UserId as UserIdBrand } from "@/core/domain/identity/valueObject";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import { type ExportJobDTO, toExportJobView } from "./view";

export type CancelExportJobInput = Readonly<{
  actorUserId: string;
  jobId: string;
}>;

export type CancelExportJobOutput = Readonly<{
  job: ExportJobDTO;
}>;

/**
 * Cancel a `pending` or `processing` export job. Already-finished jobs
 * (completed / failed / cancelled / expired) raise
 * `BusinessRuleError('export_already_finished')` — the spec uses this
 * literal rather than the `ExportErrorCode.IllegalTransition` constant
 * to keep the wire contract stable.
 *
 * Any artifact already uploaded for a completed job is **not** removed
 * here — completion is the terminal state from which `cancel` is
 * rejected. For `processing` jobs that wrote an artifact before being
 * cancelled, the artifact is deleted post-commit so the storage path is
 * idempotent against transient backend failures.
 */
export async function cancelExportJob({
  container,
  input,
}: ServiceArgs<CancelExportJobInput>): Promise<CancelExportJobOutput> {
  const now = container.clock.now();

  const { job, artifactKey } = await container.unitOfWorkProvider.run(
    async ({ exportJobRepository, collectEvents }) => {
      const found = await exportJobRepository.findById(
        input.jobId as ExportJobIdBrand,
      );
      if (found === null) {
        throw new NotFoundError(
          "EXPORT_JOB_NOT_FOUND",
          `Export job not found: ${input.jobId}`,
        );
      }
      ExportJob.assertOwnedBy(found.entity, input.actorUserId as UserIdBrand);
      if (
        !ExportJob.isPending(found.entity) &&
        !ExportJob.isProcessing(found.entity)
      ) {
        throw new BusinessRuleError(
          ExportErrorCode.IllegalTransition,
          "export_already_finished",
        );
      }
      const { entity, eventDrafts } = ExportJob.cancel(found.entity, now);
      await exportJobRepository.save(entity, found.expectedVersion);
      collectEvents(eventDrafts);
      return { job: entity, artifactKey: null as string | null };
    },
  );

  if (artifactKey !== null) {
    try {
      await container.objectStorage.delete(artifactKey);
    } catch (error) {
      container.logger.warn(
        `[export] failed to delete artifact during cancel: ${artifactKey}`,
        { jobId: job.id, cause: error },
      );
    }
  }

  return { job: toExportJobView(job) };
}
