-- Bound the dashboard 24h hourly upload aggregation.
--
-- `D1UsageMetricsProvider.collectUploadsHourly` filters `ingestion_jobs`
-- with `created_at >= windowStart`. None of the existing indices
-- (`idx_ij_owner_status`, `idx_ij_status_updated`, `idx_ij_updated_at`)
-- lead with `created_at`, so that range predicate could not be served by an
-- index and degraded to a full-table scan as `ingestion_jobs` grows (it is
-- never pruned). This dedicated index on `created_at` keeps the hourly
-- aggregation bounded to the 24h window.
--
-- Manual migration (not drizzle-kit generated). `IF NOT EXISTS` keeps it
-- idempotent for repeated local `db:migrate` runs.

CREATE INDEX IF NOT EXISTS `idx_ij_created_at` ON `ingestion_jobs` (`created_at`);
