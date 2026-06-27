/**
 * Worker-maintenance port that GCs terminal-state job rows past a
 * retention window. Distinct from the domain aggregate repositories
 * (`ExportJobRepository` / `TagMergeJobRepository`): this is a
 * non-transactional bulk DELETE that loads no aggregate and runs no OCC
 * version check, so it lives on the worker container alongside the other
 * prune ports rather than the UoW-bound aggregate repositories
 * (Issue #783 ADR-001/002).
 *
 * Both methods delete only *terminal* rows older than `cutoff` and never
 * touch non-terminal rows (`pending` / `processing`), whatever their age —
 * a stuck job must not silently disappear.
 *
 * `export_jobs` deliberately excludes `completed` from the terminal set:
 * a `completed` row still owns a live R2 artifact (`artifactKey`,
 * `expiresAt` not yet reached), so pruning it by age alone would orphan
 * the artifact. Its lifecycle is `completed → (purgeExpiredExports) →
 * expired → prune`; the terminal set here is `{failed, cancelled,
 * expired}` (Issue #783 ADR-003 / acceptance criteria). `tag_merge_jobs`
 * has no artifact, so its terminal set includes `completed`.
 */
export interface JobStatePruner {
  /**
   * Delete `export_jobs` rows in `{failed, cancelled, expired}` whose
   * `updated_at < cutoff`. `completed` is structurally excluded to avoid
   * orphaning live artifacts (ADR-003).
   */
  pruneTerminalExportJobs(cutoff: Date): Promise<{ deleted: number }>;

  /**
   * Delete `tag_merge_jobs` rows in `{completed, failed}` whose
   * `updated_at < cutoff`. Tag-merge jobs carry no artifact, so
   * `completed` is a safe terminal target.
   */
  pruneTerminalTagMergeJobs(cutoff: Date): Promise<{ deleted: number }>;
}
