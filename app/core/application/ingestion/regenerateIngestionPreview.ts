import { UserId } from "@/core/domain/identity/valueObject";
import { IngestionJob } from "@/core/domain/ingestion/entity";
import type { IngestionJobId as IngestionJobIdBrand } from "@/core/domain/ingestion/valueObject";
import type { UserId as UserIdDTO } from "../dto/identity";
import type { IngestionJobId } from "../dto/ingestion";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type RegenerateIngestionPreviewInput = Readonly<{
  actorUserId: UserIdDTO;
  jobId: IngestionJobId;
}>;

export type RegenerateIngestionPreviewOutput = Readonly<{
  jobId: IngestionJobId;
}>;

const MAX_REGENERATIONS = 5;

export async function regenerateIngestionPreview({
  container,
  input,
}: ServiceArgs<RegenerateIngestionPreviewInput>): Promise<RegenerateIngestionPreviewOutput> {
  const now = container.clock.now();
  const actor = UserId.create(input.actorUserId);

  await container.unitOfWorkProvider.run(
    async ({ ingestionJobRepository, collectEvents }) => {
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
      // `IngestionJob.regenerate` validates status === 'previewing' and
      // the regeneration cap; both surface as `BusinessRuleError` with
      // codes the presentation layer maps to 4xx.
      const transition = IngestionJob.regenerate(
        found.entity,
        now,
        MAX_REGENERATIONS,
      );
      await ingestionJobRepository.save(
        transition.entity,
        found.expectedVersion,
      );
      collectEvents(transition.eventDrafts);
    },
  );

  return { jobId: input.jobId };
}
