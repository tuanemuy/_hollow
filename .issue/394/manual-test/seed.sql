-- Issue #394 browser-verification seed (saved-view "Apply" flow / list UI).
-- Idempotent: explicitly removes all test-394 rows before re-inserting.
-- wrangler local D1 does not enforce ON DELETE CASCADE (PRAGMA foreign_keys
-- is off and several FKs are SQL-migration-only), so child tables are
-- deleted by hand rather than relying on the user-row cascade. Safe to
-- re-run. Touches only the test-394 user id, so other seed users (e.g.
-- test-392) are untouched.
--
-- Exercises five saved views over a small note set:
--   NoteDraft   dir=root    private  -> appears in (a) 未公開の下書き
--   NoteJournal dir=Journal private  -> appears in (b) 日記ビュー
--   NoteEssay   dir=Essays  public  tag=essay -> (c) エッセイ / (d) エッセイ（公開）
--   NotePlain   dir=root    private
-- The broken view (e) references a non-existent directory id and carries a
-- broken_conditions_json marker, so applying it yields zero notes.

-- Child rows first (note_tags / publication_states reference notes; deleted
-- via the note id set), then notes, then the rest, then the user.
DELETE FROM note_tags WHERE note_id IN (SELECT id FROM notes WHERE owner_id = '019e816a-1193-7e8f-b1a1-861f4f768faa');
DELETE FROM publication_states WHERE owner_id = '019e816a-1193-7e8f-b1a1-861f4f768faa';
DELETE FROM saved_views WHERE owner_id = '019e816a-1193-7e8f-b1a1-861f4f768faa';
DELETE FROM notes WHERE owner_id = '019e816a-1193-7e8f-b1a1-861f4f768faa';
DELETE FROM tags WHERE owner_id = '019e816a-1193-7e8f-b1a1-861f4f768faa';
-- directories self-reference via parent_id (ON DELETE RESTRICT), so delete
-- deepest first: children (depth >= 1) before the root (depth 0).
DELETE FROM directories WHERE owner_id = '019e816a-1193-7e8f-b1a1-861f4f768faa' AND depth >= 1;
DELETE FROM directories WHERE owner_id = '019e816a-1193-7e8f-b1a1-861f4f768faa';
DELETE FROM sessions WHERE user_id = '019e816a-1193-7e8f-b1a1-861f4f768faa';
DELETE FROM users WHERE id = '019e816a-1193-7e8f-b1a1-861f4f768faa';

-- Test user. status=active (deleted_at NULL, banned 0, email_verified 1).
INSERT INTO users (
  id, name, email, email_verified, image,
  created_at, updated_at, username, display_username,
  role, banned, ban_reason, ban_expires, bio,
  avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '019e816a-1193-7e8f-b1a1-861f4f768faa',
  'Test 394',
  'test-394@example.com',
  1, NULL,
  '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z',
  'test394', 'test394',
  'member', 0, NULL, NULL, 'Issue 394 saved-view apply test user',
  NULL, NULL, NULL
);

-- Session row. Token stored in plaintext (better-auth convention); the
-- value below is the __Host-session cookie value used by the browser.
-- Expires 2030 so it stays valid for verification.
INSERT INTO sessions (
  id, user_id, token, expires_at, created_at, updated_at,
  ip_address, user_agent, impersonated_by
) VALUES (
  '019e816a-1195-7ced-8450-cda68692e1d9',
  '019e816a-1193-7e8f-b1a1-861f4f768faa',
  'seed394-tEsTsEsSiOnToKeN-cccccccccccccccccccccccc',
  '2030-01-01T00:00:00.000Z',
  '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z',
  '127.0.0.1', 'seed-script', NULL
);

-- Directories. Root (name/slug empty, depth 0, parent NULL) is the implicit
-- container the sidebar walks from. Journal + Essays sit directly under it.
INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at) VALUES
 ('019e816a-1195-7a16-924b-364a81d56d43', '019e816a-1193-7e8f-b1a1-861f4f768faa', NULL, '', '', 0, 0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
 ('019e816a-1195-78c5-b3c5-e942fb936d39', '019e816a-1193-7e8f-b1a1-861f4f768faa', '019e816a-1195-7a16-924b-364a81d56d43', 'Journal', 'journal', 1, 0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
 ('019e816a-1195-74a5-8d39-e2083faf54fa', '019e816a-1193-7e8f-b1a1-861f4f768faa', '019e816a-1195-7a16-924b-364a81d56d43', 'Essays',  'essays',  1, 0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z');

-- Tag `essay`.
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at) VALUES
 ('019e816a-1195-78db-9438-f3455aa10df7', '019e816a-1193-7e8f-b1a1-861f4f768faa', 'essay', 'essay', 0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z');

-- Notes (all active). front_matter_json carries a date so the calendar view
-- has a frontMatterDate to bucket on.
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version) VALUES
 ('019e816a-1195-703c-9c74-25528b9abf1b', '019e816a-1193-7e8f-b1a1-861f4f768faa', '019e816a-1195-7a16-924b-364a81d56d43', 'notedraft',   'NoteDraft',   '<p>NoteDraft body</p>',   '{"date":"2026-06-01"}', 'active', NULL, '2026-06-01T00:01:00.000Z', '2026-06-01T00:01:00.000Z', NULL, NULL, NULL, 0),
 ('019e816a-1195-778e-9921-b866befef4cf', '019e816a-1193-7e8f-b1a1-861f4f768faa', '019e816a-1195-78c5-b3c5-e942fb936d39', 'notejournal', 'NoteJournal', '<p>NoteJournal body</p>', '{"date":"2026-06-02"}', 'active', NULL, '2026-06-02T00:02:00.000Z', '2026-06-02T00:02:00.000Z', NULL, NULL, NULL, 0),
 ('019e816a-1195-72f5-b890-47f9b88f2385', '019e816a-1193-7e8f-b1a1-861f4f768faa', '019e816a-1195-74a5-8d39-e2083faf54fa', 'noteessay',   'NoteEssay',   '<p>NoteEssay body</p>',   '{"date":"2026-06-03"}', 'active', NULL, '2026-06-03T00:03:00.000Z', '2026-06-03T00:03:00.000Z', NULL, NULL, NULL, 0),
 ('019e816a-1195-78dd-8fa1-c01136a8fe4e', '019e816a-1193-7e8f-b1a1-861f4f768faa', '019e816a-1195-7a16-924b-364a81d56d43', 'noteplain',   'NotePlain',   '<p>NotePlain body</p>',   '{"date":"2026-06-04"}', 'active', NULL, '2026-06-04T00:04:00.000Z', '2026-06-04T00:04:00.000Z', NULL, NULL, NULL, 0);

-- Tag link: NoteEssay carries the `essay` tag.
INSERT INTO note_tags (note_id, tag_id) VALUES
 ('019e816a-1195-72f5-b890-47f9b88f2385', '019e816a-1195-78db-9438-f3455aa10df7');

-- Publication state: NoteEssay is public. The other notes have no row, which
-- the note list treats as `private` (NOT EXISTS of non-private rows).
INSERT INTO publication_states (note_id, owner_id, visibility, published_at, updated_at, version) VALUES
 ('019e816a-1195-72f5-b890-47f9b88f2385', '019e816a-1193-7e8f-b1a1-861f4f768faa', 'public', '2026-06-03T00:03:00.000Z', '2026-06-03T00:03:00.000Z', 0);

-- Saved views (owner=test-394). JSON shapes mirror the D1 mapper:
--   query_json:  { directoryId, tagIds[], dateRange|null, keyword|null,
--                  referencingNoteId, visibilityFilter[] }
--   sort_json:   { by, direction }   (by in updatedAt|createdAt|title)
--   broken_conditions_json: [ { kind, id, lastSeenAt } ]  (kind in tag|directory|note)
INSERT INTO saved_views (id, owner_id, name, kind, query_json, display_mode, calendar_date_key, sort_json, is_default, broken_conditions_json, version, created_at, updated_at) VALUES
 -- (a) 未公開の下書き: personal / list / default / visibility=private
 ('019e816a-1195-7df5-ac16-c43bf5e49e1c', '019e816a-1193-7e8f-b1a1-861f4f768faa', '未公開の下書き', 'personal',
  '{"directoryId":null,"tagIds":[],"dateRange":null,"keyword":null,"referencingNoteId":null,"visibilityFilter":["private"]}',
  'list', 'updated', '{"by":"updatedAt","direction":"desc"}', 1, '[]', 0,
  '2026-06-01T00:10:00.000Z', '2026-06-01T00:10:00.000Z'),
 -- (b) 日記ビュー: personal / calendar / directory=Journal
 ('019e816a-1195-7dd6-a0d3-1b80d53706bf', '019e816a-1193-7e8f-b1a1-861f4f768faa', '日記ビュー', 'personal',
  '{"directoryId":"019e816a-1195-78c5-b3c5-e942fb936d39","tagIds":[],"dateRange":null,"keyword":null,"referencingNoteId":null,"visibilityFilter":[]}',
  'calendar', 'frontMatterDate', '{"by":"createdAt","direction":"desc"}', 0, '[]', 0,
  '2026-06-01T00:11:00.000Z', '2026-06-01T00:11:00.000Z'),
 -- (c) エッセイ: personal / tile / tagIds=[essay]
 ('019e816a-1195-7746-b6fd-9a1bb6a3e05f', '019e816a-1193-7e8f-b1a1-861f4f768faa', 'エッセイ', 'personal',
  '{"directoryId":null,"tagIds":["019e816a-1195-78db-9438-f3455aa10df7"],"dateRange":null,"keyword":null,"referencingNoteId":null,"visibilityFilter":[]}',
  'tile', 'updated', '{"by":"updatedAt","direction":"desc"}', 0, '[]', 0,
  '2026-06-01T00:12:00.000Z', '2026-06-01T00:12:00.000Z'),
 -- (d) エッセイ（公開）: public / tile / visibility=public
 ('019e816a-1195-7ec1-ac30-27bbc800fb57', '019e816a-1193-7e8f-b1a1-861f4f768faa', 'エッセイ（公開）', 'public',
  '{"directoryId":null,"tagIds":[],"dateRange":null,"keyword":null,"referencingNoteId":null,"visibilityFilter":["public"]}',
  'tile', 'updated', '{"by":"updatedAt","direction":"desc"}', 0, '[]', 0,
  '2026-06-01T00:13:00.000Z', '2026-06-01T00:13:00.000Z'),
 -- (e) 壊れたビュー: personal / list / references a non-existent directory id;
 --     broken_conditions_json records the dangling directory reference.
 ('019e816a-1195-780c-a86b-55e15b574924', '019e816a-1193-7e8f-b1a1-861f4f768faa', '壊れたビュー', 'personal',
  '{"directoryId":"019e816a-0000-7000-8000-000000000000","tagIds":[],"dateRange":null,"keyword":null,"referencingNoteId":null,"visibilityFilter":[]}',
  'list', 'updated', '{"by":"updatedAt","direction":"desc"}', 0,
  '[{"kind":"directory","id":"019e816a-0000-7000-8000-000000000000","lastSeenAt":"2026-06-01T00:14:00.000Z"}]', 0,
  '2026-06-01T00:14:00.000Z', '2026-06-01T00:14:00.000Z');
