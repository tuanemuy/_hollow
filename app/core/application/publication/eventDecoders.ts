import { z } from "zod";
import type { EventDecoder } from "@/core/domain/common/event";
import { UserId } from "@/core/domain/identity/valueObject";
import { NoteId } from "@/core/domain/note/valueObject";
import type { PublicationEvent } from "@/core/domain/publication/events";
import {
  PublicationVisibility,
  ShareLinkId,
} from "@/core/domain/publication/valueObject";
import { buildEventDecoder } from "../events/buildDecoder";

const visibilitySchema = z.union([
  z.literal("private"),
  z.literal("unlisted"),
  z.literal("public"),
]);

const notePublishChangedSchema = z
  .object({
    noteId: z.string(),
    ownerId: z.string(),
    previous: visibilitySchema,
    next: visibilitySchema,
  })
  .strict();

const shareLinkIssuedSchema = z
  .object({
    shareLinkId: z.string(),
    noteId: z.string(),
    ownerId: z.string(),
  })
  .strict();

const shareLinkRevokedSchema = z
  .object({
    shareLinkId: z.string(),
    noteId: z.string(),
    ownerId: z.string(),
  })
  .strict();

export type PublicationEventDecoders = {
  readonly [K in PublicationEvent["type"]]: EventDecoder<
    Extract<PublicationEvent, { type: K }>
  >;
};

export const publicationEventDecoders: PublicationEventDecoders = {
  "note.publish_changed": buildEventDecoder(
    "note.publish_changed",
    notePublishChangedSchema,
    (p) => ({
      noteId: NoteId.create(p.noteId),
      ownerId: UserId.create(p.ownerId),
      previous: PublicationVisibility.create(p.previous),
      next: PublicationVisibility.create(p.next),
    }),
  ),
  "share_link.issued": buildEventDecoder(
    "share_link.issued",
    shareLinkIssuedSchema,
    (p) => ({
      shareLinkId: ShareLinkId.create(p.shareLinkId),
      noteId: NoteId.create(p.noteId),
      ownerId: UserId.create(p.ownerId),
    }),
  ),
  "share_link.revoked": buildEventDecoder(
    "share_link.revoked",
    shareLinkRevokedSchema,
    (p) => ({
      shareLinkId: ShareLinkId.create(p.shareLinkId),
      noteId: NoteId.create(p.noteId),
      ownerId: UserId.create(p.ownerId),
    }),
  ),
};
