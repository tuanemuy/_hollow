import type { WorkerContainer } from "../di/types";

// Retain terminal `tag_merge_jobs` rows (`completed` / `failed`) for seven
// days before the daily pruner sweeps them. The window is days, not
// minutes — orders of magnitude longer than the merge-dialog polling
// interval (a few seconds), so a client polling a just-finished merge
// always reads its terminal state before the row can be pruned (Issue #783
// ADR-004). Tag-merge jobs carry no artifact, so `completed` is a safe
// terminal target.
export const DEFAULT_TAG_MERGE_JOBS_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type PruneTagMergeJobsOptions = {
  retentionMs: number;
};

export async function pruneTagMergeJobs(
  container: WorkerContainer,
  options: PruneTagMergeJobsOptions,
): Promise<{ deleted: number }> {
  const { clock, logger, jobStatePruner } = container;
  const cutoff = new Date(clock.now().getTime() - options.retentionMs);
  const { deleted } = await jobStatePruner.pruneTerminalTagMergeJobs(cutoff);
  logger.info(`[tag-merge-jobs] pruned ${deleted} terminal job(s)`, {
    deleted,
    retentionMs: options.retentionMs,
    cutoff: cutoff.toISOString(),
  });
  return { deleted };
}
