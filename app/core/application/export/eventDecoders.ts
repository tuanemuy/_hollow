import { z } from "zod";
import type { EventDecoder } from "@/core/domain/common/event";
import type { ExportEvent } from "@/core/domain/export/events";
import {
  ExportFormat,
  ExportJobId,
  ExportScope,
  validateArtifactKey,
  validateArtifactSize,
  validateErrorCode,
  validateErrorReason,
} from "@/core/domain/export/valueObject";
import { UserId } from "@/core/domain/identity/valueObject";
import { buildEventDecoder } from "../events/buildDecoder";

const requestedSchema = z
  .object({
    exportJobId: z.string(),
    ownerId: z.string(),
    format: z.string(),
    scope: z.string(),
  })
  .strict();

const startedSchema = z
  .object({
    exportJobId: z.string(),
    total: z.number(),
  })
  .strict();

const completedSchema = z
  .object({
    exportJobId: z.string(),
    artifactKey: z.string(),
    artifactSize: z.number(),
  })
  .strict();

const failedSchema = z
  .object({
    exportJobId: z.string(),
    code: z.string(),
    reason: z.string(),
  })
  .strict();

const cancelledSchema = z
  .object({
    exportJobId: z.string(),
  })
  .strict();

const expiredSchema = z
  .object({
    exportJobId: z.string(),
  })
  .strict();

const retryRequestedSchema = z
  .object({
    exportJobId: z.string(),
  })
  .strict();

export type ExportEventDecoders = {
  readonly [K in ExportEvent["type"]]: EventDecoder<
    Extract<ExportEvent, { type: K }>
  >;
};

export const exportEventDecoders: ExportEventDecoders = {
  "export.job.requested": buildEventDecoder(
    "export.job.requested",
    requestedSchema,
    (p) => ({
      exportJobId: ExportJobId.create(p.exportJobId),
      ownerId: UserId.create(p.ownerId),
      format: ExportFormat.create(p.format),
      scope: ExportScope.create(p.scope),
    }),
  ),
  "export.job.started": buildEventDecoder(
    "export.job.started",
    startedSchema,
    (p) => ({
      exportJobId: ExportJobId.create(p.exportJobId),
      total: p.total,
    }),
  ),
  "export.job.completed": buildEventDecoder(
    "export.job.completed",
    completedSchema,
    (p) => ({
      exportJobId: ExportJobId.create(p.exportJobId),
      artifactKey: validateArtifactKey(p.artifactKey),
      artifactSize: validateArtifactSize(p.artifactSize),
    }),
  ),
  "export.job.failed": buildEventDecoder(
    "export.job.failed",
    failedSchema,
    (p) => ({
      exportJobId: ExportJobId.create(p.exportJobId),
      code: validateErrorCode(p.code),
      reason: validateErrorReason(p.reason),
    }),
  ),
  "export.job.cancelled": buildEventDecoder(
    "export.job.cancelled",
    cancelledSchema,
    (p) => ({
      exportJobId: ExportJobId.create(p.exportJobId),
    }),
  ),
  "export.job.expired": buildEventDecoder(
    "export.job.expired",
    expiredSchema,
    (p) => ({
      exportJobId: ExportJobId.create(p.exportJobId),
    }),
  ),
  "export.job.retryRequested": buildEventDecoder(
    "export.job.retryRequested",
    retryRequestedSchema,
    (p) => ({
      exportJobId: ExportJobId.create(p.exportJobId),
    }),
  ),
};
