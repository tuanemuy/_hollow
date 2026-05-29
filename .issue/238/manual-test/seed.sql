-- Issue #238 manual-test seed: a `discarded` job plus a retained job so the
-- "show discarded" toggle on /upload can be verified.
--
-- Owner is the baseline test account `existing@example.com`
-- (user.id 01938f00-0000-7000-8000-0000000000a1, member, email_verified=1),
-- already present in local D1 — see .issue/254/manual-test/seed-data.md.
--
-- Column reference (table `ingestion_jobs`, app/core/adapters/d1/schema.ts):
--   id, owner_id (FK users.id), original_file_name, mime_type, byte_size (>0),
--   kind, status, temp_storage_key, preview_json, error_code, error_reason,
--   regeneration_count, saved_as_note_id, version, created_at, updated_at.
--
-- A `discarded` job may carry NULL error_code / error_reason / preview_json
-- (IngestionJob.reconstruct allows it). A `failed` job must carry both
-- error_code and error_reason (error_code='llm_failure').
--
-- INSERT OR IGNORE keyed on PRIMARY KEY(id) makes re-running safe. To re-seed:
--   DELETE FROM ingestion_jobs WHERE id IN
--     ('019e0238-0238-7000-8000-0000000000d1',
--      '019e0238-0238-7000-8000-0000000000f1');

-- discarded job — hidden by default, revealed when the toggle is ON
INSERT OR IGNORE INTO ingestion_jobs (
  id, owner_id, original_file_name, mime_type, byte_size, kind, status,
  temp_storage_key, preview_json, error_code, error_reason,
  regeneration_count, saved_as_note_id, version, created_at, updated_at
) VALUES (
  '019e0238-0238-7000-8000-0000000000d1',
  '01938f00-0000-7000-8000-0000000000a1',
  '[TEST-238] discarded-draft.md',
  'text/markdown',
  2048,
  'markdown',
  'discarded',
  NULL,
  NULL,
  NULL,
  NULL,
  0,
  NULL,
  0,
  '2026-05-29T00:10:00.000Z',
  '2026-05-29T00:11:00.000Z'
);

-- retained (failed) job — always visible regardless of the toggle, so the
-- toggle's filtering effect is observable against a stable baseline.
INSERT OR IGNORE INTO ingestion_jobs (
  id, owner_id, original_file_name, mime_type, byte_size, kind, status,
  temp_storage_key, preview_json, error_code, error_reason,
  regeneration_count, saved_as_note_id, version, created_at, updated_at
) VALUES (
  '019e0238-0238-7000-8000-0000000000f1',
  '01938f00-0000-7000-8000-0000000000a1',
  '[TEST-238] kept-failed.md',
  'text/markdown',
  4096,
  'markdown',
  'failed',
  '01938f00-0000-7000-8000-0000000000a1/ingestion/019e0238-0238-7000-8000-0000000000f1',
  NULL,
  'llm_failure',
  'LLM provider returned an error while structuring the document. Please retry.',
  0,
  NULL,
  0,
  '2026-05-29T00:12:00.000Z',
  '2026-05-29T00:13:00.000Z'
);
