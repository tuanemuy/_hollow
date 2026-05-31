-- ---------------------------------------------------------------------------
-- Manual-test seed data for Issue #372 (タグ note_count 死蔵列の撤去)
-- ---------------------------------------------------------------------------
-- Purpose: verify that a tag's usage count is computed at read time from the
-- number of *active* notes linked to it, now that the denormalised
-- `tags.note_count` column has been DROPPED (migration 0013). The seed must
-- NOT reference note_count anywhere.
--
-- Expected active counts (drives both件数表示 and 人気順ソート):
--   work          = 3  (3 active notes)              -- most popular
--   idea          = 2  (2 active notes)
--   memo          = 1  (1 active note)
--   archived-only = 0  (linked only to a trashed note)
--   unused        = 0  (linked to no note)
--
-- Popularity (人気順) descending should therefore be:
--   work (3) > idea (2) > memo (1) > {archived-only, unused} (0)
--
-- Test account credentials:
--   email:    tag365@example.com
--   password: TestPassword123!
--   user id:  01938f99-0365-7000-8000-000000000001
--
-- The password hash reuses the legacy PBKDF2-SHA256 / 600k-iteration value
-- from prior seeds. D1CredentialStore still accepts it via the
-- `legacyVerifyPbkdf2Hash` path (app/core/adapters/d1/repositories/
-- credentialStore.ts), so login succeeds.
--
-- Idempotent: deletes this single test user (cascades to all owned data:
-- accounts, directories, notes, tags, note_tags, publication_states) and
-- re-inserts. Does NOT touch any other (production / other-test) data.
-- ---------------------------------------------------------------------------

-- Wipe everything that cascades from this user first.
DELETE FROM users WHERE id = '01938f99-0365-7000-8000-000000000001';

-- ---------- User ----------------------------------------------------------
INSERT INTO users (
  id, name, email, email_verified, image,
  created_at, updated_at,
  username, display_username, role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '01938f99-0365-7000-8000-000000000001',
  'tag372 テストユーザー',
  'tag365@example.com',
  1,
  NULL,
  '2026-05-31T00:00:00.000Z',
  '2026-05-31T00:00:00.000Z',
  'tag365-user',
  'tag365-user',
  'member',
  0, NULL, NULL,
  'Issue #372 note_count 撤去シードユーザー',
  NULL, NULL, NULL
);

-- ---------- Account (PBKDF2 password = TestPassword123!) -------------------
INSERT INTO accounts (
  id, user_id, account_id, provider_id,
  password, access_token, refresh_token, id_token,
  access_token_expires_at, refresh_token_expires_at, scope,
  created_at, updated_at
) VALUES (
  '01938f99-0365-7000-8000-0000000000a1',
  '01938f99-0365-7000-8000-000000000001',
  '01938f99-0365-7000-8000-000000000001',
  'credential',
  'pbkdf2-sha256-v1$600000$FNW58b/97MhJdfElCEp3eA==$/WGvBuiuy7nfuJojvtjHfGCD5AWEZ7x6GNVsLmS7X9M=',
  NULL, NULL, NULL, NULL, NULL, NULL,
  '2026-05-31T00:00:00.000Z',
  '2026-05-31T00:00:00.000Z'
);

-- ---------- Directory (root) ----------------------------------------------
-- notes.directory_id is NOT NULL FK; every owner needs a root directory.
INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at) VALUES
  ('01938f99-0365-7000-8000-0000000000d0', '01938f99-0365-7000-8000-000000000001', NULL, '', '', 0, 0, '2026-05-31T00:00:00.000Z', '2026-05-31T00:00:00.000Z');

-- ---------- Tags ----------------------------------------------------------
-- IMPORTANT: tags.note_count was DROPPED in migration 0013. Do NOT insert it.
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at) VALUES
  ('01938f99-0365-7000-8000-00000000a001', '01938f99-0365-7000-8000-000000000001', 'work',          'work',          0, '2026-05-31T00:00:00.000Z', '2026-05-31T00:00:00.000Z'),
  ('01938f99-0365-7000-8000-00000000a002', '01938f99-0365-7000-8000-000000000001', 'idea',          'idea',          0, '2026-05-31T00:00:00.000Z', '2026-05-31T00:00:00.000Z'),
  ('01938f99-0365-7000-8000-00000000a005', '01938f99-0365-7000-8000-000000000001', 'memo',          'memo',          0, '2026-05-31T00:00:00.000Z', '2026-05-31T00:00:00.000Z'),
  ('01938f99-0365-7000-8000-00000000a003', '01938f99-0365-7000-8000-000000000001', 'archived-only', 'archived-only', 0, '2026-05-31T00:00:00.000Z', '2026-05-31T00:00:00.000Z'),
  ('01938f99-0365-7000-8000-00000000a004', '01938f99-0365-7000-8000-000000000001', 'unused',        'unused',        0, '2026-05-31T00:00:00.000Z', '2026-05-31T00:00:00.000Z');

-- ---------- Notes ---------------------------------------------------------
-- work: N1,N2,N3 active (count 3)
-- idea: N4,N5 active (count 2)
-- memo: N6 active (count 1)
-- archived-only: N7 trashed (active count 0)
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version) VALUES
  ('01938f99-0365-7000-8000-00000000b001', '01938f99-0365-7000-8000-000000000001', '01938f99-0365-7000-8000-0000000000d0',
   'work-note-1', 'Work note 1', '<p>active work note 1</p>',
   '{"title":"Work note 1","tags":["work"]}', 'active', NULL, '2026-05-20T09:00:00.000Z', '2026-05-20T09:00:00.000Z', NULL, NULL, NULL, 0),
  ('01938f99-0365-7000-8000-00000000b002', '01938f99-0365-7000-8000-000000000001', '01938f99-0365-7000-8000-0000000000d0',
   'work-note-2', 'Work note 2', '<p>active work note 2</p>',
   '{"title":"Work note 2","tags":["work"]}', 'active', NULL, '2026-05-21T09:00:00.000Z', '2026-05-21T09:00:00.000Z', NULL, NULL, NULL, 0),
  ('01938f99-0365-7000-8000-00000000b003', '01938f99-0365-7000-8000-000000000001', '01938f99-0365-7000-8000-0000000000d0',
   'work-note-3', 'Work note 3', '<p>active work note 3</p>',
   '{"title":"Work note 3","tags":["work"]}', 'active', NULL, '2026-05-22T09:00:00.000Z', '2026-05-22T09:00:00.000Z', NULL, NULL, NULL, 0),
  ('01938f99-0365-7000-8000-00000000b004', '01938f99-0365-7000-8000-000000000001', '01938f99-0365-7000-8000-0000000000d0',
   'idea-note-1', 'Idea note 1', '<p>active idea note 1</p>',
   '{"title":"Idea note 1","tags":["idea"]}', 'active', NULL, '2026-05-23T09:00:00.000Z', '2026-05-23T09:00:00.000Z', NULL, NULL, NULL, 0),
  ('01938f99-0365-7000-8000-00000000b005', '01938f99-0365-7000-8000-000000000001', '01938f99-0365-7000-8000-0000000000d0',
   'idea-note-2', 'Idea note 2', '<p>active idea note 2</p>',
   '{"title":"Idea note 2","tags":["idea"]}', 'active', NULL, '2026-05-24T09:00:00.000Z', '2026-05-24T09:00:00.000Z', NULL, NULL, NULL, 0),
  ('01938f99-0365-7000-8000-00000000b006', '01938f99-0365-7000-8000-000000000001', '01938f99-0365-7000-8000-0000000000d0',
   'memo-note-1', 'Memo note 1', '<p>active memo note 1</p>',
   '{"title":"Memo note 1","tags":["memo"]}', 'active', NULL, '2026-05-25T09:00:00.000Z', '2026-05-25T09:00:00.000Z', NULL, NULL, NULL, 0),
  ('01938f99-0365-7000-8000-00000000b007', '01938f99-0365-7000-8000-000000000001', '01938f99-0365-7000-8000-0000000000d0',
   'archived-note-1', 'Archived note 1', '<p>trashed note linked to archived-only</p>',
   '{"title":"Archived note 1","tags":["archived-only"]}', 'trashed', '2026-05-26T10:00:00.000Z', '2026-05-26T09:00:00.000Z', '2026-05-26T10:00:00.000Z', NULL, NULL, NULL, 0);

-- ---------- note_tags (composite PK note_id, tag_id) ----------------------
INSERT INTO note_tags (note_id, tag_id) VALUES
  -- work ← N1, N2, N3 (3 active)
  ('01938f99-0365-7000-8000-00000000b001', '01938f99-0365-7000-8000-00000000a001'),
  ('01938f99-0365-7000-8000-00000000b002', '01938f99-0365-7000-8000-00000000a001'),
  ('01938f99-0365-7000-8000-00000000b003', '01938f99-0365-7000-8000-00000000a001'),
  -- idea ← N4, N5 (2 active)
  ('01938f99-0365-7000-8000-00000000b004', '01938f99-0365-7000-8000-00000000a002'),
  ('01938f99-0365-7000-8000-00000000b005', '01938f99-0365-7000-8000-00000000a002'),
  -- memo ← N6 (1 active)
  ('01938f99-0365-7000-8000-00000000b006', '01938f99-0365-7000-8000-00000000a005'),
  -- archived-only ← N7 (trashed only → 0 active)
  ('01938f99-0365-7000-8000-00000000b007', '01938f99-0365-7000-8000-00000000a003');
  -- unused: no note_tags row at all.

-- ---------- publication_states --------------------------------------------
-- All notes default to private. Provided so detail/listing routes that expect
-- a publication row do not break.
INSERT INTO publication_states (note_id, owner_id, visibility, published_at, updated_at, version) VALUES
  ('01938f99-0365-7000-8000-00000000b001', '01938f99-0365-7000-8000-000000000001', 'private', NULL, '2026-05-20T09:00:00.000Z', 0),
  ('01938f99-0365-7000-8000-00000000b002', '01938f99-0365-7000-8000-000000000001', 'private', NULL, '2026-05-21T09:00:00.000Z', 0),
  ('01938f99-0365-7000-8000-00000000b003', '01938f99-0365-7000-8000-000000000001', 'private', NULL, '2026-05-22T09:00:00.000Z', 0),
  ('01938f99-0365-7000-8000-00000000b004', '01938f99-0365-7000-8000-000000000001', 'private', NULL, '2026-05-23T09:00:00.000Z', 0),
  ('01938f99-0365-7000-8000-00000000b005', '01938f99-0365-7000-8000-000000000001', 'private', NULL, '2026-05-24T09:00:00.000Z', 0),
  ('01938f99-0365-7000-8000-00000000b006', '01938f99-0365-7000-8000-000000000001', 'private', NULL, '2026-05-25T09:00:00.000Z', 0),
  ('01938f99-0365-7000-8000-00000000b007', '01938f99-0365-7000-8000-000000000001', 'private', NULL, '2026-05-26T09:00:00.000Z', 0);

-- ---------- instance_settings (singleton) ---------------------------------
INSERT OR IGNORE INTO instance_settings (
  id, llm_provider, llm_model, llm_api_key_source, llm_api_key_ciphertext,
  prompts_json, design_tokens_json, registration_open, registration_closed_reason,
  limits_json, version, updated_at
) VALUES (
  'singleton',
  'anthropic',
  'claude-opus-4-7',
  'env',
  NULL,
  '{}',
  '{"tokens":{}}',
  1, NULL,
  '{"maxUploadBytesPerDay":1073741824,"maxIngestionBytes":33554432,"maxNoteBytes":1048576,"maxExportArtifactBytes":268435456,"maxShareLinksPerNote":16,"editLockTtlSec":300,"trashRetentionDays":30}',
  0,
  '2026-05-31T00:00:00.000Z'
);
