import { UserId } from "@/core/domain/identity/valueObject";
import type { IngestionJobId as IngestionJobIdBrand } from "@/core/domain/ingestion/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import { type IngestionJobView, toIngestionJobView } from "./view";

export type GetIngestionJobInput = Readonly<{
  actorUserId: string;
  jobId: string;
}>;

export type GetIngestionJobOutput = Readonly<{
  job: IngestionJobView;
}>;

export async function getIngestionJob({
  container,
  input,
}: ServiceArgs<GetIngestionJobInput>): Promise<GetIngestionJobOutput> {
  const actor = UserId.create(input.actorUserId);

  const job = await container.unitOfWorkProvider.run(
    async ({ ingestionJobRepository }) => {
      const found = await ingestionJobRepository.findById(
        input.jobId as IngestionJobIdBrand,
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
      return found.entity;
    },
  );

  return { job: toIngestionJobView(job) };
}
