import type { ExportJob } from "@/core/domain/export/entity";
import type { Instant } from "./common";
import { toInstant, toInstantOrNull } from "./common";
import type { UserId } from "./identity";
import type { NoteId } from "./note";

export type ExportJobId = string & { readonly __brand: "ExportJobId" };

export type ExportJobDTO = Readonly<{
  id: ExportJobId;
  ownerId: UserId;
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
  failedNoteIds: readonly NoteId[];
  errorReason: string | null;
  artifactSize: number | null;
  createdAt: Instant;
  completedAt: Instant | null;
  expiresAt: Instant | null;
}>;

export function toExportJobDTO(job: ExportJob): ExportJobDTO {
  return {
    id: job.id as unknown as ExportJobId,
    ownerId: job.ownerId as unknown as UserId,
    format: job.format,
    scope: job.scope,
    status: job.status,
    progress: {
      processed: job.progress.processed,
      total: job.progress.total,
    },
    failedNoteIds: job.failedNoteIds.map((id) => id as unknown as NoteId),
    errorReason: job.errorReason,
    artifactSize: job.artifactSize,
    createdAt: toInstant(job.createdAt),
    completedAt: toInstantOrNull(job.completedAt),
    expiresAt: toInstantOrNull(job.expiresAt),
  };
}
