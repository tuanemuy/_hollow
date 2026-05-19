-- Issue #12 manual-test seed
-- ---------------------------------------------------------------------------
-- Provisions the data required by .issue/12/testing.md:
--   * User A (test-a@example.com): owns 3 notes + 6 export_jobs covering every
--     status branch (pending / processing / completed / completed-but-expired /
--     failed / cancelled). Used for BulkExportDialog → /exports/{jobId} flow,
--     poll display, download, cancel, failed display, expired-completed
--     display.
--   * User B (test-b@example.com): no data of their own, used as the actor in
--     the cross-user authorization edge case (open `/exports/{userA_jobId}` and
--     confirm neutral error message).
--
-- IDs:
--   01938f12-0000-7000-8000-0000000000a1   User A
--   01938f12-0000-7000-8000-0000000000a2   User A accounts row (credential)
--   01938f12-0000-7000-8000-0000000000a3   User A root directory
--   01938f12-0000-7000-8000-0000000000b1   User B
--   01938f12-0000-7000-8000-0000000000b2   User B accounts row (credential)
--   01938f12-0000-7000-8000-0000000000b3   User B root directory
--   01938f12-0000-7000-8000-000000000201..0203   User A notes
--   01938f12-0000-7000-8000-000000000301..0306   User A export_jobs
--
-- All UUIDs use the 7xxx-8xxx layout required by UuidV7Generator.validate.
-- Idempotent: every INSERT uses OR IGNORE; rerunning is safe.
-- Password for both users: Test1234!
-- Hash algorithm: PBKDF2-HMAC-SHA256, 600,000 iter, 16-byte salt, 32-byte key.
-- ---------------------------------------------------------------------------

-- --- Users ----------------------------------------------------------------
INSERT OR IGNORE INTO users (
  id, name, email, email_verified, image, created_at, updated_at,
  username, display_username, role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES
  ('01938f12-0000-7000-8000-0000000000a1',
   'test-a',
   'test-a@example.com',
   1,
   NULL,
   '2026-05-20T00:00:00.000Z',
   '2026-05-20T00:00:00.000Z',
   'test-a',
   'test-a',
   'member',
   0,
   NULL,
   NULL,
   NULL,
   NULL,
   NULL,
   NULL),
  ('01938f12-0000-7000-8000-0000000000b1',
   'test-b',
   'test-b@example.com',
   1,
   NULL,
   '2026-05-20T00:00:00.000Z',
   '2026-05-20T00:00:00.000Z',
   'test-b',
   'test-b',
   'member',
   0,
   NULL,
   NULL,
   NULL,
   NULL,
   NULL,
   NULL);

-- --- Accounts (credential password) ---------------------------------------
-- Password: Test1234!
INSERT OR IGNORE INTO accounts (
  id, user_id, account_id, provider_id, password,
  access_token, refresh_token, id_token,
  access_token_expires_at, refresh_token_expires_at, scope,
  created_at, updated_at
) VALUES
  ('01938f12-0000-7000-8000-0000000000a2',
   '01938f12-0000-7000-8000-0000000000a1',
   '01938f12-0000-7000-8000-0000000000a1',
   'credential',
   'pbkdf2-sha256-v1$600000$r0/+zQoKr7cPMTeBPfU5dg==$K585ytdmUnr6XyDhBHQifXqvdGfqkwB2qMtSFw+jhyk=',
   NULL, NULL, NULL, NULL, NULL, NULL,
   '2026-05-20T00:00:00.000Z',
   '2026-05-20T00:00:00.000Z'),
  ('01938f12-0000-7000-8000-0000000000b2',
   '01938f12-0000-7000-8000-0000000000b1',
   '01938f12-0000-7000-8000-0000000000b1',
   'credential',
   'pbkdf2-sha256-v1$600000$S5qQRnPGBHx87qXYv2hrwQ==$tumvTLF8SSWYXmGH0Y4itEHerh4SBmWqq33EQfLN1Xk=',
   NULL, NULL, NULL, NULL, NULL, NULL,
   '2026-05-20T00:00:00.000Z',
   '2026-05-20T00:00:00.000Z');

-- --- Root directories -----------------------------------------------------
INSERT OR IGNORE INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES
  ('01938f12-0000-7000-8000-0000000000a3',
   '01938f12-0000-7000-8000-0000000000a1',
   NULL,
   '',
   '',
   0,
   0,
   '2026-05-20T00:00:00.000Z',
   '2026-05-20T00:00:00.000Z'),
  ('01938f12-0000-7000-8000-0000000000b3',
   '01938f12-0000-7000-8000-0000000000b1',
   NULL,
   '',
   '',
   0,
   0,
   '2026-05-20T00:00:00.000Z',
   '2026-05-20T00:00:00.000Z');

-- --- User A notes (for BulkExportDialog scope=multiple) -------------------
INSERT OR IGNORE INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at, version
) VALUES
  ('01938f12-0000-7000-8000-000000000201',
   '01938f12-0000-7000-8000-0000000000a1',
   '01938f12-0000-7000-8000-0000000000a3',
   'issue12-note-1',
   'Issue12 Note 1',
   '<p>Issue12 note 1 content.</p>',
   '{}',
   'active',
   NULL,
   '2026-05-20T00:00:00.000Z',
   '2026-05-20T00:00:00.000Z',
   0),
  ('01938f12-0000-7000-8000-000000000202',
   '01938f12-0000-7000-8000-0000000000a1',
   '01938f12-0000-7000-8000-0000000000a3',
   'issue12-note-2',
   'Issue12 Note 2',
   '<p>Issue12 note 2 content.</p>',
   '{}',
   'active',
   NULL,
   '2026-05-20T00:00:00.000Z',
   '2026-05-20T00:00:00.000Z',
   0),
  ('01938f12-0000-7000-8000-000000000203',
   '01938f12-0000-7000-8000-0000000000a1',
   '01938f12-0000-7000-8000-0000000000a3',
   'issue12-note-3',
   'Issue12 Note 3',
   '<p>Issue12 note 3 content.</p>',
   '{}',
   'active',
   NULL,
   '2026-05-20T00:00:00.000Z',
   '2026-05-20T00:00:00.000Z',
   0);

-- --- Export jobs (all owned by User A) -------------------------------------
-- options_json must be a valid SerializedOptions: { includeFrontMatter, embedMedia, pdfPaperSize }.
-- target_note_ids_json is a string[] (empty array allowed for scope=view; for
-- scope=multiple we list the 3 User A notes).

-- 1) pending (scope=multiple, markdown)
INSERT OR IGNORE INTO export_jobs (
  id, owner_id, format, scope,
  target_note_ids_json, view_query_json, options_json,
  status, artifact_key, artifact_size, error_code, error_reason,
  progress_processed, progress_total, failed_note_ids_json,
  created_at, updated_at, completed_at, expires_at, version
) VALUES (
  '01938f12-0000-7000-8000-000000000301',
  '01938f12-0000-7000-8000-0000000000a1',
  'markdown',
  'multiple',
  '["01938f12-0000-7000-8000-000000000201","01938f12-0000-7000-8000-000000000202","01938f12-0000-7000-8000-000000000203"]',
  NULL,
  '{"includeFrontMatter":true,"embedMedia":false,"pdfPaperSize":null}',
  'pending',
  NULL, NULL, NULL, NULL,
  0, 0, '[]',
  '2026-05-20T00:00:00.000Z',
  '2026-05-20T00:00:00.000Z',
  NULL, NULL, 0
);

-- 2) processing (scope=multiple, markdown, progress 2/5)
INSERT OR IGNORE INTO export_jobs (
  id, owner_id, format, scope,
  target_note_ids_json, view_query_json, options_json,
  status, artifact_key, artifact_size, error_code, error_reason,
  progress_processed, progress_total, failed_note_ids_json,
  created_at, updated_at, completed_at, expires_at, version
) VALUES (
  '01938f12-0000-7000-8000-000000000302',
  '01938f12-0000-7000-8000-0000000000a1',
  'markdown',
  'multiple',
  '["01938f12-0000-7000-8000-000000000201","01938f12-0000-7000-8000-000000000202","01938f12-0000-7000-8000-000000000203"]',
  NULL,
  '{"includeFrontMatter":true,"embedMedia":false,"pdfPaperSize":null}',
  'processing',
  NULL, NULL, NULL, NULL,
  2, 5, '[]',
  '2026-05-20T00:00:00.000Z',
  '2026-05-20T00:01:00.000Z',
  NULL, NULL, 0
);

-- 3) completed (download link active, expires_at in 2099)
INSERT OR IGNORE INTO export_jobs (
  id, owner_id, format, scope,
  target_note_ids_json, view_query_json, options_json,
  status, artifact_key, artifact_size, error_code, error_reason,
  progress_processed, progress_total, failed_note_ids_json,
  created_at, updated_at, completed_at, expires_at, version
) VALUES (
  '01938f12-0000-7000-8000-000000000303',
  '01938f12-0000-7000-8000-0000000000a1',
  'markdown',
  'multiple',
  '["01938f12-0000-7000-8000-000000000201","01938f12-0000-7000-8000-000000000202","01938f12-0000-7000-8000-000000000203"]',
  NULL,
  '{"includeFrontMatter":true,"embedMedia":false,"pdfPaperSize":null}',
  'completed',
  'exports/01938f12-0000-7000-8000-000000000303/artifact.zip',
  4096,
  NULL, NULL,
  3, 3, '[]',
  '2026-05-20T00:00:00.000Z',
  '2026-05-20T00:05:00.000Z',
  '2026-05-20T00:05:00.000Z',
  '2099-12-31T23:59:59.000Z',
  0
);

-- 4) completed but expires_at in the past (UI must hide download button) ---
INSERT OR IGNORE INTO export_jobs (
  id, owner_id, format, scope,
  target_note_ids_json, view_query_json, options_json,
  status, artifact_key, artifact_size, error_code, error_reason,
  progress_processed, progress_total, failed_note_ids_json,
  created_at, updated_at, completed_at, expires_at, version
) VALUES (
  '01938f12-0000-7000-8000-000000000304',
  '01938f12-0000-7000-8000-0000000000a1',
  'markdown',
  'multiple',
  '["01938f12-0000-7000-8000-000000000201","01938f12-0000-7000-8000-000000000202","01938f12-0000-7000-8000-000000000203"]',
  NULL,
  '{"includeFrontMatter":true,"embedMedia":false,"pdfPaperSize":null}',
  'completed',
  'exports/01938f12-0000-7000-8000-000000000304/artifact.zip',
  2048,
  NULL, NULL,
  3, 3, '[]',
  '2025-04-01T00:00:00.000Z',
  '2025-04-01T00:05:00.000Z',
  '2025-04-01T00:05:00.000Z',
  '2025-04-08T00:05:00.000Z',
  0
);

-- 5) failed (with errorCode + errorReason + failed_note_ids) ---------------
INSERT OR IGNORE INTO export_jobs (
  id, owner_id, format, scope,
  target_note_ids_json, view_query_json, options_json,
  status, artifact_key, artifact_size, error_code, error_reason,
  progress_processed, progress_total, failed_note_ids_json,
  created_at, updated_at, completed_at, expires_at, version
) VALUES (
  '01938f12-0000-7000-8000-000000000305',
  '01938f12-0000-7000-8000-0000000000a1',
  'pdf',
  'multiple',
  '["01938f12-0000-7000-8000-000000000201","01938f12-0000-7000-8000-000000000202","01938f12-0000-7000-8000-000000000203"]',
  NULL,
  '{"includeFrontMatter":true,"embedMedia":true,"pdfPaperSize":"A4"}',
  'failed',
  NULL, NULL,
  'PdfRenderError',
  'PDF render failed: page rasterizer ran out of memory while processing note 02.',
  1, 3,
  '["01938f12-0000-7000-8000-000000000202","01938f12-0000-7000-8000-000000000203"]',
  '2026-05-20T00:00:00.000Z',
  '2026-05-20T00:02:00.000Z',
  '2026-05-20T00:02:00.000Z',
  NULL, 0
);

-- 6) cancelled -------------------------------------------------------------
INSERT OR IGNORE INTO export_jobs (
  id, owner_id, format, scope,
  target_note_ids_json, view_query_json, options_json,
  status, artifact_key, artifact_size, error_code, error_reason,
  progress_processed, progress_total, failed_note_ids_json,
  created_at, updated_at, completed_at, expires_at, version
) VALUES (
  '01938f12-0000-7000-8000-000000000306',
  '01938f12-0000-7000-8000-0000000000a1',
  'markdown',
  'multiple',
  '["01938f12-0000-7000-8000-000000000201","01938f12-0000-7000-8000-000000000202","01938f12-0000-7000-8000-000000000203"]',
  NULL,
  '{"includeFrontMatter":true,"embedMedia":false,"pdfPaperSize":null}',
  'cancelled',
  NULL, NULL, NULL, NULL,
  0, 3, '[]',
  '2026-05-20T00:00:00.000Z',
  '2026-05-20T00:00:30.000Z',
  '2026-05-20T00:00:30.000Z',
  NULL, 0
);
