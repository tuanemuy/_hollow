import { z } from "zod";
import type { EventDecoder } from "@/core/domain/common/event";
import type { TagEvent } from "@/core/domain/tag/events";
import { TagId, type TagName } from "@/core/domain/tag/valueObject";
import { buildEventDecoder } from "../events/buildDecoder";

// `name` is optional for backward compatibility: events enqueued before
// Issue #405 do not carry it. A missing / empty name decodes to an empty
// `TagName`-shaped string and the view marker degrades to a generic label.
const tagDeletedSchema = z
  .object({ tagId: z.string(), name: z.string().optional() })
  .strict();

export type TagEventDecoders = {
  readonly [K in TagEvent["type"]]: EventDecoder<
    Extract<TagEvent, { type: K }>
  >;
};

export const tagEventDecoders: TagEventDecoders = {
  "tag.deleted": buildEventDecoder("tag.deleted", tagDeletedSchema, (p) => ({
    tagId: TagId.create(p.tagId),
    name: (p.name ?? "") as TagName,
  })),
};
