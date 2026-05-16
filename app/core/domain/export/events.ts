import type { DomainEventBase, EventDraft } from "@/core/domain/common/event";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { ExportFormat, ExportJobId, ExportScope } from "./valueObject";

export type ExportJobRequestedEvent = DomainEventBase<
  "export.job.requested",
  Readonly<{
    exportJobId: ExportJobId;
    ownerId: UserId;
    format: ExportFormat;
    scope: ExportScope;
  }>
>;

export type ExportJobStartedEvent = DomainEventBase<
  "export.job.started",
  Readonly<{ exportJobId: ExportJobId; total: number }>
>;

export type ExportJobCompletedEvent = DomainEventBase<
  "export.job.completed",
  Readonly<{
    exportJobId: ExportJobId;
    artifactKey: string;
    artifactSize: number;
  }>
>;

export type ExportJobFailedEvent = DomainEventBase<
  "export.job.failed",
  Readonly<{ exportJobId: ExportJobId; code: string; reason: string }>
>;

export type ExportJobCancelledEvent = DomainEventBase<
  "export.job.cancelled",
  Readonly<{ exportJobId: ExportJobId }>
>;

export type ExportJobExpiredEvent = DomainEventBase<
  "export.job.expired",
  Readonly<{ exportJobId: ExportJobId }>
>;

export type ExportEvent =
  | ExportJobRequestedEvent
  | ExportJobStartedEvent
  | ExportJobCompletedEvent
  | ExportJobFailedEvent
  | ExportJobCancelledEvent
  | ExportJobExpiredEvent;

// Domain factories return identity-less drafts; `EventId` is attached by
// the application layer so the domain remains free of `IdGenerator`
// concerns.
export const ExportEvents = {
  requested: (
    exportJobId: ExportJobId,
    ownerId: UserId,
    format: ExportFormat,
    scope: ExportScope,
    occurredAt: Date,
  ): EventDraft<ExportJobRequestedEvent> => ({
    type: "export.job.requested",
    payload: { exportJobId, ownerId, format, scope },
    occurredAt,
    aggregateId: exportJobId,
  }),

  started: (
    exportJobId: ExportJobId,
    total: number,
    occurredAt: Date,
  ): EventDraft<ExportJobStartedEvent> => ({
    type: "export.job.started",
    payload: { exportJobId, total },
    occurredAt,
    aggregateId: exportJobId,
  }),

  completed: (
    exportJobId: ExportJobId,
    artifactKey: string,
    artifactSize: number,
    occurredAt: Date,
  ): EventDraft<ExportJobCompletedEvent> => ({
    type: "export.job.completed",
    payload: { exportJobId, artifactKey, artifactSize },
    occurredAt,
    aggregateId: exportJobId,
  }),

  failed: (
    exportJobId: ExportJobId,
    code: string,
    reason: string,
    occurredAt: Date,
  ): EventDraft<ExportJobFailedEvent> => ({
    type: "export.job.failed",
    payload: { exportJobId, code, reason },
    occurredAt,
    aggregateId: exportJobId,
  }),

  cancelled: (
    exportJobId: ExportJobId,
    occurredAt: Date,
  ): EventDraft<ExportJobCancelledEvent> => ({
    type: "export.job.cancelled",
    payload: { exportJobId },
    occurredAt,
    aggregateId: exportJobId,
  }),

  expired: (
    exportJobId: ExportJobId,
    occurredAt: Date,
  ): EventDraft<ExportJobExpiredEvent> => ({
    type: "export.job.expired",
    payload: { exportJobId },
    occurredAt,
    aggregateId: exportJobId,
  }),
};
