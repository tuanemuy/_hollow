-- Seed ingestion_jobs for Issue #790 manual test (sidebar upload count badge).
--
-- Owner: dev-admin (01950000-0000-7000-8000-000000000001), seeded via
--        `pnpm seed:dev-admin`. The count badge is per-owner.
--
-- Count source: countActiveIngestionJobs -> countByOwner with statuses
--   ('pending','processing','previewing'). 'failed'/'saved'/'discarded' are
--   intentionally NOT counted.
--
-- This seed produces an active count of 4 for dev-admin:
--   2 pending + 1 processing + 1 previewing.
-- Plus 1 failed + 1 saved that must NOT be counted (exclusion check).
--
-- ID scheme: 01950790-0000-7000-8000-0000000790{NN}  (NN = 01..06)
-- Re-runnable: INSERT OR IGNORE. Reset with the cleanup block below.

-- ---------------------------------------------------------------------------
-- Cleanup (uncomment to reset before re-seeding)
-- ---------------------------------------------------------------------------
-- DELETE FROM ingestion_jobs WHERE id LIKE '01950790-0000-7000-8000-000000079%';

-- 1) pending (counts)
INSERT OR IGNORE INTO ingestion_jobs (
  id, owner_id, original_file_name, mime_type, byte_size, kind, status,
  temp_storage_key, preview_json, error_code, error_reason,
  regeneration_count, saved_as_note_id, version, created_at, updated_at
) VALUES (
  '01950790-0000-7000-8000-000000079001',
  '01950000-0000-7000-8000-000000000001',
  'test-790-pending-1.md', 'text/markdown', 2048, 'markdown', 'pending',
  'tmp/ingestion/01950790-0000-7000-8000-000000079001.md', NULL,
  NULL, NULL,
  0, NULL, 0,
  '2026-06-28T10:00:00.000Z', '2026-06-28T10:00:00.000Z'
);

-- 2) pending (counts)
INSERT OR IGNORE INTO ingestion_jobs (
  id, owner_id, original_file_name, mime_type, byte_size, kind, status,
  temp_storage_key, preview_json, error_code, error_reason,
  regeneration_count, saved_as_note_id, version, created_at, updated_at
) VALUES (
  '01950790-0000-7000-8000-000000079002',
  '01950000-0000-7000-8000-000000000001',
  'test-790-pending-2.html', 'text/html', 4096, 'html', 'pending',
  'tmp/ingestion/01950790-0000-7000-8000-000000079002.html', NULL,
  NULL, NULL,
  0, NULL, 0,
  '2026-06-28T10:01:00.000Z', '2026-06-28T10:01:00.000Z'
);

-- 3) processing (counts)
INSERT OR IGNORE INTO ingestion_jobs (
  id, owner_id, original_file_name, mime_type, byte_size, kind, status,
  temp_storage_key, preview_json, error_code, error_reason,
  regeneration_count, saved_as_note_id, version, created_at, updated_at
) VALUES (
  '01950790-0000-7000-8000-000000079003',
  '01950000-0000-7000-8000-000000000001',
  'test-790-processing.md', 'text/markdown', 1500, 'markdown', 'processing',
  'tmp/ingestion/01950790-0000-7000-8000-000000079003.md', NULL,
  NULL, NULL,
  0, NULL, 0,
  '2026-06-28T10:02:00.000Z', '2026-06-28T10:02:00.000Z'
);

-- 4) previewing (counts) — has preview_json
INSERT OR IGNORE INTO ingestion_jobs (
  id, owner_id, original_file_name, mime_type, byte_size, kind, status,
  temp_storage_key, preview_json, error_code, error_reason,
  regeneration_count, saved_as_note_id, version, created_at, updated_at
) VALUES (
  '01950790-0000-7000-8000-000000079004',
  '01950000-0000-7000-8000-000000000001',
  'test-790-previewing.md', 'text/markdown', 3072, 'markdown', 'previewing',
  'tmp/ingestion/01950790-0000-7000-8000-000000079004.md',
  '{"title":"Test 790 Preview","bodyMarkdown":"# Preview\n\ndev seed"}',
  NULL, NULL,
  0, NULL, 0,
  '2026-06-28T10:03:00.000Z', '2026-06-28T10:03:00.000Z'
);

-- 5) failed (must NOT count) — exclusion check
INSERT OR IGNORE INTO ingestion_jobs (
  id, owner_id, original_file_name, mime_type, byte_size, kind, status,
  temp_storage_key, preview_json, error_code, error_reason,
  regeneration_count, saved_as_note_id, version, created_at, updated_at
) VALUES (
  '01950790-0000-7000-8000-000000079005',
  '01950000-0000-7000-8000-000000000001',
  'test-790-failed.md', 'text/markdown', 1024, 'markdown', 'failed',
  'tmp/ingestion/01950790-0000-7000-8000-000000079005.md', NULL,
  'INGESTION_PARSE_ERROR', 'seed: failed must not be counted',
  0, NULL, 0,
  '2026-06-28T09:00:00.000Z', '2026-06-28T09:30:00.000Z'
);

-- 6) saved (must NOT count) — exclusion check
INSERT OR IGNORE INTO ingestion_jobs (
  id, owner_id, original_file_name, mime_type, byte_size, kind, status,
  temp_storage_key, preview_json, error_code, error_reason,
  regeneration_count, saved_as_note_id, version, created_at, updated_at
) VALUES (
  '01950790-0000-7000-8000-000000079006',
  '01950000-0000-7000-8000-000000000001',
  'test-790-saved.md', 'text/markdown', 2560, 'markdown', 'saved',
  NULL, NULL,
  NULL, NULL,
  0, NULL, 0,
  '2026-06-28T08:00:00.000Z', '2026-06-28T08:30:00.000Z'
);
