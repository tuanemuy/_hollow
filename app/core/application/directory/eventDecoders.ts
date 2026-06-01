import { z } from "zod";
import type { EventDecoder } from "@/core/domain/common/event";
import type { DirectoryEvent } from "@/core/domain/directory/events";
import {
  DirectoryId,
  type DirectoryName,
} from "@/core/domain/directory/valueObject";
import { buildEventDecoder } from "../events/buildDecoder";

// `name` is optional for backward compatibility: events enqueued before
// Issue #405 do not carry it. A missing name decodes to an empty
// `DirectoryName`-shaped string and the view marker degrades to a
// generic label.
const directoryDeletedSchema = z
  .object({ directoryId: z.string(), name: z.string().optional() })
  .strict();

export type DirectoryEventDecoders = {
  readonly [K in DirectoryEvent["type"]]: EventDecoder<
    Extract<DirectoryEvent, { type: K }>
  >;
};

export const directoryEventDecoders: DirectoryEventDecoders = {
  "directory.deleted": buildEventDecoder(
    "directory.deleted",
    directoryDeletedSchema,
    (p) => ({
      directoryId: DirectoryId.create(p.directoryId),
      name: (p.name ?? "") as DirectoryName,
    }),
  ),
};
