-- Add OCC `version` column to `export_jobs`. The export adapter uses the
-- shared `TransactionalRepository` contract whose OCC token is keyed off
-- this column; matching the convention used by `todos.version` and the
-- publication aggregates.

ALTER TABLE `export_jobs` ADD COLUMN `version` integer DEFAULT 0 NOT NULL;
