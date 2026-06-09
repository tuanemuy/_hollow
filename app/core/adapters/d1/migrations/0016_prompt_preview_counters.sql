-- 0016_prompt_preview_counters.sql
-- Issue #574: per-user fixed-window counter for the prompt-preview rate
-- limiter (`D1PromptPreviewRateLimiter`).
--
-- One row per `(user_id, window_start)` bucket, where
-- `window_start = floor(now_ms / windowMs)`. The limiter claims a slot
-- with a single `INSERT ... ON CONFLICT(user_id, window_start) DO UPDATE
-- SET count = count + 1 WHERE count < :max RETURNING count` statement,
-- which is atomic under SQLite's per-statement write lock.
--
-- Stale buckets are pruned opportunistically by
-- `D1PromptPreviewRateLimiter.tryConsume` within the same call (it deletes
-- the acting user's rows with `window_start < current`), so each user stays
-- bounded to ~1 row without a separate pruner (ADR-009).
--
-- Manual migration (not drizzle-kit generated). `IF NOT EXISTS` keeps it
-- idempotent for repeated local `db:migrate` runs.

CREATE TABLE IF NOT EXISTS `prompt_preview_counters` (
  `user_id` text NOT NULL,
  `window_start` integer NOT NULL,
  `count` integer NOT NULL DEFAULT 0,
  PRIMARY KEY (`user_id`, `window_start`)
);
