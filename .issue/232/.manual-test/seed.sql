-- Issue #232 manual-test seed
--
-- Adds pre-state directories + notes used by testing.md (issue #232).
-- Targets the baseline `existing-user` (existing@example.com / Password123!)
-- whose root directory is provisioned by .manual-test/2026-05-17/seed.sql.
--
-- Owner: existing-user
--   id          : 01938f00-0000-7000-8000-0000000000a1
--   root dir id : 01938f00-0000-7000-8000-0000000000a3
--
-- Pre-state directories:
--   Foo  -> 01938f02-0000-7000-8000-000000000001
--   Bar  -> 01938f02-0000-7000-8000-000000000002
--   Baz  -> 01938f02-0000-7000-8000-000000000003
--
-- Pre-state notes (under Foo):
--   note-foo-1 -> 01938f02-0000-7000-8000-000000000101
--   note-foo-2 -> 01938f02-0000-7000-8000-000000000102
--
-- All rows use INSERT OR IGNORE keyed off PRIMARY KEY (id) so re-running
-- the script is safe. Slug normalisation matches DirectorySlug.fromName().

INSERT OR IGNORE INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES (
  '01938f02-0000-7000-8000-000000000001',
  '01938f00-0000-7000-8000-0000000000a1',
  '01938f00-0000-7000-8000-0000000000a3',
  'Foo', 'foo', 1, 0,
  '2026-05-28T00:00:00.000Z',
  '2026-05-28T00:00:00.000Z'
);

INSERT OR IGNORE INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES (
  '01938f02-0000-7000-8000-000000000002',
  '01938f00-0000-7000-8000-0000000000a1',
  '01938f00-0000-7000-8000-0000000000a3',
  'Bar', 'bar', 1, 0,
  '2026-05-28T00:00:00.000Z',
  '2026-05-28T00:00:00.000Z'
);

INSERT OR IGNORE INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES (
  '01938f02-0000-7000-8000-000000000003',
  '01938f00-0000-7000-8000-0000000000a1',
  '01938f00-0000-7000-8000-0000000000a3',
  'Baz', 'baz', 1, 0,
  '2026-05-28T00:00:00.000Z',
  '2026-05-28T00:00:00.000Z'
);

INSERT OR IGNORE INTO notes (
  id, owner_id, directory_id, slug, title,
  content_html, front_matter_json, status, trashed_at,
  created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version
) VALUES (
  '01938f02-0000-7000-8000-000000000101',
  '01938f00-0000-7000-8000-0000000000a1',
  '01938f02-0000-7000-8000-000000000001',
  'note-foo-1', 'Foo配下の検証用ノート 1',
  '<p>Issue #232 削除確認用のノート (1)</p>',
  '{}', 'active', NULL,
  '2026-05-28T00:00:00.000Z',
  '2026-05-28T00:00:00.000Z',
  NULL, NULL, NULL, 0
);

INSERT OR IGNORE INTO notes (
  id, owner_id, directory_id, slug, title,
  content_html, front_matter_json, status, trashed_at,
  created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version
) VALUES (
  '01938f02-0000-7000-8000-000000000102',
  '01938f00-0000-7000-8000-0000000000a1',
  '01938f02-0000-7000-8000-000000000001',
  'note-foo-2', 'Foo配下の検証用ノート 2',
  '<p>Issue #232 削除確認用のノート (2)</p>',
  '{}', 'active', NULL,
  '2026-05-28T00:00:00.000Z',
  '2026-05-28T00:00:00.000Z',
  NULL, NULL, NULL, 0
);
