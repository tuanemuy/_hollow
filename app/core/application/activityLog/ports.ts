import type {
  ActivityLogEntry,
  ActivityLogRow,
  IngestionBurstEntry,
} from "./types";

/**
 * Persistence port for the activity-log read-model (Issue #595).
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
   * from the burst table via a per-owner windowed `COUNT(DISTINCT event_id)`
   * over the threshold, then merged into the same recent-first ordering.
   */
  findRecent(limit: number): Promise<readonly ActivityLogRow[]>;

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
