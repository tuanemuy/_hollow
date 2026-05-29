-- ---------------------------------------------------------------------------
-- Manual-test seed data for Issue #298 (panel background verification)
-- ---------------------------------------------------------------------------
-- Creates an isolated, login-capable test user plus one note carrying rich
-- FrontMatter (scalars, arrays, nested objects) so FrontMatterPanel /
-- FrontMatterEditor / NoteMetaPanel can all be exercised.
--
-- INSERT OR IGNORE only — never deletes or overwrites existing rows.
--
-- Login:    test-298@example.com  /  TestPass298!
-- Password hash: scrypt (ln=16,r=8,p=1) — matches app/core/adapters/security/scrypt.ts
-- ---------------------------------------------------------------------------

-- User (active: email_verified=1, banned=0, deleted_at=NULL)
INSERT OR IGNORE INTO users (
  id, name, email, email_verified, image, created_at, updated_at,
  username, display_username, role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '019e7368-a580-7573-8251-c8a06f3a2a23',
  'Test 298',
  'test-298@example.com',
  1, NULL,
  '2026-05-29T00:00:00.000Z', '2026-05-29T00:00:00.000Z',
  'test298', 'test298', 'member', 0, NULL, NULL,
  NULL, NULL, NULL, NULL
);

-- Password credential (provider_id = 'credential')
INSERT OR IGNORE INTO accounts (
  id, user_id, account_id, provider_id, password,
  access_token, refresh_token, id_token,
  access_token_expires_at, refresh_token_expires_at, scope,
  created_at, updated_at
) VALUES (
  '019e7368-a581-743f-b10f-f5ea866c2ae1',
  '019e7368-a580-7573-8251-c8a06f3a2a23',
  '019e7368-a580-7573-8251-c8a06f3a2a23',
  'credential',
  '$scrypt$ln=16,r=8,p=1$cP+RhwbH92gBlgP9K9m6Jw==$YYq2nTUOUWvGwmdoeWcmF1tqtJbv9Kbw54aqJmctKrcNj+LtgWq3PLFqFj251W0ep+jFMPZLrTMAogKaWmA33w==',
  NULL, NULL, NULL, NULL, NULL, NULL,
  '2026-05-29T00:00:00.000Z', '2026-05-29T00:00:00.000Z'
);

-- Root directory (depth 0, empty name/slug per convention)
INSERT OR IGNORE INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES (
  '019e7368-a581-743f-b10f-fbd34dd99219',
  '019e7368-a580-7573-8251-c8a06f3a2a23',
  NULL, '', '', 0, 0,
  '2026-05-29T00:00:00.000Z', '2026-05-29T00:00:00.000Z'
);

-- Named subdirectory so NoteMetaPanel's directory row is meaningful
INSERT OR IGNORE INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES (
  '019e7368-a581-743f-b110-111111111111',
  '019e7368-a580-7573-8251-c8a06f3a2a23',
  '019e7368-a581-743f-b10f-fbd34dd99219',
  'Issue298', 'issue298', 1, 0,
  '2026-05-29T00:00:00.000Z', '2026-05-29T00:00:00.000Z'
);

-- Tag (name_normalized = lower(NFKC(name)))
INSERT OR IGNORE INTO tags (
  id, owner_id, name, name_normalized, note_count, version, created_at, updated_at
) VALUES (
  '019e7368-a581-743f-b110-024662884cdb',
  '019e7368-a580-7573-8251-c8a06f3a2a23',
  'design-review', 'design-review', 1, 0,
  '2026-05-29T00:00:00.000Z', '2026-05-29T00:00:00.000Z'
);

-- Note with rich FrontMatter (scalars + array + nested object)
INSERT OR IGNORE INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version
) VALUES (
  '019e7368-a581-743f-b10f-fc366c8e1f9e',
  '019e7368-a580-7573-8251-c8a06f3a2a23',
  '019e7368-a581-743f-b110-111111111111',
  'issue-298-panel-bg-check',
  'Issue 298 — パネル背景の見た目確認',
  '<p>このノートは Issue #298 のパネル背景（NoteMetaPanel / FrontMatterPanel / FrontMatterEditor）の見た目確認用です。FrontMatter に配列・ネストオブジェクトを含みます。</p>',
  '{"title":"パネル背景チェック","author":"test-298","status":"draft","priority":3,"published":false,"tags":["alpha","beta","gamma"],"reviewers":["alice","bob"],"meta":{"source":"manual-test","reviewed":true,"score":4.5,"links":["a","b"]}}',
  'active', NULL,
  '2026-05-29T00:00:00.000Z', '2026-05-29T00:00:00.000Z',
  NULL, NULL, NULL, 0
);

-- Link note <-> tag
INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (
  '019e7368-a581-743f-b10f-fc366c8e1f9e',
  '019e7368-a581-743f-b110-024662884cdb'
);

-- Publication state (private; detail UI only)
INSERT OR IGNORE INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '019e7368-a581-743f-b10f-fc366c8e1f9e',
  '019e7368-a580-7573-8251-c8a06f3a2a23',
  'private', NULL, '2026-05-29T00:00:00.000Z', 0
);
