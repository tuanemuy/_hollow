/**
 * Activity-log read-model types.
 *
 * The activity log is an event-sourced projection for the admin dashboard's
 * "最近のアクティビティ" table, not a domain concept (ADR-001 / ADR-006). The
 * kind/severity discriminators therefore live in the application layer as
 * plain string unions rather than domain value objects.
 */

/**
 * Activity kind discriminator. Each value maps 1:1 to a projection handler
 * and a UI label. `large_upload` is derived at read time from the burst
 * intermediate table (ADR-005); the rest are projected directly from a
 * single source event.
 */
export type ActivityKind =
  | "user_created"
  | "large_upload"
  | "job_failed"
  | "settings_changed"
  | "export_completed";

/** Tag variant driving the activity-table cell colour. */
export type ActivitySeverity = "info" | "warning" | "error" | "success";

/**
 * A single projected activity-log row, ready to insert. `large_upload` rows
 * are NOT written here — they are derived from `ingestion_burst_log` at read
 * time, so this entry shape covers only the directly-projected kinds.
 */
export type ActivityLogEntry = Readonly<{
  id: string;
  eventId: string;
  kind: Exclude<ActivityKind, "large_upload">;
  actorId: string | null;
  target: string;
  detail: string;
  severity: ActivitySeverity;
  occurredAt: Date;
  createdAt: Date;
}>;

/** A burst-detection record (one per `ingestion.created`). */
export type IngestionBurstEntry = Readonly<{
  id: string;
  eventId: string;
  ownerId: string;
  hourBucket: string;
  occurredAt: Date;
}>;

/** A row read back from the activity log, recent-first. */
export type ActivityLogRow = Readonly<{
  kind: ActivityKind;
  actorId: string | null;
  target: string;
  detail: string;
  severity: ActivitySeverity;
  occurredAt: Date;
}>;

/**
 * Burst-aggregation tuning (ADR-005). A window of `windowMinutes` minutes
 * containing at least `threshold` distinct uploads from one owner is
 * surfaced as a single "大量アップロード" activity row.
 */
export const LARGE_UPLOAD_THRESHOLD = 20;
export const LARGE_UPLOAD_WINDOW_MINUTES = 5;

/** Retention for `activity_log` rows before the pruner sweeps them. */
export const ACTIVITY_LOG_RETENTION_DAYS = 90;

/** Retention for the high-frequency `ingestion_burst_log` table. */
export const INGESTION_BURST_LOG_RETENTION_HOURS = 24;
