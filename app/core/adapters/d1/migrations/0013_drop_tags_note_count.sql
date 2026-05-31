-- 0013_drop_tags_note_count.sql
-- Issue #372: drop the denormalised `tags.note_count` column along with
-- its dependent index (`idx_tags_owner_note_count`) and CHECK constraint
-- (`tags_note_count_nonneg`). The displayed tag usage count is a
-- read-time aggregate (Issue #365 / `D1TagRepository.findByOwner`), so the
-- stored column and its invariants are dead weight.
--
-- SQLite cannot `ALTER TABLE ... DROP COLUMN` a column referenced by a
-- table-level CHECK, and there is no `DROP CONSTRAINT`, so the table is
-- rebuilt (the recommended 12-step ALTER procedure). `note_tags` has a
-- FOREIGN KEY onto `tags(id)`; `PRAGMA defer_foreign_keys` (transaction-
-- safe, unlike toggling `foreign_keys`) holds enforcement until commit,
-- by which point the recreated `tags` table satisfies the reference.
--
-- The recreated table/index definitions are mechanically identical to
-- `0001_hollow_schema.sql:193-206` minus the `note_count` column,
-- `idx_tags_owner_note_count`, and `tags_note_count_nonneg` CHECK.

PRAGMA defer_foreign_keys = ON;

DROP INDEX IF EXISTS `idx_tags_owner_note_count`;

CREATE TABLE `__new_tags` (
        `id` text PRIMARY KEY NOT NULL,
        `owner_id` text NOT NULL,
        `name` text NOT NULL,
        `name_normalized` text NOT NULL,
        `version` integer DEFAULT 0 NOT NULL,
        `created_at` text NOT NULL,
        `updated_at` text NOT NULL,
        FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

INSERT INTO `__new_tags` (`id`, `owner_id`, `name`, `name_normalized`, `version`, `created_at`, `updated_at`)
SELECT `id`, `owner_id`, `name`, `name_normalized`, `version`, `created_at`, `updated_at` FROM `tags`;

DROP TABLE `tags`;

ALTER TABLE `__new_tags` RENAME TO `tags`;

CREATE UNIQUE INDEX `uniq_tags_owner_name_normalized` ON `tags` (`owner_id`, `name_normalized`);
