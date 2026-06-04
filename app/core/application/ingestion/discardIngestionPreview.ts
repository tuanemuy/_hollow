import { UserId } from "@/core/domain/identity/valueObject";
import { IngestionJob } from "@/core/domain/ingestion/entity";
import {
  isTempFileNotFoundError,
  isTempFileStorageUnavailableError,
} from "@/core/domain/ingestion/ports/tempFileStorage";
import type { IngestionJobId as IngestionJobIdBrand } from "@/core/domain/ingestion/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type DiscardIngestionPreviewInput = Readonly<{
  actorUserId: string;
  jobId: string;
}>;

export async function discardIngestionPreview({
  container,
  input,
}: ServiceArgs<DiscardIngestionPreviewInput>): Promise<void> {
  const now = container.clock.now();
  const actor = UserId.create(input.actorUserId);

  const tempKey = await container.unitOfWorkProvider.run(
    async ({ ingestionJobRepository, collectEvents }) => {
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
      const previousKey = found.entity.tempStorageKey;
      const transition = IngestionJob.discard(found.entity, now);
      await ingestionJobRepository.save(
        transition.entity,
        found.expectedVersion,
      );
      collectEvents(transition.eventDrafts);
      return previousKey;
    },
  );

  if (tempKey === null) return;
  try {
    await container.tempFileStorage.delete(tempKey as string);
  } catch (cause) {
    // Deletion is best-effort — the orphan blob is reclaimed by the
    // pruner. Surface only unexpected error shapes so the operator
    // notices a misbehaving adapter.
    if (
      !isTempFileNotFoundError(cause) &&
      !isTempFileStorageUnavailableError(cause)
    ) {
      throw cause;
    }
    container.logger.warn("ingestion.discard.temp_delete_failed", {
      jobId: input.jobId,
      cause: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
