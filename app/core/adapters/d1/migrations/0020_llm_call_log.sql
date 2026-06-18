-- Admin dashboard "LLM 呼び出し" read-model (#748).
--
-- `llm_call_log` is an append-only read-model: one row per *actual* LLM API
-- call (`structureToHtml` / `suggestMetadata`), written synchronously
-- best-effort right after a successful call by the preview / ingestion
-- usecases (#748 ADR-002). The dashboard derives an hourly time series and a
-- 24h count from it.
--
-- `occurred_at` is ISO8601 UTC text so the hourly bucket can reuse the same
-- `substr(occurred_at, 1, 13)` aggregation as the upload series, which reads
-- `ingestion_jobs.created_at` (also ISO8601 text — #748 ADR-007). There is
-- no `event_id` / unique index: the synchronous best-effort write has no
-- at-least-once redelivery window, so no idempotency key is needed
-- (#748 ADR-008). The table is high frequency and pruned at 48h retention
-- (#748 ADR-005) — strictly larger than the 24h display window.
--
-- Manual migration (not drizzle-kit generated). `IF NOT EXISTS` keeps it
-- idempotent for repeated local `db:migrate` runs.

CREATE TABLE IF NOT EXISTS `llm_call_log` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `provider` text NOT NULL,
  `occurred_at` text NOT NULL,
  `created_at` integer NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_llm_call_log_occurred_at` ON `llm_call_log` (`occurred_at`);
