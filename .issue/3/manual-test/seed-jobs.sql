-- Seed jobs for Issue #3 manual tests (/admin/jobs)
-- Owners (from .manual-test/2026-05-17/seed.sql):
--   admin  = 01938f00-0000-7000-8000-0000000000c1  (admin@example.com)
--   member = 01938f00-0000-7000-8000-0000000000a1  (existing@example.com)
--
-- ID scheme for this seed: 01938f03-0000-7000-8000-0000000003{NN}
--   ingestion_jobs: NN = 01..05
--   export_jobs   : NN = 11..14
--
-- Re-runnable: uses INSERT OR IGNORE. Drop rows via the cleanup block below.

-- ---------------------------------------------------------------------------
-- Cleanup (uncomment to reset before re-seeding)
-- ---------------------------------------------------------------------------
-- DELETE FROM ingestion_jobs WHERE id LIKE '01938f03-0000-7000-8000-0000000003%';
-- DELETE FROM export_jobs    WHERE id LIKE '01938f03-0000-7000-8000-0000000003%';

-- ---------------------------------------------------------------------------
-- ingestion_jobs
-- ---------------------------------------------------------------------------

-- 1) failed (admin owner, temp_storage_key present, error_code=TEMP_STORAGE_ERROR)
--    TC-2 / TC-4 用: retry 可能な失敗ジョブ。先頭表示 & retry 動作確認。
INSERT OR IGNORE INTO ingestion_jobs (
  id, owner_id, original_file_name, mime_type, byte_size, kind, status,
  temp_storage_key, preview_json, error_code, error_reason,
  regeneration_count, saved_as_note_id, version, created_at, updated_at
) VALUES (
  '01938f03-0000-7000-8000-000000000301',
  '01938f00-0000-7000-8000-0000000000c1',
  'failed-admin.md', 'text/markdown', 2048, 'markdown', 'failed',
  'tmp/ingestion/01938f03-0000-7000-8000-000000000301.md', NULL,
  'INGESTION_TEMP_STORAGE_ERROR', 'temporary storage read failed during retry',
  0, NULL, 1,
  '2026-05-18T10:00:00.000Z', '2026-05-18T11:00:00.000Z'
);

-- 2) failed (member owner, temp_storage_key present, error_code=PARSE_ERROR)
--    TC-2 用: 別オーナーの failed が同じテーブルに混在することの確認。
INSERT OR IGNORE INTO ingestion_jobs (
  id, owner_id, original_file_name, mime_type, byte_size, kind, status,
  temp_storage_key, preview_json, error_code, error_reason,
  regeneration_count, saved_as_note_id, version, created_at, updated_at
) VALUES (
  '01938f03-0000-7000-8000-000000000302',
  '01938f00-0000-7000-8000-0000000000a1',
  'failed-member.html', 'text/html', 4096, 'html', 'failed',
  'tmp/ingestion/01938f03-0000-7000-8000-000000000302.html', NULL,
  'INGESTION_PARSE_ERROR', 'HTML parse error: unexpected token',
  0, NULL, 1,
  '2026-05-18T09:30:00.000Z', '2026-05-18T10:30:00.000Z'
);

-- 3) failed (admin owner, temp_storage_key=NULL)
--    エッジケース 3 用: 物理 blob 不在 → retry が NO_TEMP_STORAGE_FOR_RETRY で拒否される。
INSERT OR IGNORE INTO ingestion_jobs (
  id, owner_id, original_file_name, mime_type, byte_size, kind, status,
  temp_storage_key, preview_json, error_code, error_reason,
  regeneration_count, saved_as_note_id, version, created_at, updated_at
) VALUES (
  '01938f03-0000-7000-8000-000000000303',
  '01938f00-0000-7000-8000-0000000000c1',
  'failed-noblob.md', 'text/markdown', 1024, 'markdown', 'failed',
  NULL, NULL,
  'INGESTION_TEMP_STORAGE_ERROR', 'temp storage blob has been purged',
  0, NULL, 1,
  '2026-05-18T08:00:00.000Z', '2026-05-18T09:00:00.000Z'
);

-- 4) pending (member owner)
--    テーブル表示 & 並び順確認用。
INSERT OR IGNORE INTO ingestion_jobs (
  id, owner_id, original_file_name, mime_type, byte_size, kind, status,
  temp_storage_key, preview_json, error_code, error_reason,
  regeneration_count, saved_as_note_id, version, created_at, updated_at
) VALUES (
  '01938f03-0000-7000-8000-000000000304',
  '01938f00-0000-7000-8000-0000000000a1',
  'pending-member.md', 'text/markdown', 1500, 'markdown', 'pending',
  'tmp/ingestion/01938f03-0000-7000-8000-000000000304.md', NULL,
  NULL, NULL,
  0, NULL, 1,
  '2026-05-18T07:30:00.000Z', '2026-05-18T07:30:00.000Z'
);

-- 5) saved (admin owner) — "completed" 相当
--    並び順確認用: failed が先頭、saved/pending は updated_at で並ぶ。
INSERT OR IGNORE INTO ingestion_jobs (
  id, owner_id, original_file_name, mime_type, byte_size, kind, status,
  temp_storage_key, preview_json, error_code, error_reason,
  regeneration_count, saved_as_note_id, version, created_at, updated_at
) VALUES (
  '01938f03-0000-7000-8000-000000000305',
  '01938f00-0000-7000-8000-0000000000c1',
  'saved-admin.md', 'text/markdown', 2200, 'markdown', 'saved',
  NULL, NULL,
  NULL, NULL,
  0, NULL, 2,
  '2026-05-18T06:00:00.000Z', '2026-05-18T06:30:00.000Z'
);

-- ---------------------------------------------------------------------------
-- export_jobs
-- ---------------------------------------------------------------------------

-- 11) failed (admin owner, progress 有意値 / completed_at NOT NULL)
--     TC-3 / TC-5 用: retry 後に progress / completedAt / failedNoteIds が
--     リセットされる動作を確認するため、ゼロでない値を入れておく。
INSERT OR IGNORE INTO export_jobs (
  id, owner_id, format, scope, target_note_ids_json, view_query_json,
  options_json, status, artifact_key, artifact_size,
  error_code, error_reason,
  progress_processed, progress_total, failed_note_ids_json,
  version, created_at, updated_at, completed_at, expires_at
) VALUES (
  '01938f03-0000-7000-8000-000000000311',
  '01938f00-0000-7000-8000-0000000000c1',
  'markdown', 'single',
  '["01938f04-0000-7000-8000-000000000001"]',
  NULL,
  '{"includeFrontMatter":true,"embedMedia":false,"pdfPaperSize":"a4"}',
  'failed',
  NULL, NULL,
  'EXPORT_RENDER_ERROR', 'failed to render note 01938f04-...0001',
  3, 5,
  '["01938f04-0000-7000-8000-000000000001"]',
  1,
  '2026-05-18T10:00:00.000Z', '2026-05-18T11:00:00.000Z',
  '2026-05-18T11:00:00.000Z',
  NULL
);

-- 12) failed (member owner)
--     TC-3 用: 別オーナー横断確認。
INSERT OR IGNORE INTO export_jobs (
  id, owner_id, format, scope, target_note_ids_json, view_query_json,
  options_json, status, artifact_key, artifact_size,
  error_code, error_reason,
  progress_processed, progress_total, failed_note_ids_json,
  version, created_at, updated_at, completed_at, expires_at
) VALUES (
  '01938f03-0000-7000-8000-000000000312',
  '01938f00-0000-7000-8000-0000000000a1',
  'html', 'multiple',
  '["01938f04-0000-7000-8000-000000000002","01938f04-0000-7000-8000-000000000003"]',
  NULL,
  '{"includeFrontMatter":false,"embedMedia":true,"pdfPaperSize":"a4"}',
  'failed',
  NULL, NULL,
  'EXPORT_RENDER_ERROR', 'partial render failure',
  1, 2,
  '["01938f04-0000-7000-8000-000000000003"]',
  1,
  '2026-05-18T09:30:00.000Z', '2026-05-18T10:30:00.000Z',
  '2026-05-18T10:30:00.000Z',
  NULL
);

-- 13) pending (member owner)
--     表示確認 & 並び順確認用。
INSERT OR IGNORE INTO export_jobs (
  id, owner_id, format, scope, target_note_ids_json, view_query_json,
  options_json, status, artifact_key, artifact_size,
  error_code, error_reason,
  progress_processed, progress_total, failed_note_ids_json,
  version, created_at, updated_at, completed_at, expires_at
) VALUES (
  '01938f03-0000-7000-8000-000000000313',
  '01938f00-0000-7000-8000-0000000000a1',
  'markdown', 'single',
  '["01938f04-0000-7000-8000-000000000004"]',
  NULL,
  '{"includeFrontMatter":true,"embedMedia":false,"pdfPaperSize":"a4"}',
  'pending',
  NULL, NULL,
  NULL, NULL,
  0, 0,
  '[]',
  1,
  '2026-05-18T08:00:00.000Z', '2026-05-18T08:00:00.000Z',
  NULL,
  NULL
);

-- 14) completed (admin owner)
--     並び順確認用: failed が先頭、completed/pending は updated_at 降順。
INSERT OR IGNORE INTO export_jobs (
  id, owner_id, format, scope, target_note_ids_json, view_query_json,
  options_json, status, artifact_key, artifact_size,
  error_code, error_reason,
  progress_processed, progress_total, failed_note_ids_json,
  version, created_at, updated_at, completed_at, expires_at
) VALUES (
  '01938f03-0000-7000-8000-000000000314',
  '01938f00-0000-7000-8000-0000000000c1',
  'pdf', 'single',
  '["01938f04-0000-7000-8000-000000000005"]',
  NULL,
  '{"includeFrontMatter":true,"embedMedia":true,"pdfPaperSize":"a4"}',
  'completed',
  'exports/01938f03-0000-7000-8000-000000000314.pdf', 524288,
  NULL, NULL,
  1, 1,
  '[]',
  2,
  '2026-05-18T06:00:00.000Z', '2026-05-18T06:30:00.000Z',
  '2026-05-18T06:30:00.000Z',
  '2026-06-17T06:30:00.000Z'
);
