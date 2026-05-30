-- Issue #228: per-upload custom prompt overrides on ingestion_jobs.
-- Each column carries an already-interpolated prompt body (max 16 KiB,
-- enforced by the PromptOverride VO) applied to that single upload only.
-- Both are nullable so existing rows (NULL = no override, fall back to
-- the resolver) remain valid without a backfill. The columns are written
-- on insert and treated as immutable provenance — the OCC update path
-- (D1IngestionJobRepository.save) never rewrites them. See #228 ADR-002.

ALTER TABLE ingestion_jobs ADD COLUMN structure_prompt_override TEXT;
ALTER TABLE ingestion_jobs ADD COLUMN metadata_prompt_override TEXT;
