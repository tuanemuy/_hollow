import type { IngestionJobFailedEvent } from "@/core/domain/ingestion/events";
import type { ConsumerContainer } from "../di/types";

export type HandleIngestionFailedEventInput = Readonly<{
  event: IngestionJobFailedEvent;
}>;

/**
 * Project an `ingestion.failed` event into the activity log (Issue #595).
 *
 * Looks up the job through a read-only UoW so the "対象" column carries the
 * original file name and the actor handle (AC-5), then writes one row keyed
 * on `eventId`. The job may already be gone (purged) — in that case the row
 * still surfaces with the error summary and the raw id as the fallback
 * target, which is honest (the failure really happened).
 */
export async function handleIngestionFailedEvent({
  container,
  input,
}: {
  container: ConsumerContainer;
  input: HandleIngestionFailedEventInput;
}): Promise<void> {
  const { event } = input;
  const now = container.clock.now();
  const jobId = event.payload.jobId;

  const job = await container.unitOfWorkProvider.run(
    async ({ ingestionJobRepository }) => {
      const versioned = await ingestionJobRepository.findById(jobId);
      return versioned?.entity ?? null;
    },
  );

  await container.activityLogRepository.insertIfAbsent({
    id: container.idGenerator.next(),
    eventId: event.id,
    kind: "job_failed",
    actorId: job?.ownerId ?? null,
    target: job?.originalFileName ?? jobId,
    detail: event.payload.errorReason || event.payload.errorCode,
    severity: "error",
    occurredAt: event.occurredAt,
    createdAt: now,
  });
}
