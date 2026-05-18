import { IngestionJob } from "@/core/domain/ingestion/entity";
import type { IngestionJobId as IngestionJobIdBrand } from "@/core/domain/ingestion/valueObject";
import { assertAdmin } from "../adminSettings/authorization";
import type { UserId as UserIdDTO } from "../dto/identity";
import type { IngestionJobId } from "../dto/ingestion";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type RetryIngestionJobInput = Readonly<{
  actorUserId: UserIdDTO;
  jobId: IngestionJobId;
}>;

/**
 * Admin-only retry of a failed ingestion job (P46, spec G3).
 *
 * Drives the domain transition `failed → pending` and emits
 * `ingestion.retryRequested` to the outbox. The queue consumer wiring
 * that picks the re-enqueued job up is a separate concern tracked
 * outside this issue (see ADR-002).
 */
export async function retryIngestionJob({
  container,
  input,
}: ServiceArgs<RetryIngestionJobInput>): Promise<void> {
  const now = container.clock.now();

  await container.unitOfWorkProvider.run(
    async ({ userRepository, ingestionJobRepository, collectEvents }) => {
      await assertAdmin(userRepository, input.actorUserId);

      const found = await ingestionJobRepository.findById(
        input.jobId as unknown as IngestionJobIdBrand,
      );
      if (found === null) {
        throw new NotFoundError(
          "INGESTION_JOB_NOT_FOUND",
          `Ingestion job not found: ${input.jobId}`,
        );
      }

      const transition = IngestionJob.retry(found.entity, now);
      await ingestionJobRepository.save(
        transition.entity,
        found.expectedVersion,
      );
      collectEvents(transition.eventDrafts);
    },
  );
}
