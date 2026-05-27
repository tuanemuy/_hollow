-- Seed for Issue #229 manual test
-- Manual-test baseline (.manual-test/2026-05-17/seed.sql) は事前に流して
-- おく前提（users / accounts / directories が必要）。
--
-- 検証で使うアカウントは baseline seed の以下 2 名:
--   User A (member) = 01938f00-0000-7000-8000-0000000000a1
--                     existing@example.com / Password123!
--   User B (member) = 01938f00-0000-7000-8000-0000000000b1
--                     existing-new@example.com / Password123!
-- 注: baseline では mailowner が User B。本Issueでは「他人のジョブが見え
--     ないこと」の検証のために役割を割り当てているだけで、ユーザー名は
--     変更しない。
--
-- ID scheme (re-runnable, INSERT OR IGNORE):
--   01938f04-0000-7000-8000-0000002290NN
--     NN = 01: User A の previewing ジョブ
--     NN = 02: User A の discarded ジョブ
--     NN = 03: User B の previewing ジョブ
--
-- 戦略B(直接 INSERT)を採用した理由は seed-data.md を参照。
--
-- Cleanup:
--   DELETE FROM ingestion_jobs WHERE id LIKE '01938f04-0000-7000-8000-000000229%';

-- ---------------------------------------------------------------------------
-- 1) User A — previewing job (取り込みキューに残るべき: 既存挙動の維持確認)
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO ingestion_jobs (
  id, owner_id, original_file_name, mime_type, byte_size, kind, status,
  temp_storage_key, preview_json, error_code, error_reason,
  regeneration_count, saved_as_note_id, version, created_at, updated_at
) VALUES (
  '01938f04-0000-7000-8000-000000022901',
  '01938f00-0000-7000-8000-0000000000a1',
  'issue229-userA-previewing.md', 'text/markdown', 1024, 'markdown', 'previewing',
  '01938f00-0000-7000-8000-0000000000a1/ingestion/01938f04-0000-7000-8000-000000022901',
  '{"title":"Issue #229 — UserA previewing","contentHtml":"<p>This previewing job belongs to User A. It must remain visible in the upload queue.</p>","suggestedDirectoryId":null,"suggestedDirectoryName":null,"frontMatter":{},"suggestedTagNames":[],"internalLinkRefs":[],"mediaRefs":[]}',
  NULL, NULL,
  0, NULL, 2,
  '2026-05-27T00:00:00.000Z', '2026-05-27T00:05:00.000Z'
);

-- ---------------------------------------------------------------------------
-- 2) User A — discarded job (取り込みキューから消えるべき: 本Issue核心)
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO ingestion_jobs (
  id, owner_id, original_file_name, mime_type, byte_size, kind, status,
  temp_storage_key, preview_json, error_code, error_reason,
  regeneration_count, saved_as_note_id, version, created_at, updated_at
) VALUES (
  '01938f04-0000-7000-8000-000000022902',
  '01938f00-0000-7000-8000-0000000000a1',
  'issue229-userA-discarded.md', 'text/markdown', 2048, 'markdown', 'discarded',
  NULL,
  '{"title":"Issue #229 — UserA discarded","contentHtml":"<p>This discarded job belongs to User A. It must be hidden from the default upload-queue view.</p>","suggestedDirectoryId":null,"suggestedDirectoryName":null,"frontMatter":{},"suggestedTagNames":[],"internalLinkRefs":[],"mediaRefs":[]}',
  NULL, NULL,
  0, NULL, 3,
  '2026-05-27T00:10:00.000Z', '2026-05-27T00:15:00.000Z'
);

-- ---------------------------------------------------------------------------
-- 3) User B — previewing job (User A の画面には絶対に出てはいけない)
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO ingestion_jobs (
  id, owner_id, original_file_name, mime_type, byte_size, kind, status,
  temp_storage_key, preview_json, error_code, error_reason,
  regeneration_count, saved_as_note_id, version, created_at, updated_at
) VALUES (
  '01938f04-0000-7000-8000-000000022903',
  '01938f00-0000-7000-8000-0000000000b1',
  'issue229-userB-previewing.md', 'text/markdown', 1536, 'markdown', 'previewing',
  '01938f00-0000-7000-8000-0000000000b1/ingestion/01938f04-0000-7000-8000-000000022903',
  '{"title":"Issue #229 — UserB previewing","contentHtml":"<p>This previewing job belongs to User B. It must never appear in User A''s upload queue.</p>","suggestedDirectoryId":null,"suggestedDirectoryName":null,"frontMatter":{},"suggestedTagNames":[],"internalLinkRefs":[],"mediaRefs":[]}',
  NULL, NULL,
  0, NULL, 2,
  '2026-05-27T00:20:00.000Z', '2026-05-27T00:25:00.000Z'
);
