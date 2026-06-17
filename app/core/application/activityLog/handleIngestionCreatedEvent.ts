import type { IngestionJobCreatedEvent } from "@/core/domain/ingestion/events";
import type { ConsumerContainer } from "../di/types";

export type HandleIngestionCreatedEventInput = Readonly<{
  event: IngestionJobCreatedEvent;
}>;

/** UTC hour bucket key, e.g. "2026-06-17T08". */
function hourBucketOf(date: Date): string {
  return date.toISOString().slice(0, 13);
}

/**
 * Project an `ingestion.created` event into the burst intermediate table
 * (ADR-005 方式A).
 *
 * Each upload is inserted 1:1 keyed on `eventId` (`recordBurst` =
 * `ON CONFLICT(event_id) DO NOTHING`) — no count aggregation, so
 * at-least-once redelivery (including the fan-out retry of `runIngestionJob`
 * in the same dispatch case) never inflates the burst count. The
 * "大量アップロード" activity row is derived at read time from this table
 * (`getRecentActivity`), not written here.
 *
 * Resolving `ownerId` requires a read-only UoW lookup (the event payload
 * carries only `jobId`). When the job row is already gone the event is
 * skipped — a burst entry without an owner cannot contribute to per-owner
 * aggregation.
 */
export async function handleIngestionCreatedEvent({
  container,
  input,
}: {
  container: ConsumerContainer;
  input: HandleIngestionCreatedEventInput;
}): Promise<void> {
  const { event } = input;
  const jobId = event.payload.jobId;

  const ownerId = await container.unitOfWorkProvider.run(
    async ({ ingestionJobRepository }) => {
      const versioned = await ingestionJobRepository.findById(jobId);
      return versioned?.entity.ownerId ?? null;
    },
  );
  if (ownerId === null) return;

  await container.activityLogRepository.recordBurst({
    id: container.idGenerator.next(),
    eventId: event.id,
    ownerId,
    hourBucket: hourBucketOf(event.occurredAt),
    occurredAt: event.occurredAt,
  });
}
