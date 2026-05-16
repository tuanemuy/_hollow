import { z } from "zod";
import type { EventDecoder } from "@/core/domain/common/event";
import { UserId } from "@/core/domain/identity/valueObject";
import type { MediaEvent } from "@/core/domain/media/events";
import { MediaAssetId } from "@/core/domain/media/valueObject";
import { buildEventDecoder } from "../events/buildDecoder";

const mediaCreatedSchema = z
  .object({ mediaAssetId: z.string(), ownerId: z.string() })
  .strict();
const mediaAttachedSchema = z.object({ mediaAssetId: z.string() }).strict();
const mediaOrphanedSchema = z.object({ mediaAssetId: z.string() }).strict();
const mediaDeletingSchema = z.object({ mediaAssetId: z.string() }).strict();
const mediaPurgedSchema = z.object({ mediaAssetId: z.string() }).strict();

export type MediaEventDecoders = {
  readonly [K in MediaEvent["type"]]: EventDecoder<
    Extract<MediaEvent, { type: K }>
  >;
};

export const mediaEventDecoders: MediaEventDecoders = {
  "media.created": buildEventDecoder(
    "media.created",
    mediaCreatedSchema,
    (p) => ({
      mediaAssetId: MediaAssetId.create(p.mediaAssetId),
      ownerId: UserId.create(p.ownerId),
    }),
  ),
  "media.attached": buildEventDecoder(
    "media.attached",
    mediaAttachedSchema,
    (p) => ({
      mediaAssetId: MediaAssetId.create(p.mediaAssetId),
    }),
  ),
  "media.orphaned": buildEventDecoder(
    "media.orphaned",
    mediaOrphanedSchema,
    (p) => ({
      mediaAssetId: MediaAssetId.create(p.mediaAssetId),
    }),
  ),
  "media.deleting": buildEventDecoder(
    "media.deleting",
    mediaDeletingSchema,
    (p) => ({
      mediaAssetId: MediaAssetId.create(p.mediaAssetId),
    }),
  ),
  "media.purged": buildEventDecoder("media.purged", mediaPurgedSchema, (p) => ({
    mediaAssetId: MediaAssetId.create(p.mediaAssetId),
  })),
};
