import type { WorkerContainer } from "../di/types";

// Retain terminal `export_jobs` rows (`failed` / `cancelled` / `expired`)
// for seven days before the daily pruner sweeps them. The window is days,
// not minutes — orders of magnitude longer than the export-detail polling
// interval (a few seconds), so a client polling a just-finished job always
// reads its terminal state before the row can be pruned (Issue #783
// ADR-004). `completed` is excluded structurally by the adapter to avoid
// orphaning live artifacts (ADR-003).
export const DEFAULT_EXPORT_JOBS_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type PruneExportJobsOptions = {
  retentionMs: number;
};

export async function pruneExportJobs(
  container: WorkerContainer,
  options: PruneExportJobsOptions,
): Promise<{ deleted: number }> {
  const { clock, logger, jobStatePruner } = container;
  const cutoff = new Date(clock.now().getTime() - options.retentionMs);
  const { deleted } = await jobStatePruner.pruneTerminalExportJobs(cutoff);
  logger.info(`[export-jobs] pruned ${deleted} terminal job(s)`, {
    deleted,
    retentionMs: options.retentionMs,
    cutoff: cutoff.toISOString(),
  });
  return { deleted };
}
