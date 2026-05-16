-- Add OCC `version` columns to publication aggregates and a `version` /
-- `updated_at` column to `share_links`. The publication adapters use the
-- shared `TransactionalRepository` contract whose OCC token is keyed off
-- this column; matching the convention used by `todos.version`.

ALTER TABLE `publication_states` ADD COLUMN `version` integer DEFAULT 0 NOT NULL;

ALTER TABLE `share_links` ADD COLUMN `updated_at` text NOT NULL DEFAULT '';
ALTER TABLE `share_links` ADD COLUMN `version` integer DEFAULT 0 NOT NULL;

-- Backfill `updated_at` for any pre-existing rows so the column is usable
-- without an empty-string sentinel leaking into the domain.
UPDATE `share_links` SET `updated_at` = `created_at` WHERE `updated_at` = '';
