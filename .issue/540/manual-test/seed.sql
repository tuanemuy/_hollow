
PRAGMA foreign_keys = ON;

-- ---- Idempotent cleanup (child rows first; only mt540-owned data) ----
DELETE FROM note_internal_links WHERE from_note_id IN ('01950540-0000-7000-8000-000000000030', '01950540-0000-7000-8000-000000000031', '01950540-0000-7000-8000-000000000032', '01950540-0000-7000-8000-000000000033', '01950540-0000-7000-8000-000000000034', '01950540-0000-7000-8000-000000000035', '01950540-0000-7000-8000-000000000036') OR id = '01950540-0000-7000-8000-000000000040';
DELETE FROM note_tags WHERE note_id IN ('01950540-0000-7000-8000-000000000030', '01950540-0000-7000-8000-000000000031', '01950540-0000-7000-8000-000000000032', '01950540-0000-7000-8000-000000000033', '01950540-0000-7000-8000-000000000034', '01950540-0000-7000-8000-000000000035', '01950540-0000-7000-8000-000000000036');
DELETE FROM publication_states WHERE owner_id = '01950540-0000-7000-8000-000000000001';
DELETE FROM saved_views WHERE owner_id = '01950540-0000-7000-8000-000000000001';
DELETE FROM notes WHERE owner_id = '01950540-0000-7000-8000-000000000001';
DELETE FROM tags WHERE owner_id = '01950540-0000-7000-8000-000000000001';
DELETE FROM directories WHERE owner_id = '01950540-0000-7000-8000-000000000001' AND parent_id IS NOT NULL;
DELETE FROM directories WHERE owner_id = '01950540-0000-7000-8000-000000000001';
DELETE FROM sessions WHERE token = 'mt540-session-token' OR user_id = '01950540-0000-7000-8000-000000000001' OR id = '01950540-0000-7000-8000-000000000002';
DELETE FROM users WHERE (email = 'mt540@example.com' OR username = 'mt540-user') AND id <> '01950540-0000-7000-8000-000000000001';

-- ---- User ----
INSERT INTO users (
  id, name, email, email_verified, image, created_at, updated_at,
  username, display_username, role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '01950540-0000-7000-8000-000000000001', 'MT540 Test User', 'mt540@example.com', 1, NULL, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z',
  'mt540-user', NULL, 'member', 0, NULL, NULL,
  NULL, NULL, NULL, NULL
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name, email = excluded.email,
  email_verified = excluded.email_verified, updated_at = excluded.updated_at,
  username = excluded.username, role = excluded.role,
  banned = excluded.banned, deleted_at = excluded.deleted_at;

-- ---- Session (raw token) ----
INSERT INTO sessions (
  id, user_id, token, expires_at, created_at, updated_at,
  ip_address, user_agent, impersonated_by
) VALUES (
  '01950540-0000-7000-8000-000000000002', '01950540-0000-7000-8000-000000000001', 'mt540-session-token', '2999-12-31T23:59:59.000Z', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z',
  NULL, NULL, NULL
);

-- ---- Directories (root + hierarchy) ----
INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at)
VALUES ('01950540-0000-7000-8000-000000000010', '01950540-0000-7000-8000-000000000001', NULL, '', '', 0, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');
INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at)
VALUES ('01950540-0000-7000-8000-000000000011', '01950540-0000-7000-8000-000000000001', '01950540-0000-7000-8000-000000000010', 'Research', 'research', 1, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');
INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at)
VALUES ('01950540-0000-7000-8000-000000000012', '01950540-0000-7000-8000-000000000001', '01950540-0000-7000-8000-000000000011', '論文メモ', 'papers', 2, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');
INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at)
VALUES ('01950540-0000-7000-8000-000000000013', '01950540-0000-7000-8000-000000000001', '01950540-0000-7000-8000-000000000010', 'プロジェクト', 'projects', 1, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');

-- ---- Tags ----
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950540-0000-7000-8000-000000000020', '01950540-0000-7000-8000-000000000001', 'research', 'research', 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950540-0000-7000-8000-000000000021', '01950540-0000-7000-8000-000000000001', 'paper', 'paper', 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950540-0000-7000-8000-000000000022', '01950540-0000-7000-8000-000000000001', 'ai', 'ai', 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950540-0000-7000-8000-000000000023', '01950540-0000-7000-8000-000000000001', 'draft', 'draft', 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950540-0000-7000-8000-000000000024', '01950540-0000-7000-8000-000000000001', 'design', 'design', 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');

-- ---- Notes ----
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at, edit_lock_user_id,
  edit_lock_acquired_at, edit_lock_expires_at, version, source_file_id
) VALUES (
  '01950540-0000-7000-8000-000000000030', '01950540-0000-7000-8000-000000000001', '01950540-0000-7000-8000-000000000012', 'transformer-survey', 'Transformer Survey', '<p>See <a>Attention Is All You Need</a> for the seminal work.</p>', '{"author":"mt540"}',
  'active', NULL, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', NULL,
  NULL, NULL, 0, NULL
);
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at, edit_lock_user_id,
  edit_lock_acquired_at, edit_lock_expires_at, version, source_file_id
) VALUES (
  '01950540-0000-7000-8000-000000000031', '01950540-0000-7000-8000-000000000001', '01950540-0000-7000-8000-000000000012', 'attention-is-all-you-need', 'Attention Is All You Need', '<p>Notes on the original attention paper.</p>', '{}',
  'active', NULL, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', NULL,
  NULL, NULL, 0, NULL
);
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at, edit_lock_user_id,
  edit_lock_acquired_at, edit_lock_expires_at, version, source_file_id
) VALUES (
  '01950540-0000-7000-8000-000000000032', '01950540-0000-7000-8000-000000000001', '01950540-0000-7000-8000-000000000011', 'research-index', 'Research Index', '<p>Top-level research landing note.</p>', '{}',
  'active', NULL, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', NULL,
  NULL, NULL, 0, NULL
);
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at, edit_lock_user_id,
  edit_lock_acquired_at, edit_lock_expires_at, version, source_file_id
) VALUES (
  '01950540-0000-7000-8000-000000000033', '01950540-0000-7000-8000-000000000001', '01950540-0000-7000-8000-000000000013', 'project-roadmap', 'Project Roadmap', '<p>Q3 roadmap draft.</p>', '{}',
  'active', NULL, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', NULL,
  NULL, NULL, 0, NULL
);
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at, edit_lock_user_id,
  edit_lock_acquired_at, edit_lock_expires_at, version, source_file_id
) VALUES (
  '01950540-0000-7000-8000-000000000034', '01950540-0000-7000-8000-000000000001', '01950540-0000-7000-8000-000000000013', 'design-spec', 'Design Spec', '<p>UI design specification.</p>', '{}',
  'active', NULL, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', NULL,
  NULL, NULL, 0, NULL
);
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at, edit_lock_user_id,
  edit_lock_acquired_at, edit_lock_expires_at, version, source_file_id
) VALUES (
  '01950540-0000-7000-8000-000000000035', '01950540-0000-7000-8000-000000000001', '01950540-0000-7000-8000-000000000010', 'scratchpad', 'Scratchpad', '<p>Quick private notes.</p>', '{}',
  'active', NULL, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', NULL,
  NULL, NULL, 0, NULL
);
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at, edit_lock_user_id,
  edit_lock_acquired_at, edit_lock_expires_at, version, source_file_id
) VALUES (
  '01950540-0000-7000-8000-000000000036', '01950540-0000-7000-8000-000000000001', '01950540-0000-7000-8000-000000000010', 'public-announcement', 'Public Announcement', '<p>A publicly visible note.</p>', '{}',
  'active', NULL, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', NULL,
  NULL, NULL, 0, NULL
);

-- ---- Note tags (multiple tags per note) ----
INSERT INTO note_tags (note_id, tag_id) VALUES ('01950540-0000-7000-8000-000000000030', '01950540-0000-7000-8000-000000000020');
INSERT INTO note_tags (note_id, tag_id) VALUES ('01950540-0000-7000-8000-000000000030', '01950540-0000-7000-8000-000000000021');
INSERT INTO note_tags (note_id, tag_id) VALUES ('01950540-0000-7000-8000-000000000030', '01950540-0000-7000-8000-000000000022');
INSERT INTO note_tags (note_id, tag_id) VALUES ('01950540-0000-7000-8000-000000000031', '01950540-0000-7000-8000-000000000021');
INSERT INTO note_tags (note_id, tag_id) VALUES ('01950540-0000-7000-8000-000000000031', '01950540-0000-7000-8000-000000000022');
INSERT INTO note_tags (note_id, tag_id) VALUES ('01950540-0000-7000-8000-000000000032', '01950540-0000-7000-8000-000000000020');
INSERT INTO note_tags (note_id, tag_id) VALUES ('01950540-0000-7000-8000-000000000033', '01950540-0000-7000-8000-000000000023');
INSERT INTO note_tags (note_id, tag_id) VALUES ('01950540-0000-7000-8000-000000000034', '01950540-0000-7000-8000-000000000024');
INSERT INTO note_tags (note_id, tag_id) VALUES ('01950540-0000-7000-8000-000000000034', '01950540-0000-7000-8000-000000000023');
INSERT INTO note_tags (note_id, tag_id) VALUES ('01950540-0000-7000-8000-000000000036', '01950540-0000-7000-8000-000000000020');

-- ---- Publication states (mixed visibility) ----
INSERT INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '01950540-0000-7000-8000-000000000030', '01950540-0000-7000-8000-000000000001', 'public', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', 0
);
INSERT INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '01950540-0000-7000-8000-000000000031', '01950540-0000-7000-8000-000000000001', 'unlisted', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', 0
);
INSERT INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '01950540-0000-7000-8000-000000000032', '01950540-0000-7000-8000-000000000001', 'private', NULL, '2026-05-01T00:00:00.000Z', 0
);
INSERT INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '01950540-0000-7000-8000-000000000033', '01950540-0000-7000-8000-000000000001', 'private', NULL, '2026-05-01T00:00:00.000Z', 0
);
INSERT INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '01950540-0000-7000-8000-000000000034', '01950540-0000-7000-8000-000000000001', 'unlisted', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', 0
);
INSERT INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '01950540-0000-7000-8000-000000000035', '01950540-0000-7000-8000-000000000001', 'private', NULL, '2026-05-01T00:00:00.000Z', 0
);
INSERT INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '01950540-0000-7000-8000-000000000036', '01950540-0000-7000-8000-000000000001', 'public', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', 0
);

-- ---- Internal link: NOTE_A -> NOTE_B (resolved) => backlink on NOTE_B ----
INSERT INTO note_internal_links (id, from_note_id, ref_kind, ref_target, display_text, resolved_note_id)
VALUES ('01950540-0000-7000-8000-000000000040', '01950540-0000-7000-8000-000000000030', 'title', 'Attention Is All You Need', 'Attention Is All You Need', '01950540-0000-7000-8000-000000000031');

-- ---- Saved views (personal, varied conditions; last one broken) ----
-- 1) tag filter
INSERT INTO saved_views (id, owner_id, name, kind, query_json, display_mode, calendar_date_key, sort_json, is_default, broken_conditions_json, version, created_at, updated_at)
VALUES ('01950540-0000-7000-8000-000000000050', '01950540-0000-7000-8000-000000000001', 'AI論文', 'personal',
  '{"directoryId":null,"tagIds":["01950540-0000-7000-8000-000000000022","01950540-0000-7000-8000-000000000021"],"dateRange":null,"keyword":null,"referencingNoteId":null,"visibilityFilter":[]}',
  'list', 'updated', '{"by":"updatedAt","direction":"desc"}', 0, '[]', 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');

-- 2) visibility filter
INSERT INTO saved_views (id, owner_id, name, kind, query_json, display_mode, calendar_date_key, sort_json, is_default, broken_conditions_json, version, created_at, updated_at)
VALUES ('01950540-0000-7000-8000-000000000051', '01950540-0000-7000-8000-000000000001', '公開ノート', 'personal',
  '{"directoryId":null,"tagIds":[],"dateRange":null,"keyword":null,"referencingNoteId":null,"visibilityFilter":["public","unlisted"]}',
  'tile', 'updated', '{"by":"updatedAt","direction":"desc"}', 0, '[]', 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');

-- 3) date range (best-effort "past 30 days")
INSERT INTO saved_views (id, owner_id, name, kind, query_json, display_mode, calendar_date_key, sort_json, is_default, broken_conditions_json, version, created_at, updated_at)
VALUES ('01950540-0000-7000-8000-000000000052', '01950540-0000-7000-8000-000000000001', '最近の更新', 'personal',
  '{"directoryId":null,"tagIds":[],"dateRange":{"from":"2026-05-08T00:00:00.000Z","to":"2026-06-07T23:59:59.000Z"},"keyword":null,"referencingNoteId":null,"visibilityFilter":[]}',
  'list', 'updated', '{"by":"updatedAt","direction":"desc"}', 0, '[]', 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');

-- 4) sort + directory filter, with a BROKEN tag condition (ghost tag id)
INSERT INTO saved_views (id, owner_id, name, kind, query_json, display_mode, calendar_date_key, sort_json, is_default, broken_conditions_json, version, created_at, updated_at)
VALUES ('01950540-0000-7000-8000-000000000053', '01950540-0000-7000-8000-000000000001', 'プロジェクト(壊れ)', 'personal',
  '{"directoryId":"01950540-0000-7000-8000-000000000013","tagIds":["01950540-0000-7000-8000-0000000000ff"],"dateRange":null,"keyword":null,"referencingNoteId":null,"visibilityFilter":[]}',
  'list', 'updated', '{"by":"title","direction":"asc"}', 0,
  '[{"kind":"tag","id":"01950540-0000-7000-8000-0000000000ff","lastSeenName":"deleted-tag","lastSeenAt":"2026-05-01T00:00:00.000Z"}]', 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');
