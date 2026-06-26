import type { DomainEventBase, EventDraft } from "@/core/domain/common/event";
import type { TagMergeJobId } from "./valueObject";

/**
 * Emitted when a tag-merge job is enqueued. The relay forwards the raw
 * outbox row to the queue, and `dispatchDomainEvent` routes this type to
 * `runTagMergeJob`. The payload carries only the `jobId` — the runner
 * re-reads the persisted job to recover source / target / progress.
 */
export type TagMergeRequestedEvent = DomainEventBase<
  "tag.merge.requested",
  Readonly<{ jobId: TagMergeJobId }>
>;

export type TagMergeJobEvent = TagMergeRequestedEvent;

// Domain factories return identity-less drafts; `EventId` is attached by
// the application layer so the domain remains free of `IdGenerator`
// concerns.
export const TagMergeEvents = {
  requested: (
    jobId: TagMergeJobId,
    occurredAt: Date,
  ): EventDraft<TagMergeRequestedEvent> => ({
    type: "tag.merge.requested",
    payload: { jobId },
    occurredAt,
    aggregateId: jobId,
  }),
};
