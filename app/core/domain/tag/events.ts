import type { DomainEventBase, EventDraft } from "@/core/domain/common/event";
import type { TagId, TagName } from "./valueObject";

export type TagDeletedEvent = DomainEventBase<
  "tag.deleted",
  Readonly<{ tagId: TagId; name: TagName }>
>;

export type TagEvent = TagDeletedEvent;

// Domain factories return identity-less drafts; `EventId` is attached by
// the application layer so the domain remains free of `IdGenerator`
// concerns.
//
// `name` snapshots the tag's display name at delete time so the view
// consumer can render the concrete name of the now-deleted tag in a
// SavedView's broken-condition banner (Issue #405 ADR-A).
export const TagEvents = {
  deleted: (
    tagId: TagId,
    name: TagName,
    occurredAt: Date,
  ): EventDraft<TagDeletedEvent> => ({
    type: "tag.deleted",
    payload: { tagId, name },
    occurredAt,
    aggregateId: tagId,
  }),
};
