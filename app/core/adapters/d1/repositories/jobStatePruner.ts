import { and, inArray, lt } from "drizzle-orm";
import type { JobStatePruner } from "@/core/application/ports/jobStatePruner";
import type { Database } from "../client";
import { exportJobs, tagMergeJobs } from "../schema";
import { mapDbError } from "./helpers";

/**
 * D1 implementation of {@link JobStatePruner} (Issue #783).
 *
 * Each method is a single non-transactional bulk DELETE over a terminal
 * `status IN (...)` set bounded by `updated_at < cutoff`. `updated_at` is
 * stored as ISO8601 UTC text, so the lexicographic `<` comparison matches
 * chronological order (same assumption as `findExpired` / the llm-call-log
 * prune). `idx_*_updated_at` supports the range scan.
 *
 * `export_jobs` excludes `completed` so live artifacts are never orphaned
 * (ADR-003); `tag_merge_jobs` has no artifact, so `completed` is included.
 */
export class D1JobStatePruner implements JobStatePruner {
  constructor(private readonly db: Database) {}

  async pruneTerminalExportJobs(cutoff: Date): Promise<{ deleted: number }> {
    return mapDbError("Failed to prune terminal export jobs", async () => {
      const rows = await this.db
        .delete(exportJobs)
        .where(
          and(
            inArray(exportJobs.status, ["failed", "cancelled", "expired"]),
            lt(exportJobs.updatedAt, cutoff.toISOString()),
          ),
        )
        .returning({ id: exportJobs.id });
      return { deleted: rows.length };
    });
  }

  async pruneTerminalTagMergeJobs(cutoff: Date): Promise<{ deleted: number }> {
    return mapDbError("Failed to prune terminal tag merge jobs", async () => {
      const rows = await this.db
        .delete(tagMergeJobs)
        .where(
          and(
            inArray(tagMergeJobs.status, ["completed", "failed"]),
            lt(tagMergeJobs.updatedAt, cutoff.toISOString()),
          ),
        )
        .returning({ id: tagMergeJobs.id });
      return { deleted: rows.length };
    });
  }
}
