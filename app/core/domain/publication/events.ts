import type { DomainEventBase, EventDraft } from "@/core/domain/common/event";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { PublicationVisibility, ShareLinkId } from "./valueObject";

export type NotePublishChangedEvent = DomainEventBase<
  "note.publish_changed",
  Readonly<{
    noteId: NoteId;
    ownerId: UserId;
    previous: PublicationVisibility;
    next: PublicationVisibility;
  }>
>;

export type ShareLinkIssuedEvent = DomainEventBase<
  "share_link.issued",
  Readonly<{ shareLinkId: ShareLinkId; noteId: NoteId; ownerId: UserId }>
>;

export type ShareLinkRevokedEvent = DomainEventBase<
  "share_link.revoked",
  Readonly<{ shareLinkId: ShareLinkId; noteId: NoteId; ownerId: UserId }>
>;

export type PublicationEvent =
  | NotePublishChangedEvent
  | ShareLinkIssuedEvent
  | ShareLinkRevokedEvent;

export const PublicationEvents = {
  notePublishChanged: (
    params: Readonly<{
      noteId: NoteId;
      ownerId: UserId;
      previous: PublicationVisibility;
      next: PublicationVisibility;
    }>,
    occurredAt: Date,
  ): EventDraft<NotePublishChangedEvent> => ({
    type: "note.publish_changed",
    payload: params,
    occurredAt,
    aggregateId: params.noteId,
  }),

  shareLinkIssued: (
    shareLinkId: ShareLinkId,
    noteId: NoteId,
    ownerId: UserId,
    occurredAt: Date,
  ): EventDraft<ShareLinkIssuedEvent> => ({
    type: "share_link.issued",
    payload: { shareLinkId, noteId, ownerId },
    occurredAt,
    aggregateId: shareLinkId,
  }),

  shareLinkRevoked: (
    shareLinkId: ShareLinkId,
    noteId: NoteId,
    ownerId: UserId,
    occurredAt: Date,
  ): EventDraft<ShareLinkRevokedEvent> => ({
    type: "share_link.revoked",
    payload: { shareLinkId, noteId, ownerId },
    occurredAt,
    aggregateId: shareLinkId,
  }),
};
