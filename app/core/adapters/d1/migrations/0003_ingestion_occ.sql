-- Add OCC `version` column to `ingestion_jobs`. The `IngestionJob`
-- aggregate is wired through the shared `TransactionalRepository`
-- contract whose OCC token is keyed off this column; matching the
-- convention used by `todos.version` / `publication_states.version`.

ALTER TABLE `ingestion_jobs` ADD COLUMN `version` integer DEFAULT 0 NOT NULL;
