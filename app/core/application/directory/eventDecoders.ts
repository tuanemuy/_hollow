import { z } from "zod";
import type { EventDecoder } from "@/core/domain/common/event";
import type { DirectoryEvent } from "@/core/domain/directory/events";
import { DirectoryId } from "@/core/domain/directory/valueObject";
import { buildEventDecoder } from "../events/buildDecoder";

const directoryDeletedSchema = z.object({ directoryId: z.string() }).strict();

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
    }),
  ),
};
