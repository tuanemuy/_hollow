-- 0014_source_file_persistence.sql
-- Issue #452: persist the ingested original source file and bind it 1:1 to
-- the note that the ingestion commit produced.
--
-- Two schema changes:
--   1. Extend `media_assets.media_kind_enum` CHECK to admit the new
--      `'source'` kind. SQLite cannot ALTER a table-level CHECK and has no
--      DROP CONSTRAINT, so the table is rebuilt via the recommended 12-step
--      ALTER procedure (mirrors `0013_drop_tags_note_count.sql`). The
--      recreated table/index/trigger definitions are mechanically identical
--      to `0001_hollow_schema.sql:92-129` apart from the widened CHECK.
--      `media_assets` is referenced by `notes.source_file_id` (added below)
--      and by the `users_avatar_media_assets_set_null` trigger;
--      `PRAGMA defer_foreign_keys` (transaction-safe) holds FK enforcement
--      until commit, by which point the recreated table satisfies the refs.
--   2. Add `notes.source_file_id` (nullable, REFERENCES media_assets(id)
--      ON DELETE SET NULL). Existing rows default to NULL (= no source
--      file), so legacy notes coexist safely.

PRAGMA defer_foreign_keys = ON;

DROP TRIGGER IF EXISTS `users_avatar_media_assets_set_null`;

DROP INDEX IF EXISTS `uniq_media_storage_key`;
DROP INDEX IF EXISTS `idx_media_owner`;
DROP INDEX IF EXISTS `idx_media_status_updated`;

CREATE TABLE `__new_media_assets` (
        `id` text PRIMARY KEY NOT NULL,
        `owner_id` text NOT NULL,
        `kind` text NOT NULL,
        `mime_type` text NOT NULL,
        `byte_size` integer NOT NULL,
        `backend` text DEFAULT 'r2' NOT NULL,
        `storage_key` text NOT NULL,
        `original_file_name` text,
        `width` integer,
        `height` integer,
        `duration_ms` integer,
        `ref_count` integer DEFAULT 0 NOT NULL,
        `status` text DEFAULT 'pending' NOT NULL,
        `created_at` text NOT NULL,
        `updated_at` text NOT NULL,
        FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
        CONSTRAINT `media_kind_enum` CHECK(`kind` IN ('image', 'video', 'avatar', 'source')),
        CONSTRAINT `media_ref_count_nonneg` CHECK(`ref_count` >= 0),
        CONSTRAINT `media_status_enum` CHECK(`status` IN ('pending', 'attached', 'orphan', 'deleting'))
);

INSERT INTO `__new_media_assets` (
        `id`, `owner_id`, `kind`, `mime_type`, `byte_size`, `backend`,
        `storage_key`, `original_file_name`, `width`, `height`, `duration_ms`,
        `ref_count`, `status`, `created_at`, `updated_at`
)
SELECT
        `id`, `owner_id`, `kind`, `mime_type`, `byte_size`, `backend`,
        `storage_key`, `original_file_name`, `width`, `height`, `duration_ms`,
        `ref_count`, `status`, `created_at`, `updated_at`
FROM `media_assets`;

DROP TABLE `media_assets`;

ALTER TABLE `__new_media_assets` RENAME TO `media_assets`;

CREATE UNIQUE INDEX `uniq_media_storage_key` ON `media_assets` (`storage_key`);
CREATE INDEX `idx_media_owner` ON `media_assets` (`owner_id`, `created_at` DESC);
CREATE INDEX `idx_media_status_updated` ON `media_assets` (`status`, `updated_at`);

CREATE TRIGGER `users_avatar_media_assets_set_null`
        AFTER DELETE ON `media_assets`
        FOR EACH ROW
BEGIN
        UPDATE `users` SET `avatar_media_id` = NULL WHERE `avatar_media_id` = OLD.`id`;
END;

ALTER TABLE `notes` ADD COLUMN `source_file_id` text REFERENCES `media_assets`(`id`) ON DELETE SET NULL;
