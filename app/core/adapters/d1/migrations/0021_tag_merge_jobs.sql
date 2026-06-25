-- Background tag-merge jobs (#580).
--
-- `tag_merge_jobs` carries one row per enqueued tag merge. The merge is
-- moved off the synchronous request path onto the existing async job
-- infrastructure (outbox → relay → consumer → `runTagMergeJob`); progress
-- (`progress_processed` / `progress_total`) is persisted incrementally so
-- the P18 `MergeTagDialog` can render a determinate banner via polling
-- (`getTagMergeJob`).
--
-- `source_tag_id` / `target_tag_id` are opaque text (no FK): the source
-- tag row is deleted at completion, but the completed job must stay
-- pollable, so a cascading FK on the tag ids would wrongly remove the job.
-- `owner_id` keeps a cascading FK so jobs are cleaned up on user deletion.
--
-- `version` is the OCC token used by `D1TagMergeJobRepository`. Manual
-- migration (not drizzle-kit generated); `IF NOT EXISTS` keeps it
-- idempotent for repeated local `db:migrate` runs.

CREATE TABLE IF NOT EXISTS `tag_merge_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `source_tag_id` text NOT NULL,
  `target_tag_id` text NOT NULL,
  `status` text NOT NULL,
  `progress_processed` integer DEFAULT 0 NOT NULL,
  `progress_total` integer DEFAULT 0 NOT NULL,
  `affected_note_ids_json` text DEFAULT '[]' NOT NULL,
  `error_code` text,
  `error_reason` text,
  `version` integer DEFAULT 0 NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `completed_at` text,
  FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `tag_merge_jobs_status_enum` CHECK(`status` IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS `idx_tag_merge_jobs_owner_status` ON `tag_merge_jobs` (`owner_id`, `status`, `updated_at` DESC);
CREATE INDEX IF NOT EXISTS `idx_tag_merge_jobs_updated_at` ON `tag_merge_jobs` (`updated_at` DESC, `id` DESC);
