import { z } from "zod";
import type { EventDecoder } from "@/core/domain/common/event";
import type { TagEvent } from "@/core/domain/tag/events";
import { TagId } from "@/core/domain/tag/valueObject";
import { buildEventDecoder } from "../events/buildDecoder";

const tagDeletedSchema = z.object({ tagId: z.string() }).strict();

export type TagEventDecoders = {
  readonly [K in TagEvent["type"]]: EventDecoder<
    Extract<TagEvent, { type: K }>
  >;
};

export const tagEventDecoders: TagEventDecoders = {
  "tag.deleted": buildEventDecoder("tag.deleted", tagDeletedSchema, (p) => ({
    tagId: TagId.create(p.tagId),
  })),
};
