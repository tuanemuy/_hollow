import type { DomainEventBase, EventDraft } from "@/core/domain/common/event";
import type { TagId } from "./valueObject";

export type TagDeletedEvent = DomainEventBase<
  "tag.deleted",
  Readonly<{ tagId: TagId }>
>;

export type TagEvent = TagDeletedEvent;

// Domain factories return identity-less drafts; `EventId` is attached by
// the application layer so the domain remains free of `IdGenerator`
// concerns.
export const TagEvents = {
  deleted: (tagId: TagId, occurredAt: Date): EventDraft<TagDeletedEvent> => ({
    type: "tag.deleted",
    payload: { tagId },
    occurredAt,
    aggregateId: tagId,
  }),
};
