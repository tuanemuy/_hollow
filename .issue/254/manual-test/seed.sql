-- Issue #254 manual-test seed: owner-retryable `failed` ingestion jobs
--
-- Inserts 2 `status='failed'` ingestion_jobs owned by the baseline test
-- account `existing@example.com` (user.id 01938f00-0000-7000-8000-0000000000a1,
-- member, email_verified=1, banned=0; already present in local D1).
--
-- Both rows carry a non-NULL `temp_storage_key`, so the owner-retry path
-- (`IngestionJob.retry`) is exercised rather than the
-- `ingestion_no_temp_storage_for_retry` branch. They surface in both the
-- queue screen (P13, /upload) and the upload modal because the
-- owner-scoped listing returns `failed` jobs.
--
-- Column reference (table `ingestion_jobs`, see app/core/adapters/d1/schema.ts):
--   id, owner_id (FK users.id), original_file_name, mime_type, byte_size (>0),
--   kind (html|markdown|office|pdfTextual|pdfScanned|image|audio|plain),
--   status (pending|processing|previewing|saved|failed|discarded),
--   temp_storage_key (nullable; the retry payload reference),
--   preview_json, error_code, error_reason, regeneration_count,
--   saved_as_note_id, version (OCC), created_at, updated_at.
--
-- A `failed` job must carry both error_code and error_reason (enforced by
-- IngestionJob.reconstruct). error_code='llm_failure' mirrors
-- runIngestionJob.classifyPipelineError for an LLM structuring failure.
--
-- INSERT OR IGNORE keyed on PRIMARY KEY(id) makes re-running safe.
-- To re-run after a retry has consumed a row, DELETE the two ids first:
--   DELETE FROM ingestion_jobs WHERE id IN
--     ('019e7254-0254-7000-8000-0000000000f1',
--      '019e7254-0254-7000-8000-0000000000f2');

-- failed job #1 — markdown upload that failed LLM structuring
INSERT OR IGNORE INTO ingestion_jobs (
  id, owner_id, original_file_name, mime_type, byte_size, kind, status,
  temp_storage_key, preview_json, error_code, error_reason,
  regeneration_count, saved_as_note_id, version, created_at, updated_at
) VALUES (
  '019e7254-0254-7000-8000-0000000000f1',
  '01938f00-0000-7000-8000-0000000000a1',
  '[TEST-254] meeting-notes.md',
  'text/markdown',
  4096,
  'markdown',
  'failed',
  '01938f00-0000-7000-8000-0000000000a1/ingestion/019e7254-0254-7000-8000-0000000000f1',
  NULL,
  'llm_failure',
  'LLM provider returned an error while structuring the document. Please retry.',
  0,
  NULL,
  0,
  '2026-05-29T00:00:00.000Z',
  '2026-05-29T00:01:00.000Z'
);

-- failed job #2 — PDF upload that failed LLM structuring
INSERT OR IGNORE INTO ingestion_jobs (
  id, owner_id, original_file_name, mime_type, byte_size, kind, status,
  temp_storage_key, preview_json, error_code, error_reason,
  regeneration_count, saved_as_note_id, version, created_at, updated_at
) VALUES (
  '019e7254-0254-7000-8000-0000000000f2',
  '01938f00-0000-7000-8000-0000000000a1',
  '[TEST-254] invoice-2026Q2.pdf',
  'application/pdf',
  20480,
  'pdfTextual',
  'failed',
  '01938f00-0000-7000-8000-0000000000a1/ingestion/019e7254-0254-7000-8000-0000000000f2',
  NULL,
  'llm_failure',
  'Structuring the PDF text failed (LLM timeout). Retry to re-run the pipeline.',
  0,
  NULL,
  0,
  '2026-05-29T00:02:00.000Z',
  '2026-05-29T00:03:00.000Z'
);
