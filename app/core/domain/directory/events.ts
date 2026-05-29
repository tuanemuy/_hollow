import type { DomainEventBase, EventDraft } from "@/core/domain/common/event";
import type { DirectoryId } from "./valueObject";

export type DirectoryDeletedEvent = DomainEventBase<
  "directory.deleted",
  Readonly<{ directoryId: DirectoryId }>
>;

export type DirectoryEvent = DirectoryDeletedEvent;

// Domain factories return identity-less drafts; `EventId` is attached by
// the application layer so the domain remains free of `IdGenerator`
// concerns.
export const DirectoryEvents = {
  deleted: (
    directoryId: DirectoryId,
    occurredAt: Date,
  ): EventDraft<DirectoryDeletedEvent> => ({
    type: "directory.deleted",
    payload: { directoryId },
    occurredAt,
    aggregateId: directoryId,
  }),
};
