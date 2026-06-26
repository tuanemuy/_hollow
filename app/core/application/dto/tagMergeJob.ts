import type { TagMergeJob } from "@/core/domain/tag/mergeJob/entity";
import type { Instant } from "./common";
import { toInstant, toInstantOrNull } from "./common";

export type TagMergeJobDTO = Readonly<{
  id: string;
  ownerId: string;
  status: "pending" | "processing" | "completed" | "failed";
  sourceTagId: string;
  targetTagId: string;
  progress: Readonly<{ processed: number; total: number }>;
  errorReason: string | null;
  createdAt: Instant;
  completedAt: Instant | null;
}>;

export function toTagMergeJobDTO(job: TagMergeJob): TagMergeJobDTO {
  return {
    id: job.id,
    ownerId: job.ownerId,
    status: job.status,
    sourceTagId: job.sourceTagId,
    targetTagId: job.targetTagId,
    progress: {
      processed: job.progress.processed,
      total: job.progress.total,
    },
    errorReason: job.errorReason,
    createdAt: toInstant(job.createdAt),
    completedAt: toInstantOrNull(job.completedAt),
  };
}
