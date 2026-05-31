-- Issue #387 browser-verification seed.
-- Idempotent: removes any prior test-387 user (cascades to its sessions,
-- directories, notes) before re-inserting. Safe to re-run.

DELETE FROM users WHERE id = '019e7e96-395e-748f-a6a3-14f548134b6a';

-- Test user. status=active (deleted_at NULL, banned 0, email_verified 1).
INSERT INTO users (
  id, name, email, email_verified, image,
  created_at, updated_at, username, display_username,
  role, banned, ban_reason, ban_expires, bio,
  avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '019e7e96-395e-748f-a6a3-14f548134b6a',
  'Test 387',
  'test-387@example.com',
  1, NULL,
  '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z',
  'test387', 'test387',
  'member', 0, NULL, NULL, 'Issue 387 directory-filter test user',
  NULL, NULL, NULL
);

-- Session row. Token stored in plaintext (better-auth convention); the
-- value below is the __Host-session cookie value used by the browser.
-- Expires 2030 so it stays valid for verification.
INSERT INTO sessions (
  id, user_id, token, expires_at, created_at, updated_at,
  ip_address, user_agent, impersonated_by
) VALUES (
  '019e7e96-395f-72f5-914f-82ad16a618e3',
  '019e7e96-395e-748f-a6a3-14f548134b6a',
  'seed387-tEsTsEsSiOnToKeN-aaaaaaaaaaaaaaaaaaaaaaaa',
  '2030-01-01T00:00:00.000Z',
  '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z',
  '127.0.0.1', 'seed-script', NULL
);

-- Directories. Root (name/slug empty, depth 0, parent NULL) is the
-- implicit container the sidebar walks from (tree[0].children).
INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at) VALUES
 ('019e7e96-395f-72f5-914f-8409b534dd18', '019e7e96-395e-748f-a6a3-14f548134b6a', NULL, '', '', 0, 0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
 ('019e7e96-395f-72f5-914f-8b61c13466ab', '019e7e96-395e-748f-a6a3-14f548134b6a', '019e7e96-395f-72f5-914f-8409b534dd18', 'DirA',   'dira',   1, 0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
 ('019e7e96-395f-72f5-914f-8d44bd3f92ff', '019e7e96-395e-748f-a6a3-14f548134b6a', '019e7e96-395f-72f5-914f-8409b534dd18', 'DirB',   'dirb',   1, 0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
 ('019e7e96-395f-72f5-914f-91ef436ae042', '019e7e96-395e-748f-a6a3-14f548134b6a', '019e7e96-395f-72f5-914f-8409b534dd18', 'Parent', 'parent', 1, 0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
 ('019e7e96-395f-72f5-914f-954a554043dc', '019e7e96-395e-748f-a6a3-14f548134b6a', '019e7e96-395f-72f5-914f-91ef436ae042', 'Child',  'child',  2, 0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z');

-- Notes (all active). DirA: 2, DirB: 1, Child: 1, Parent: 0 (direct-only check).
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version) VALUES
 ('019e7e96-395f-72f5-914f-994eb5509043', '019e7e96-395e-748f-a6a3-14f548134b6a', '019e7e96-395f-72f5-914f-8b61c13466ab', 'notea1',     'NoteA1',     '<p>NoteA1 body</p>',     '{}', 'active', NULL, '2026-06-01T00:01:00.000Z', '2026-06-01T00:01:00.000Z', NULL, NULL, NULL, 0),
 ('019e7e96-395f-72f5-914f-9c40782b3be3', '019e7e96-395e-748f-a6a3-14f548134b6a', '019e7e96-395f-72f5-914f-8b61c13466ab', 'notea2',     'NoteA2',     '<p>NoteA2 body</p>',     '{}', 'active', NULL, '2026-06-01T00:02:00.000Z', '2026-06-01T00:02:00.000Z', NULL, NULL, NULL, 0),
 ('019e7e96-395f-72f5-914f-a0c2e3b3886b', '019e7e96-395e-748f-a6a3-14f548134b6a', '019e7e96-395f-72f5-914f-8d44bd3f92ff', 'noteb1',     'NoteB1',     '<p>NoteB1 body</p>',     '{}', 'active', NULL, '2026-06-01T00:03:00.000Z', '2026-06-01T00:03:00.000Z', NULL, NULL, NULL, 0),
 ('019e7e96-395f-72f5-914f-a5ee6e2e35a7', '019e7e96-395e-748f-a6a3-14f548134b6a', '019e7e96-395f-72f5-914f-954a554043dc', 'notechild1', 'NoteChild1', '<p>NoteChild1 body</p>', '{}', 'active', NULL, '2026-06-01T00:04:00.000Z', '2026-06-01T00:04:00.000Z', NULL, NULL, NULL, 0);
