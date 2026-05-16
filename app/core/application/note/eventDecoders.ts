import { z } from "zod";
import type { EventDecoder } from "@/core/domain/common/event";
import { DirectoryId } from "@/core/domain/directory/valueObject";
import { UserId } from "@/core/domain/identity/valueObject";
import { MediaAssetId } from "@/core/domain/media/valueObject";
import type { NoteEvent } from "@/core/domain/note/events";
import { NoteId, NoteSlug, NoteTitle } from "@/core/domain/note/valueObject";
import { TagId } from "@/core/domain/tag/valueObject";
import { buildEventDecoder } from "../events/buildDecoder";

const tagIdArraySchema = z.array(z.string());
const mediaIdArraySchema = z.array(z.string());

const noteCreatedSchema = z
  .object({
    noteId: z.string(),
    ownerId: z.string(),
    directoryId: z.string(),
    slug: z.string(),
    title: z.string(),
    tagIds: tagIdArraySchema,
    mediaRefs: mediaIdArraySchema,
  })
  .strict();

const noteContentUpdatedSchema = z
  .object({
    noteId: z.string(),
    ownerId: z.string(),
    title: z.string(),
    tagIds: tagIdArraySchema,
    mediaRefs: mediaIdArraySchema,
  })
  .strict();

const noteRenamedSchema = z
  .object({
    noteId: z.string(),
    ownerId: z.string(),
    title: z.string(),
    slug: z.string(),
  })
  .strict();

const noteMovedSchema = z
  .object({
    noteId: z.string(),
    ownerId: z.string(),
    fromDirectoryId: z.string(),
    toDirectoryId: z.string(),
  })
  .strict();

const noteTrashedSchema = z
  .object({
    noteId: z.string(),
    ownerId: z.string(),
    mediaRefs: mediaIdArraySchema,
  })
  .strict();

const noteRestoredSchema = z
  .object({
    noteId: z.string(),
    ownerId: z.string(),
    directoryId: z.string(),
  })
  .strict();

const notePurgedSchema = z
  .object({
    noteId: z.string(),
    ownerId: z.string(),
    mediaRefs: mediaIdArraySchema,
  })
  .strict();

const noteTagsReplacedSchema = z
  .object({
    noteId: z.string(),
    ownerId: z.string(),
    previousTagIds: tagIdArraySchema,
    tagIds: tagIdArraySchema,
  })
  .strict();

export type NoteEventDecoders = {
  readonly [K in NoteEvent["type"]]: EventDecoder<
    Extract<NoteEvent, { type: K }>
  >;
};

export const noteEventDecoders: NoteEventDecoders = {
  "note.created": buildEventDecoder("note.created", noteCreatedSchema, (p) => ({
    noteId: NoteId.create(p.noteId),
    ownerId: UserId.create(p.ownerId),
    directoryId: DirectoryId.create(p.directoryId),
    slug: NoteSlug.create(p.slug),
    title: NoteTitle.create(p.title),
    tagIds: p.tagIds.map((id) => TagId.create(id)),
    mediaRefs: p.mediaRefs.map((id) => MediaAssetId.create(id)),
  })),
  "note.content_updated": buildEventDecoder(
    "note.content_updated",
    noteContentUpdatedSchema,
    (p) => ({
      noteId: NoteId.create(p.noteId),
      ownerId: UserId.create(p.ownerId),
      title: NoteTitle.create(p.title),
      tagIds: p.tagIds.map((id) => TagId.create(id)),
      mediaRefs: p.mediaRefs.map((id) => MediaAssetId.create(id)),
    }),
  ),
  "note.renamed": buildEventDecoder("note.renamed", noteRenamedSchema, (p) => ({
    noteId: NoteId.create(p.noteId),
    ownerId: UserId.create(p.ownerId),
    title: NoteTitle.create(p.title),
    slug: NoteSlug.create(p.slug),
  })),
  "note.moved": buildEventDecoder("note.moved", noteMovedSchema, (p) => ({
    noteId: NoteId.create(p.noteId),
    ownerId: UserId.create(p.ownerId),
    fromDirectoryId: DirectoryId.create(p.fromDirectoryId),
    toDirectoryId: DirectoryId.create(p.toDirectoryId),
  })),
  "note.trashed": buildEventDecoder("note.trashed", noteTrashedSchema, (p) => ({
    noteId: NoteId.create(p.noteId),
    ownerId: UserId.create(p.ownerId),
    mediaRefs: p.mediaRefs.map((id) => MediaAssetId.create(id)),
  })),
  "note.restored": buildEventDecoder(
    "note.restored",
    noteRestoredSchema,
    (p) => ({
      noteId: NoteId.create(p.noteId),
      ownerId: UserId.create(p.ownerId),
      directoryId: DirectoryId.create(p.directoryId),
    }),
  ),
  "note.purged": buildEventDecoder("note.purged", notePurgedSchema, (p) => ({
    noteId: NoteId.create(p.noteId),
    ownerId: UserId.create(p.ownerId),
    mediaRefs: p.mediaRefs.map((id) => MediaAssetId.create(id)),
  })),
  "note.tags_replaced": buildEventDecoder(
    "note.tags_replaced",
    noteTagsReplacedSchema,
    (p) => ({
      noteId: NoteId.create(p.noteId),
      ownerId: UserId.create(p.ownerId),
      previousTagIds: p.previousTagIds.map((id) => TagId.create(id)),
      tagIds: p.tagIds.map((id) => TagId.create(id)),
    }),
  ),
};
