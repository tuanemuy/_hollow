-- Issue #392 browser-verification seed.
-- Idempotent: removes any prior test-392 user (cascades to its sessions,
-- directories, notes) before re-inserting. Safe to re-run.
--
-- Hierarchy exercises subtree matching (the #392 fix):
--   root (empty)
--     Parent      -> NoteParent
--       Child     -> NoteChild
--         Grandchild -> NoteGrandchild
--     Sibling     -> NoteSibling   (must NOT appear when Parent is selected)

DELETE FROM users WHERE id = '019e7ee2-040c-720c-8eb8-9bb8be0b4f8d';

-- Test user. status=active (deleted_at NULL, banned 0, email_verified 1).
INSERT INTO users (
  id, name, email, email_verified, image,
  created_at, updated_at, username, display_username,
  role, banned, ban_reason, ban_expires, bio,
  avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '019e7ee2-040c-720c-8eb8-9bb8be0b4f8d',
  'Test 392',
  'test-392@example.com',
  1, NULL,
  '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z',
  'test392', 'test392',
  'member', 0, NULL, NULL, 'Issue 392 directory-subtree-filter test user',
  NULL, NULL, NULL
);

-- Session row. Token stored in plaintext (better-auth convention); the
-- value below is the __Host-session cookie value used by the browser.
-- Expires 2030 so it stays valid for verification.
INSERT INTO sessions (
  id, user_id, token, expires_at, created_at, updated_at,
  ip_address, user_agent, impersonated_by
) VALUES (
  '019e7ee2-040d-7188-af2f-f274e105c252',
  '019e7ee2-040c-720c-8eb8-9bb8be0b4f8d',
  'seed392-tEsTsEsSiOnToKeN-bbbbbbbbbbbbbbbbbbbbbbbb',
  '2030-01-01T00:00:00.000Z',
  '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z',
  '127.0.0.1', 'seed-script', NULL
);

-- Directories. Root (name/slug empty, depth 0, parent NULL) is the
-- implicit container the sidebar walks from (tree[0].children).
INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at) VALUES
 ('019e7ee2-040d-7188-af2f-f77cbca422ff', '019e7ee2-040c-720c-8eb8-9bb8be0b4f8d', NULL, '', '', 0, 0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
 ('019e7ee2-040d-7188-af2f-fb3cc1366f1c', '019e7ee2-040c-720c-8eb8-9bb8be0b4f8d', '019e7ee2-040d-7188-af2f-f77cbca422ff', 'Parent',     'parent',     1, 0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
 ('019e7ee2-040d-7188-af2f-fe082db90054', '019e7ee2-040c-720c-8eb8-9bb8be0b4f8d', '019e7ee2-040d-7188-af2f-fb3cc1366f1c', 'Child',      'child',      2, 0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
 ('019e7ee2-040d-7188-af30-0396adf538af', '019e7ee2-040c-720c-8eb8-9bb8be0b4f8d', '019e7ee2-040d-7188-af2f-fe082db90054', 'Grandchild', 'grandchild', 3, 0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
 ('019e7ee2-040d-7188-af30-0569d8cfcdf1', '019e7ee2-040c-720c-8eb8-9bb8be0b4f8d', '019e7ee2-040d-7188-af2f-f77cbca422ff', 'Sibling',    'sibling',    1, 0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z');

-- Notes (all active). One per directory below root so subtree expansion
-- is observable: Parent subtree = NoteParent + NoteChild + NoteGrandchild.
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version) VALUES
 ('019e7ee2-040d-7188-af30-09161c4e730a', '019e7ee2-040c-720c-8eb8-9bb8be0b4f8d', '019e7ee2-040d-7188-af2f-fb3cc1366f1c', 'noteparent',     'NoteParent',     '<p>NoteParent body</p>',     '{}', 'active', NULL, '2026-06-01T00:01:00.000Z', '2026-06-01T00:01:00.000Z', NULL, NULL, NULL, 0),
 ('019e7ee2-040d-7188-af30-0e4fe63271d5', '019e7ee2-040c-720c-8eb8-9bb8be0b4f8d', '019e7ee2-040d-7188-af2f-fe082db90054', 'notechild',      'NoteChild',      '<p>NoteChild body</p>',      '{}', 'active', NULL, '2026-06-01T00:02:00.000Z', '2026-06-01T00:02:00.000Z', NULL, NULL, NULL, 0),
 ('019e7ee2-040d-7188-af30-13200224558b', '019e7ee2-040c-720c-8eb8-9bb8be0b4f8d', '019e7ee2-040d-7188-af30-0396adf538af', 'notegrandchild', 'NoteGrandchild', '<p>NoteGrandchild body</p>', '{}', 'active', NULL, '2026-06-01T00:03:00.000Z', '2026-06-01T00:03:00.000Z', NULL, NULL, NULL, 0),
 ('019e7ee2-040d-7188-af30-1553910beaae', '019e7ee2-040c-720c-8eb8-9bb8be0b4f8d', '019e7ee2-040d-7188-af30-0569d8cfcdf1', 'notesibling',    'NoteSibling',    '<p>NoteSibling body</p>',    '{}', 'active', NULL, '2026-06-01T00:04:00.000Z', '2026-06-01T00:04:00.000Z', NULL, NULL, NULL, 0);
