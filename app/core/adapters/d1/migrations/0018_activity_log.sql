-- Issue #595: admin dashboard "最近のアクティビティ" read-model.
--
-- `activity_log` is an event-sourced projection built by the queue consumer
-- (ADR-001). Each row is a single activity entry derived 1:1 from a domain
-- event; `event_id` is the unique idempotency key so at-least-once
-- redelivery never produces a duplicate row (`insertIfAbsent` =
-- `ON CONFLICT(event_id) DO NOTHING`, no count aggregation — ADR-005).
--
-- `ingestion_burst_log` is the intermediate table for "大量アップロード"
-- (ADR-005 方式A): each `ingestion.created` is inserted 1:1 keyed on
-- `event_id`; the burst row is derived at read time by counting distinct
-- events per owner over a short window. Both tables are pruned out-of-band
-- (ADR-007): activity_log at ACTIVITY_LOG_RETENTION_DAYS (90d), the
-- high-frequency burst log at 24h.
--
-- Manual migration (not drizzle-kit generated). `IF NOT EXISTS` keeps it
-- idempotent for repeated local `db:migrate` runs.

CREATE TABLE IF NOT EXISTS `activity_log` (
  `id` text PRIMARY KEY NOT NULL,
  `event_id` text NOT NULL,
  `kind` text NOT NULL,
  `actor_id` text,
  `target` text NOT NULL DEFAULT '',
  `detail` text NOT NULL DEFAULT '',
  `severity` text NOT NULL DEFAULT 'info' CHECK (`severity` IN ('info', 'warning', 'error', 'success')),
  `occurred_at` integer NOT NULL,
  `created_at` integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `uniq_activity_log_event_id` ON `activity_log` (`event_id`);
CREATE INDEX IF NOT EXISTS `idx_activity_log_occurred_at` ON `activity_log` (`occurred_at` DESC);

CREATE TABLE IF NOT EXISTS `ingestion_burst_log` (
  `id` text PRIMARY KEY NOT NULL,
  `event_id` text NOT NULL,
  `owner_id` text NOT NULL,
  `hour_bucket` text NOT NULL,
  `occurred_at` integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `uniq_ingestion_burst_log_event_id` ON `ingestion_burst_log` (`event_id`);
CREATE INDEX IF NOT EXISTS `idx_ingestion_burst_log_owner_occurred` ON `ingestion_burst_log` (`owner_id`, `occurred_at` DESC);
CREATE INDEX IF NOT EXISTS `idx_ingestion_burst_log_occurred_at` ON `ingestion_burst_log` (`occurred_at`);
