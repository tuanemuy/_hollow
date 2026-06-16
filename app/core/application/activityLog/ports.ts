import type {
  ActivityLogEntry,
  ActivityLogRow,
  IngestionBurstEntry,
} from "./types";

/**
 * An {@link ActivityLogRow} carrying a stable, deterministic `key` for React
 * list identity. Directly-projected rows use their `activity_log.id`;
 * "大量アップロード" rows — which have no persisted id (they are derived at read
 * time) — use a deterministic `large_upload:{owner}:{windowStart}` key so the
 * same underlying data always yields the same key across re-renders.
 */
export type RecentActivityRow = ActivityLogRow & Readonly<{ key: string }>;

/**
 * Persistence port for the activity-log read-model.
 *
 * Lives on the {@link WorkerContainer} (ADR-006): the projection handlers
 * run inside the queue consumer outside any aggregate UoW, and read-time
 * aggregation is performed by `getRecentActivity`. The request path never
 * writes the activity log, so this port is deliberately kept off the
 * `UnitOfWorkContext`.
 *
 * All writes are idempotent at the natural `event_id` key: an at-least-once
 * redelivery of the same event re-runs `insertIfAbsent` as a no-op, so the
 * projection never double-counts (ADR-001 / ADR-005).
 */
export interface ActivityLogRepository {
  /**
   * Insert one projected activity entry, ignoring the write when a row with
   * the same `eventId` already exists (`ON CONFLICT(event_id) DO NOTHING`).
   */
  insertIfAbsent(entry: ActivityLogEntry): Promise<void>;

  /**
   * Record one `ingestion.created` in the burst intermediate table. Keyed on
   * `eventId` so redelivery is a no-op — the burst count is never inflated.
   */
  recordBurst(entry: IngestionBurstEntry): Promise<void>;

  /**
   * Read the most recent activity rows, occurredAt-descending. Directly
   * projected rows come from `activity_log`; "大量アップロード" rows are derived
   * from the burst table via a per-owner sliding-window
   * `COUNT(DISTINCT event_id)` over the threshold, then merged into the same
   * recent-first ordering. Each returned row carries a stable {@link
   * RecentActivityRow.key} for list identity.
   */
  findRecent(limit: number): Promise<readonly RecentActivityRow[]>;

  /**
   * Delete `activity_log` rows whose `occurred_at` predates `cutoff`
   * (retention pruning — ADR-007). Returns the number of rows removed.
   */
  pruneOlderThan(cutoff: Date): Promise<{ deleted: number }>;

  /**
   * Delete `ingestion_burst_log` rows whose `occurred_at` predates `cutoff`
   * (24h retention — ADR-005 / ADR-007). Returns the number of rows removed.
   */
  pruneBurstOlderThan(cutoff: Date): Promise<{ deleted: number }>;
}
