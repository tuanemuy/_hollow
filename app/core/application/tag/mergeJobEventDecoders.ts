import { z } from "zod";
import type { EventDecoder } from "@/core/domain/common/event";
import type { TagMergeJobEvent } from "@/core/domain/tag/mergeJob/events";
import { TagMergeJobId } from "@/core/domain/tag/mergeJob/valueObject";
import { buildEventDecoder } from "../events/buildDecoder";

const requestedSchema = z.object({ jobId: z.string() }).strict();

export type TagMergeJobEventDecoders = {
  readonly [K in TagMergeJobEvent["type"]]: EventDecoder<
    Extract<TagMergeJobEvent, { type: K }>
  >;
};

export const tagMergeJobEventDecoders: TagMergeJobEventDecoders = {
  "tag.merge.requested": buildEventDecoder(
    "tag.merge.requested",
    requestedSchema,
    (p) => ({
      jobId: TagMergeJobId.create(p.jobId),
    }),
  ),
};
