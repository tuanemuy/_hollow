import { z } from "zod";
import type { EventDecoder } from "@/core/domain/common/event";
import type { IngestionEvent } from "@/core/domain/ingestion/events";
import {
  IngestionJobId,
  SourceFileKind,
} from "@/core/domain/ingestion/valueObject";
import { NoteId } from "@/core/domain/note/valueObject";
import { buildEventDecoder } from "../events/buildDecoder";

const createdSchema = z
  .object({ jobId: z.string(), kind: z.string() })
  .strict();
const processingStartedSchema = z.object({ jobId: z.string() }).strict();
const previewAttachedSchema = z.object({ jobId: z.string() }).strict();
const regeneratedSchema = z
  .object({ jobId: z.string(), regenerationCount: z.number().int().min(0) })
  .strict();
const committedSchema = z
  .object({ jobId: z.string(), noteId: z.string() })
  .strict();
const failedSchema = z
  .object({
    jobId: z.string(),
    errorCode: z.string(),
    errorReason: z.string(),
  })
  .strict();
const discardedSchema = z.object({ jobId: z.string() }).strict();

export type IngestionEventDecoders = {
  readonly [K in IngestionEvent["type"]]: EventDecoder<
    Extract<IngestionEvent, { type: K }>
  >;
};

export const ingestionEventDecoders: IngestionEventDecoders = {
  "ingestion.created": buildEventDecoder(
    "ingestion.created",
    createdSchema,
    (p) => ({
      jobId: IngestionJobId.create(p.jobId),
      kind: SourceFileKind.create(p.kind),
    }),
  ),
  "ingestion.processingStarted": buildEventDecoder(
    "ingestion.processingStarted",
    processingStartedSchema,
    (p) => ({ jobId: IngestionJobId.create(p.jobId) }),
  ),
  "ingestion.previewAttached": buildEventDecoder(
    "ingestion.previewAttached",
    previewAttachedSchema,
    (p) => ({ jobId: IngestionJobId.create(p.jobId) }),
  ),
  "ingestion.regenerated": buildEventDecoder(
    "ingestion.regenerated",
    regeneratedSchema,
    (p) => ({
      jobId: IngestionJobId.create(p.jobId),
      regenerationCount: p.regenerationCount,
    }),
  ),
  "ingestion.committed": buildEventDecoder(
    "ingestion.committed",
    committedSchema,
    (p) => ({
      jobId: IngestionJobId.create(p.jobId),
      noteId: NoteId.create(p.noteId),
    }),
  ),
  "ingestion.failed": buildEventDecoder(
    "ingestion.failed",
    failedSchema,
    (p) => ({
      jobId: IngestionJobId.create(p.jobId),
      errorCode: p.errorCode,
      errorReason: p.errorReason,
    }),
  ),
  "ingestion.discarded": buildEventDecoder(
    "ingestion.discarded",
    discardedSchema,
    (p) => ({ jobId: IngestionJobId.create(p.jobId) }),
  ),
};
