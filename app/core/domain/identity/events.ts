import type { DomainEventBase, EventDraft } from "@/core/domain/common/event";
import type { UserId } from "./valueObject";

export type UserCreatedEvent = DomainEventBase<
  "user.created",
  Readonly<{ userId: UserId }>
>;

export type UserDeletedEvent = DomainEventBase<
  "user.deleted",
  Readonly<{ userId: UserId; deletedAt: Date }>
>;

export type UserSuspendedEvent = DomainEventBase<
  "user.suspended",
  Readonly<{ userId: UserId }>
>;

export type UserReinstatedEvent = DomainEventBase<
  "user.reinstated",
  Readonly<{ userId: UserId }>
>;

export type IdentityEvent =
  | UserCreatedEvent
  | UserDeletedEvent
  | UserSuspendedEvent
  | UserReinstatedEvent;

// Identity-less event drafts. `EventId` is attached inside the
// `UnitOfWorkContext` adapter via `IdGenerator`; the domain stays free of
// id-generation concerns.
export const IdentityEvents = {
  created: (
    userId: UserId,
    occurredAt: Date,
  ): EventDraft<UserCreatedEvent> => ({
    type: "user.created",
    payload: { userId },
    occurredAt,
    aggregateId: userId,
  }),

  deleted: (
    userId: UserId,
    deletedAt: Date,
    occurredAt: Date,
  ): EventDraft<UserDeletedEvent> => ({
    type: "user.deleted",
    payload: { userId, deletedAt },
    occurredAt,
    aggregateId: userId,
  }),

  suspended: (
    userId: UserId,
    occurredAt: Date,
  ): EventDraft<UserSuspendedEvent> => ({
    type: "user.suspended",
    payload: { userId },
    occurredAt,
    aggregateId: userId,
  }),

  reinstated: (
    userId: UserId,
    occurredAt: Date,
  ): EventDraft<UserReinstatedEvent> => ({
    type: "user.reinstated",
    payload: { userId },
    occurredAt,
    aggregateId: userId,
  }),
};
