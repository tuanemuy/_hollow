import type { DomainEventBase, EventDraft } from "@/core/domain/common/event";
import type { DirectoryId, DirectoryName } from "./valueObject";

export type DirectoryDeletedEvent = DomainEventBase<
  "directory.deleted",
  Readonly<{ directoryId: DirectoryId; name: DirectoryName }>
>;

export type DirectoryEvent = DirectoryDeletedEvent;

// Domain factories return identity-less drafts; `EventId` is attached by
// the application layer so the domain remains free of `IdGenerator`
// concerns.
//
// `name` snapshots the directory's display name at delete time so the
// view consumer can render the concrete name of the now-deleted
// directory in a SavedView's broken-condition banner (Issue #405 ADR-A).
export const DirectoryEvents = {
  deleted: (
    directoryId: DirectoryId,
    name: DirectoryName,
    occurredAt: Date,
  ): EventDraft<DirectoryDeletedEvent> => ({
    type: "directory.deleted",
    payload: { directoryId, name },
    occurredAt,
    aggregateId: directoryId,
  }),
};
