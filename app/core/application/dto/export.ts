import type { ExportJob } from "@/core/domain/export/entity";
import type { Instant } from "./common";
import { toInstant, toInstantOrNull } from "./common";

export type ExportJobDTO = Readonly<{
  id: string;
  ownerId: string;
  format: "html" | "markdown" | "pdf";
  scope: "single" | "multiple" | "view";
  status:
    | "pending"
    | "processing"
    | "completed"
    | "failed"
    | "cancelled"
    | "expired";
  progress: Readonly<{ processed: number; total: number }>;
  failedNoteIds: readonly string[];
  errorReason: string | null;
  artifactSize: number | null;
  createdAt: Instant;
  completedAt: Instant | null;
  expiresAt: Instant | null;
}>;

export function toExportJobDTO(job: ExportJob): ExportJobDTO {
  return {
    id: job.id,
    ownerId: job.ownerId,
    format: job.format,
    scope: job.scope,
    status: job.status,
    progress: {
      processed: job.progress.processed,
      total: job.progress.total,
    },
    failedNoteIds: job.failedNoteIds,
    errorReason: job.errorReason,
    artifactSize: job.artifactSize,
    createdAt: toInstant(job.createdAt),
    completedAt: toInstantOrNull(job.completedAt),
    expiresAt: toInstantOrNull(job.expiresAt),
  };
}
