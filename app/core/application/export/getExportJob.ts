import { ExportJob } from "@/core/domain/export/entity";
import type { ExportJobId as ExportJobIdBrand } from "@/core/domain/export/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import { type ExportJobDTO, toExportJobView } from "./view";

export type GetExportJobInput = Readonly<{
  actorUserId: UserId;
  jobId: string;
}>;

export type GetExportJobOutput = Readonly<{
  job: ExportJobDTO;
}>;

/**
 * Read-only fetch with ownership check. The repository's `findById`
 * returns a `Versioned<ExportJob>` because the port is OCC-aware; this
 * usecase ignores the version token because no write follows.
 */
export async function getExportJob({
  container,
  input,
}: ServiceArgs<GetExportJobInput>): Promise<GetExportJobOutput> {
  const job = await container.unitOfWorkProvider.run(
    async ({ exportJobRepository }) => {
      const found = await exportJobRepository.findById(
        input.jobId as ExportJobIdBrand,
      );
      if (found === null) {
        throw new NotFoundError(
          "EXPORT_JOB_NOT_FOUND",
          `Export job not found: ${input.jobId}`,
        );
      }
      ExportJob.assertOwnedBy(found.entity, input.actorUserId);
      return found.entity;
    },
  );
  return { job: toExportJobView(job) };
}
