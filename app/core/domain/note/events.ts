import type { DomainEventBase, EventDraft } from "@/core/domain/common/event";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { MediaAssetId } from "@/core/domain/media/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import type { NoteId, NoteSlug, NoteTitle } from "./valueObject";

export type NoteCreatedEvent = DomainEventBase<
  "note.created",
  Readonly<{
    noteId: NoteId;
    ownerId: UserId;
    directoryId: DirectoryId;
    slug: NoteSlug;
    title: NoteTitle;
    tagIds: readonly TagId[];
    mediaRefs: readonly MediaAssetId[];
  }>
>;

export type NoteContentUpdatedEvent = DomainEventBase<
  "note.content_updated",
  Readonly<{
    noteId: NoteId;
    ownerId: UserId;
    title: NoteTitle;
    tagIds: readonly TagId[];
    mediaRefs: readonly MediaAssetId[];
  }>
>;

export type NoteRenamedEvent = DomainEventBase<
  "note.renamed",
  Readonly<{
    noteId: NoteId;
    ownerId: UserId;
    title: NoteTitle;
    slug: NoteSlug;
  }>
>;

export type NoteMovedEvent = DomainEventBase<
  "note.moved",
  Readonly<{
    noteId: NoteId;
    ownerId: UserId;
    fromDirectoryId: DirectoryId;
    toDirectoryId: DirectoryId;
  }>
>;

export type NoteTrashedEvent = DomainEventBase<
  "note.trashed",
  Readonly<{
    noteId: NoteId;
    ownerId: UserId;
    mediaRefs: readonly MediaAssetId[];
  }>
>;

export type NoteRestoredEvent = DomainEventBase<
  "note.restored",
  Readonly<{
    noteId: NoteId;
    ownerId: UserId;
    directoryId: DirectoryId;
  }>
>;

export type NotePurgedEvent = DomainEventBase<
  "note.purged",
  Readonly<{
    noteId: NoteId;
    ownerId: UserId;
    // Snapshot of the note's title at purge time so the view consumer can
    // render the concrete title of the now-deleted note in a SavedView's
    // broken-condition banner (Issue #405 ADR-A).
    title: NoteTitle;
    mediaRefs: readonly MediaAssetId[];
    // Persistent source file bound to the purged note, if any. The media
    // purge handler decrements its refCount to orphan the blob so the
    // standard purge worker reclaims it (Issue #452 ADR-005).
    sourceFileId: MediaAssetId | null;
  }>
>;

export type NoteTagsReplacedEvent = DomainEventBase<
  "note.tags_replaced",
  Readonly<{
    noteId: NoteId;
    ownerId: UserId;
    previousTagIds: readonly TagId[];
    tagIds: readonly TagId[];
  }>
>;

export type NoteEvent =
  | NoteCreatedEvent
  | NoteContentUpdatedEvent
  | NoteRenamedEvent
  | NoteMovedEvent
  | NoteTrashedEvent
  | NoteRestoredEvent
  | NotePurgedEvent
  | NoteTagsReplacedEvent;

export const NoteEvents = {
  created: (
    params: {
      noteId: NoteId;
      ownerId: UserId;
      directoryId: DirectoryId;
      slug: NoteSlug;
      title: NoteTitle;
      tagIds: readonly TagId[];
      mediaRefs: readonly MediaAssetId[];
    },
    occurredAt: Date,
  ): EventDraft<NoteCreatedEvent> => ({
    type: "note.created",
    payload: {
      noteId: params.noteId,
      ownerId: params.ownerId,
      directoryId: params.directoryId,
      slug: params.slug,
      title: params.title,
      tagIds: params.tagIds,
      mediaRefs: params.mediaRefs,
    },
    occurredAt,
    aggregateId: params.noteId,
  }),

  contentUpdated: (
    params: {
      noteId: NoteId;
      ownerId: UserId;
      title: NoteTitle;
      tagIds: readonly TagId[];
      mediaRefs: readonly MediaAssetId[];
    },
    occurredAt: Date,
  ): EventDraft<NoteContentUpdatedEvent> => ({
    type: "note.content_updated",
    payload: {
      noteId: params.noteId,
      ownerId: params.ownerId,
      title: params.title,
      tagIds: params.tagIds,
      mediaRefs: params.mediaRefs,
    },
    occurredAt,
    aggregateId: params.noteId,
  }),

  renamed: (
    params: {
      noteId: NoteId;
      ownerId: UserId;
      title: NoteTitle;
      slug: NoteSlug;
    },
    occurredAt: Date,
  ): EventDraft<NoteRenamedEvent> => ({
    type: "note.renamed",
    payload: {
      noteId: params.noteId,
      ownerId: params.ownerId,
      title: params.title,
      slug: params.slug,
    },
    occurredAt,
    aggregateId: params.noteId,
  }),

  moved: (
    params: {
      noteId: NoteId;
      ownerId: UserId;
      fromDirectoryId: DirectoryId;
      toDirectoryId: DirectoryId;
    },
    occurredAt: Date,
  ): EventDraft<NoteMovedEvent> => ({
    type: "note.moved",
    payload: {
      noteId: params.noteId,
      ownerId: params.ownerId,
      fromDirectoryId: params.fromDirectoryId,
      toDirectoryId: params.toDirectoryId,
    },
    occurredAt,
    aggregateId: params.noteId,
  }),

  trashed: (
    params: {
      noteId: NoteId;
      ownerId: UserId;
      mediaRefs: readonly MediaAssetId[];
    },
    occurredAt: Date,
  ): EventDraft<NoteTrashedEvent> => ({
    type: "note.trashed",
    payload: {
      noteId: params.noteId,
      ownerId: params.ownerId,
      mediaRefs: params.mediaRefs,
    },
    occurredAt,
    aggregateId: params.noteId,
  }),

  restored: (
    params: {
      noteId: NoteId;
      ownerId: UserId;
      directoryId: DirectoryId;
    },
    occurredAt: Date,
  ): EventDraft<NoteRestoredEvent> => ({
    type: "note.restored",
    payload: {
      noteId: params.noteId,
      ownerId: params.ownerId,
      directoryId: params.directoryId,
    },
    occurredAt,
    aggregateId: params.noteId,
  }),

  purged: (
    params: {
      noteId: NoteId;
      ownerId: UserId;
      title: NoteTitle;
      mediaRefs: readonly MediaAssetId[];
      sourceFileId: MediaAssetId | null;
    },
    occurredAt: Date,
  ): EventDraft<NotePurgedEvent> => ({
    type: "note.purged",
    payload: {
      noteId: params.noteId,
      ownerId: params.ownerId,
      title: params.title,
      mediaRefs: params.mediaRefs,
      sourceFileId: params.sourceFileId,
    },
    occurredAt,
    aggregateId: params.noteId,
  }),

  tagsReplaced: (
    params: {
      noteId: NoteId;
      ownerId: UserId;
      previousTagIds: readonly TagId[];
      tagIds: readonly TagId[];
    },
    occurredAt: Date,
  ): EventDraft<NoteTagsReplacedEvent> => ({
    type: "note.tags_replaced",
    payload: {
      noteId: params.noteId,
      ownerId: params.ownerId,
      previousTagIds: params.previousTagIds,
      tagIds: params.tagIds,
    },
    occurredAt,
    aggregateId: params.noteId,
  }),
};
