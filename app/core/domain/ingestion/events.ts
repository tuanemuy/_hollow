import type { DomainEventBase, EventDraft } from "@/core/domain/common/event";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { IngestionJobId, SourceFileKind } from "./valueObject";

export type IngestionJobCreatedEvent = DomainEventBase<
  "ingestion.created",
  Readonly<{ jobId: IngestionJobId; kind: SourceFileKind }>
>;

export type IngestionJobProcessingStartedEvent = DomainEventBase<
  "ingestion.processingStarted",
  Readonly<{ jobId: IngestionJobId }>
>;

export type IngestionPreviewAttachedEvent = DomainEventBase<
  "ingestion.previewAttached",
  Readonly<{ jobId: IngestionJobId }>
>;

export type IngestionJobRegeneratedEvent = DomainEventBase<
  "ingestion.regenerated",
  Readonly<{ jobId: IngestionJobId; regenerationCount: number }>
>;

export type IngestionJobCommittedEvent = DomainEventBase<
  "ingestion.committed",
  Readonly<{ jobId: IngestionJobId; noteId: NoteId }>
>;

export type IngestionJobFailedEvent = DomainEventBase<
  "ingestion.failed",
  Readonly<{ jobId: IngestionJobId; errorCode: string; errorReason: string }>
>;

export type IngestionJobDiscardedEvent = DomainEventBase<
  "ingestion.discarded",
  Readonly<{ jobId: IngestionJobId }>
>;

export type IngestionEvent =
  | IngestionJobCreatedEvent
  | IngestionJobProcessingStartedEvent
  | IngestionPreviewAttachedEvent
  | IngestionJobRegeneratedEvent
  | IngestionJobCommittedEvent
  | IngestionJobFailedEvent
  | IngestionJobDiscardedEvent;

// Identity-less drafts; `EventId` is attached by the application layer
// inside the UoW so the domain stays free of `IdGenerator` concerns.
export const IngestionEvents = {
  created: (
    jobId: IngestionJobId,
    kind: SourceFileKind,
    occurredAt: Date,
  ): EventDraft<IngestionJobCreatedEvent> => ({
    type: "ingestion.created",
    payload: { jobId, kind },
    occurredAt,
    aggregateId: jobId,
  }),

  processingStarted: (
    jobId: IngestionJobId,
    occurredAt: Date,
  ): EventDraft<IngestionJobProcessingStartedEvent> => ({
    type: "ingestion.processingStarted",
    payload: { jobId },
    occurredAt,
    aggregateId: jobId,
  }),

  previewAttached: (
    jobId: IngestionJobId,
    occurredAt: Date,
  ): EventDraft<IngestionPreviewAttachedEvent> => ({
    type: "ingestion.previewAttached",
    payload: { jobId },
    occurredAt,
    aggregateId: jobId,
  }),

  regenerated: (
    jobId: IngestionJobId,
    regenerationCount: number,
    occurredAt: Date,
  ): EventDraft<IngestionJobRegeneratedEvent> => ({
    type: "ingestion.regenerated",
    payload: { jobId, regenerationCount },
    occurredAt,
    aggregateId: jobId,
  }),

  committed: (
    jobId: IngestionJobId,
    noteId: NoteId,
    occurredAt: Date,
  ): EventDraft<IngestionJobCommittedEvent> => ({
    type: "ingestion.committed",
    payload: { jobId, noteId },
    occurredAt,
    aggregateId: jobId,
  }),

  failed: (
    jobId: IngestionJobId,
    errorCode: string,
    errorReason: string,
    occurredAt: Date,
  ): EventDraft<IngestionJobFailedEvent> => ({
    type: "ingestion.failed",
    payload: { jobId, errorCode, errorReason },
    occurredAt,
    aggregateId: jobId,
  }),

  discarded: (
    jobId: IngestionJobId,
    occurredAt: Date,
  ): EventDraft<IngestionJobDiscardedEvent> => ({
    type: "ingestion.discarded",
    payload: { jobId },
    occurredAt,
    aggregateId: jobId,
  }),
};
