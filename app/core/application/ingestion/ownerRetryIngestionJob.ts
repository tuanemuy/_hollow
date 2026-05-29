import { UserId } from "@/core/domain/identity/valueObject";
import { IngestionJob } from "@/core/domain/ingestion/entity";
import type { IngestionJobId as IngestionJobIdBrand } from "@/core/domain/ingestion/valueObject";
import type { UserId as UserIdDTO } from "../dto/identity";
import type { IngestionJobId } from "../dto/ingestion";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type OwnerRetryIngestionJobInput = Readonly<{
  actorUserId: UserIdDTO;
  jobId: IngestionJobId;
}>;

export type OwnerRetryIngestionJobOutput = Readonly<{
  jobId: IngestionJobId;
}>;

/**
 * Owner-driven retry of a failed ingestion job (spec/scenario/ingest.md B1
 * 異常系). Mirrors the owner authorization of `regenerateIngestionPreview` /
 * `discardIngestionPreview`: the actor must own the job. Distinct from the
 * admin-only `retryIngestionJob` (P46), which authorizes via `assertAdmin`.
 *
 * Drives the shared domain transition `IngestionJob.retry` (`failed → pending`)
 * and emits `ingestion.retryRequested`; the dispatcher routes that event to
 * `runIngestionJob`, re-driving the LLM pipeline (see Issue #253 / .issue/254).
 */
export async function ownerRetryIngestionJob({
  container,
  input,
}: ServiceArgs<OwnerRetryIngestionJobInput>): Promise<OwnerRetryIngestionJobOutput> {
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
      // `IngestionJob.retry` validates status === 'failed' and a present
      // tempStorageKey; both surface as `BusinessRuleError` with codes the
      // presentation layer maps to 4xx. owner retry has no per-job retry
      // cap — cost control is delegated to instance-level upload limits
      // (see .issue/254/adr.md ADR-002).
      const transition = IngestionJob.retry(found.entity, now);
      await ingestionJobRepository.save(
        transition.entity,
        found.expectedVersion,
      );
      collectEvents(transition.eventDrafts);
    },
  );

  return { jobId: input.jobId };
}
