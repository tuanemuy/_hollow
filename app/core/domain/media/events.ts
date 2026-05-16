import type { DomainEventBase, EventDraft } from "@/core/domain/common/event";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { MediaAssetId } from "./valueObject";

export type MediaCreatedEvent = DomainEventBase<
  "media.created",
  Readonly<{ mediaAssetId: MediaAssetId; ownerId: UserId }>
>;

export type MediaAttachedEvent = DomainEventBase<
  "media.attached",
  Readonly<{ mediaAssetId: MediaAssetId }>
>;

export type MediaOrphanedEvent = DomainEventBase<
  "media.orphaned",
  Readonly<{ mediaAssetId: MediaAssetId }>
>;

export type MediaDeletingEvent = DomainEventBase<
  "media.deleting",
  Readonly<{ mediaAssetId: MediaAssetId }>
>;

export type MediaPurgedEvent = DomainEventBase<
  "media.purged",
  Readonly<{ mediaAssetId: MediaAssetId }>
>;

export type MediaEvent =
  | MediaCreatedEvent
  | MediaAttachedEvent
  | MediaOrphanedEvent
  | MediaDeletingEvent
  | MediaPurgedEvent;

export const MediaEvents = {
  created: (
    mediaAssetId: MediaAssetId,
    ownerId: UserId,
    occurredAt: Date,
  ): EventDraft<MediaCreatedEvent> => ({
    type: "media.created",
    payload: { mediaAssetId, ownerId },
    occurredAt,
    aggregateId: mediaAssetId,
  }),

  attached: (
    mediaAssetId: MediaAssetId,
    occurredAt: Date,
  ): EventDraft<MediaAttachedEvent> => ({
    type: "media.attached",
    payload: { mediaAssetId },
    occurredAt,
    aggregateId: mediaAssetId,
  }),

  orphaned: (
    mediaAssetId: MediaAssetId,
    occurredAt: Date,
  ): EventDraft<MediaOrphanedEvent> => ({
    type: "media.orphaned",
    payload: { mediaAssetId },
    occurredAt,
    aggregateId: mediaAssetId,
  }),

  deleting: (
    mediaAssetId: MediaAssetId,
    occurredAt: Date,
  ): EventDraft<MediaDeletingEvent> => ({
    type: "media.deleting",
    payload: { mediaAssetId },
    occurredAt,
    aggregateId: mediaAssetId,
  }),

  purged: (
    mediaAssetId: MediaAssetId,
    occurredAt: Date,
  ): EventDraft<MediaPurgedEvent> => ({
    type: "media.purged",
    payload: { mediaAssetId },
    occurredAt,
    aggregateId: mediaAssetId,
  }),
};
