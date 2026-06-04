import { ExportJob } from "@/core/domain/export/entity";
import type { ExportJobId as ExportJobIdBrand } from "@/core/domain/export/valueObject";
import { assertAdmin } from "../adminSettings/authorization";

import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type RetryExportJobInput = Readonly<{
  actorUserId: string;
  jobId: string;
}>;

/**
 * Admin-only retry of a failed export job (P46, spec G3).
 *
 * Drives the domain transition `failed → pending` and emits
 * `export.job.retryRequested` to the outbox. Queue consumer wiring is
 * tracked separately (ADR-002).
 */
export async function retryExportJob({
  container,
  input,
}: ServiceArgs<RetryExportJobInput>): Promise<void> {
  const now = container.clock.now();

  await container.unitOfWorkProvider.run(
    async ({ userRepository, exportJobRepository, collectEvents }) => {
      await assertAdmin(userRepository, input.actorUserId);

      const found = await exportJobRepository.findById(
        input.jobId as unknown as ExportJobIdBrand,
      );
      if (found === null) {
        throw new NotFoundError(
          "EXPORT_JOB_NOT_FOUND",
          `Export job not found: ${input.jobId}`,
        );
      }

      const transition = ExportJob.retry(found.entity, now);
      await exportJobRepository.save(transition.entity, found.expectedVersion);
      collectEvents(transition.eventDrafts);
    },
  );
}
