-- Issue #671 P32 公開検索フィルターUI検証シード（冪等: 固定ID削除→再投入）
DELETE FROM note_tags WHERE note_id IN ('01967100-0000-7000-8000-000000000201','01967100-0000-7000-8000-000000000202','01967100-0000-7000-8000-000000000203','01967100-0000-7000-8000-000000000204','01967100-0000-7000-8000-000000000205','01967100-0000-7000-8000-000000000206','01967100-0000-7000-8000-000000000207','01967100-0000-7000-8000-000000000208','01967100-0000-7000-8000-000000000209','01967100-0000-7000-8000-000000000210');
DELETE FROM search_documents WHERE note_id IN ('01967100-0000-7000-8000-000000000201','01967100-0000-7000-8000-000000000202','01967100-0000-7000-8000-000000000203','01967100-0000-7000-8000-000000000204','01967100-0000-7000-8000-000000000205','01967100-0000-7000-8000-000000000206','01967100-0000-7000-8000-000000000207','01967100-0000-7000-8000-000000000208','01967100-0000-7000-8000-000000000209','01967100-0000-7000-8000-000000000210');
DELETE FROM publication_states WHERE note_id IN ('01967100-0000-7000-8000-000000000201','01967100-0000-7000-8000-000000000202','01967100-0000-7000-8000-000000000203','01967100-0000-7000-8000-000000000204','01967100-0000-7000-8000-000000000205','01967100-0000-7000-8000-000000000206','01967100-0000-7000-8000-000000000207','01967100-0000-7000-8000-000000000208','01967100-0000-7000-8000-000000000209','01967100-0000-7000-8000-000000000210');
DELETE FROM notes WHERE id IN ('01967100-0000-7000-8000-000000000201','01967100-0000-7000-8000-000000000202','01967100-0000-7000-8000-000000000203','01967100-0000-7000-8000-000000000204','01967100-0000-7000-8000-000000000205','01967100-0000-7000-8000-000000000206','01967100-0000-7000-8000-000000000207','01967100-0000-7000-8000-000000000208','01967100-0000-7000-8000-000000000209','01967100-0000-7000-8000-000000000210');
DELETE FROM tags WHERE id IN ('01967100-0000-7000-8000-000000000301','01967100-0000-7000-8000-000000000302','01967100-0000-7000-8000-000000000303');
DELETE FROM directories WHERE id IN ('01967100-0000-7000-8000-0000000000a2','01967100-0000-7000-8000-0000000000b2');
DELETE FROM users WHERE (email = 'p671-alice@example.com' OR username = 'p671-alice') AND id <> '01967100-0000-7000-8000-0000000000a1';
DELETE FROM users WHERE (email = 'p671-bob@example.com' OR username = 'p671-bob') AND id <> '01967100-0000-7000-8000-0000000000b1';

INSERT INTO users (
  id, name, email, email_verified, image, created_at, updated_at,
  username, display_username, role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '01967100-0000-7000-8000-0000000000a1', 'P671 Alice', 'p671-alice@example.com', 1, NULL, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z',
  'p671-alice', NULL, 'member', 0, NULL, NULL,
  NULL, NULL, NULL, NULL
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  email = excluded.email,
  email_verified = excluded.email_verified,
  username = excluded.username,
  role = excluded.role,
  banned = excluded.banned,
  deleted_at = excluded.deleted_at;

INSERT INTO users (
  id, name, email, email_verified, image, created_at, updated_at,
  username, display_username, role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '01967100-0000-7000-8000-0000000000b1', 'P671 Bob', 'p671-bob@example.com', 1, NULL, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z',
  'p671-bob', NULL, 'member', 0, NULL, NULL,
  NULL, NULL, NULL, NULL
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  email = excluded.email,
  email_verified = excluded.email_verified,
  username = excluded.username,
  role = excluded.role,
  banned = excluded.banned,
  deleted_at = excluded.deleted_at;

INSERT INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES (
  '01967100-0000-7000-8000-0000000000a2', '01967100-0000-7000-8000-0000000000a1', NULL, '', '', 0, 0, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'
);

INSERT INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES (
  '01967100-0000-7000-8000-0000000000b2', '01967100-0000-7000-8000-0000000000b1', NULL, '', '', 0, 0, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'
);

INSERT INTO tags (
  id, owner_id, name, name_normalized, version, created_at, updated_at
) VALUES (
  '01967100-0000-7000-8000-000000000301', '01967100-0000-7000-8000-0000000000a1', 'p671-tech', 'p671-tech', 0, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'
);

INSERT INTO tags (
  id, owner_id, name, name_normalized, version, created_at, updated_at
) VALUES (
  '01967100-0000-7000-8000-000000000302', '01967100-0000-7000-8000-0000000000b1', 'p671-diary', 'p671-diary', 0, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'
);

INSERT INTO tags (
  id, owner_id, name, name_normalized, version, created_at, updated_at
) VALUES (
  '01967100-0000-7000-8000-000000000303', '01950000-0000-7000-8000-000000000001', 'p671-design', 'p671-design', 0, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'
);

INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  source_file_id, version
) VALUES (
  '01967100-0000-7000-8000-000000000201', '01967100-0000-7000-8000-0000000000a1', '01967100-0000-7000-8000-0000000000a2', 'p671-note-01', '今日のノート hollow671',
  '<p>Issue #671 公開検索フィルター検証ノート01。 hollow671 のフィルターUIを確認します。</p>', '{}',
  'active', NULL, '2026-06-12T01:00:00.000Z', '2026-06-12T01:00:00.000Z',
  NULL, NULL, NULL, NULL, 0
);

INSERT INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '01967100-0000-7000-8000-000000000201', '01967100-0000-7000-8000-0000000000a1', 'public', '2026-06-12T01:00:00.000Z', '2026-06-12T01:00:00.000Z', 0
);

INSERT INTO search_documents (
  note_id, owner_id, visibility, title, body_plain, tag_names_json,
  directory_path, date_for_calendar, updated_at, indexed_at
) VALUES (
  '01967100-0000-7000-8000-000000000201', '01967100-0000-7000-8000-0000000000a1', 'public', '今日のノート hollow671', 'Issue #671 公開検索フィルター検証ノート01。 hollow671 のフィルターUIを確認します。', '["p671-tech"]',
  '', '2026-06-12', '2026-06-12T01:00:00.000Z', '2026-06-12T01:00:00.000Z'
);
INSERT INTO note_tags (note_id, tag_id) VALUES ('01967100-0000-7000-8000-000000000201', '01967100-0000-7000-8000-000000000301');

INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  source_file_id, version
) VALUES (
  '01967100-0000-7000-8000-000000000202', '01967100-0000-7000-8000-0000000000b1', '01967100-0000-7000-8000-0000000000b2', 'p671-note-02', '数日前のノート hollow671',
  '<p>Issue #671 公開検索フィルター検証ノート02。 hollow671 のフィルターUIを確認します。</p>', '{}',
  'active', NULL, '2026-06-09T03:00:00.000Z', '2026-06-09T03:00:00.000Z',
  NULL, NULL, NULL, NULL, 0
);

INSERT INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '01967100-0000-7000-8000-000000000202', '01967100-0000-7000-8000-0000000000b1', 'public', '2026-06-09T03:00:00.000Z', '2026-06-09T03:00:00.000Z', 0
);

INSERT INTO search_documents (
  note_id, owner_id, visibility, title, body_plain, tag_names_json,
  directory_path, date_for_calendar, updated_at, indexed_at
) VALUES (
  '01967100-0000-7000-8000-000000000202', '01967100-0000-7000-8000-0000000000b1', 'public', '数日前のノート hollow671', 'Issue #671 公開検索フィルター検証ノート02。 hollow671 のフィルターUIを確認します。', '["p671-diary"]',
  '', '2026-06-09', '2026-06-09T03:00:00.000Z', '2026-06-09T03:00:00.000Z'
);
INSERT INTO note_tags (note_id, tag_id) VALUES ('01967100-0000-7000-8000-000000000202', '01967100-0000-7000-8000-000000000302');

INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  source_file_id, version
) VALUES (
  '01967100-0000-7000-8000-000000000203', '01950000-0000-7000-8000-000000000001', '019e9546-cb23-73c9-849c-120384e56377', 'p671-note-03', '1週間以内のノート hollow671',
  '<p>Issue #671 公開検索フィルター検証ノート03。 hollow671 のフィルターUIを確認します。</p>', '{}',
  'active', NULL, '2026-06-07T05:00:00.000Z', '2026-06-07T05:00:00.000Z',
  NULL, NULL, NULL, NULL, 0
);

INSERT INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '01967100-0000-7000-8000-000000000203', '01950000-0000-7000-8000-000000000001', 'public', '2026-06-07T05:00:00.000Z', '2026-06-07T05:00:00.000Z', 0
);

INSERT INTO search_documents (
  note_id, owner_id, visibility, title, body_plain, tag_names_json,
  directory_path, date_for_calendar, updated_at, indexed_at
) VALUES (
  '01967100-0000-7000-8000-000000000203', '01950000-0000-7000-8000-000000000001', 'public', '1週間以内のノート hollow671', 'Issue #671 公開検索フィルター検証ノート03。 hollow671 のフィルターUIを確認します。', '["p671-design"]',
  '', '2026-06-07', '2026-06-07T05:00:00.000Z', '2026-06-07T05:00:00.000Z'
);
INSERT INTO note_tags (note_id, tag_id) VALUES ('01967100-0000-7000-8000-000000000203', '01967100-0000-7000-8000-000000000303');

INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  source_file_id, version
) VALUES (
  '01967100-0000-7000-8000-000000000204', '01967100-0000-7000-8000-0000000000a1', '01967100-0000-7000-8000-0000000000a2', 'p671-note-04', '3週間前のノート hollow671',
  '<p>Issue #671 公開検索フィルター検証ノート04。 hollow671 のフィルターUIを確認します。</p>', '{}',
  'active', NULL, '2026-05-22T08:00:00.000Z', '2026-05-22T08:00:00.000Z',
  NULL, NULL, NULL, NULL, 0
);

INSERT INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '01967100-0000-7000-8000-000000000204', '01967100-0000-7000-8000-0000000000a1', 'public', '2026-05-22T08:00:00.000Z', '2026-05-22T08:00:00.000Z', 0
);

INSERT INTO search_documents (
  note_id, owner_id, visibility, title, body_plain, tag_names_json,
  directory_path, date_for_calendar, updated_at, indexed_at
) VALUES (
  '01967100-0000-7000-8000-000000000204', '01967100-0000-7000-8000-0000000000a1', 'public', '3週間前のノート hollow671', 'Issue #671 公開検索フィルター検証ノート04。 hollow671 のフィルターUIを確認します。', '["p671-tech","p671-design"]',
  '', '2026-05-22', '2026-05-22T08:00:00.000Z', '2026-05-22T08:00:00.000Z'
);
INSERT INTO note_tags (note_id, tag_id) VALUES ('01967100-0000-7000-8000-000000000204', '01967100-0000-7000-8000-000000000301');
INSERT INTO note_tags (note_id, tag_id) VALUES ('01967100-0000-7000-8000-000000000204', '01967100-0000-7000-8000-000000000303');

INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  source_file_id, version
) VALUES (
  '01967100-0000-7000-8000-000000000205', '01967100-0000-7000-8000-0000000000b1', '01967100-0000-7000-8000-0000000000b2', 'p671-note-05', '4週間前のノート 蜻蛉 hollow671',
  '<p>Issue #671 公開検索フィルター検証ノート05。 蜻蛉が飛ぶ季節の記録。 hollow671 のフィルターUIを確認します。</p>', '{}',
  'active', NULL, '2026-05-16T02:00:00.000Z', '2026-05-16T02:00:00.000Z',
  NULL, NULL, NULL, NULL, 0
);

INSERT INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '01967100-0000-7000-8000-000000000205', '01967100-0000-7000-8000-0000000000b1', 'public', '2026-05-16T02:00:00.000Z', '2026-05-16T02:00:00.000Z', 0
);

INSERT INTO search_documents (
  note_id, owner_id, visibility, title, body_plain, tag_names_json,
  directory_path, date_for_calendar, updated_at, indexed_at
) VALUES (
  '01967100-0000-7000-8000-000000000205', '01967100-0000-7000-8000-0000000000b1', 'public', '4週間前のノート 蜻蛉 hollow671', 'Issue #671 公開検索フィルター検証ノート05。 蜻蛉が飛ぶ季節の記録。 hollow671 のフィルターUIを確認します。', '["p671-diary"]',
  '', '2026-05-16', '2026-05-16T02:00:00.000Z', '2026-05-16T02:00:00.000Z'
);
INSERT INTO note_tags (note_id, tag_id) VALUES ('01967100-0000-7000-8000-000000000205', '01967100-0000-7000-8000-000000000302');

INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  source_file_id, version
) VALUES (
  '01967100-0000-7000-8000-000000000206', '01950000-0000-7000-8000-000000000001', '019e9546-cb23-73c9-849c-120384e56377', 'p671-note-06', '3ヶ月前のノート hollow671',
  '<p>Issue #671 公開検索フィルター検証ノート06。 hollow671 のフィルターUIを確認します。</p>', '{}',
  'active', NULL, '2026-03-12T06:00:00.000Z', '2026-03-12T06:00:00.000Z',
  NULL, NULL, NULL, NULL, 0
);

INSERT INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '01967100-0000-7000-8000-000000000206', '01950000-0000-7000-8000-000000000001', 'public', '2026-03-12T06:00:00.000Z', '2026-03-12T06:00:00.000Z', 0
);

INSERT INTO search_documents (
  note_id, owner_id, visibility, title, body_plain, tag_names_json,
  directory_path, date_for_calendar, updated_at, indexed_at
) VALUES (
  '01967100-0000-7000-8000-000000000206', '01950000-0000-7000-8000-000000000001', 'public', '3ヶ月前のノート hollow671', 'Issue #671 公開検索フィルター検証ノート06。 hollow671 のフィルターUIを確認します。', '["p671-design"]',
  '', '2026-03-12', '2026-03-12T06:00:00.000Z', '2026-03-12T06:00:00.000Z'
);
INSERT INTO note_tags (note_id, tag_id) VALUES ('01967100-0000-7000-8000-000000000206', '01967100-0000-7000-8000-000000000303');

INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  source_file_id, version
) VALUES (
  '01967100-0000-7000-8000-000000000207', '01967100-0000-7000-8000-0000000000a1', '01967100-0000-7000-8000-0000000000a2', 'p671-note-07', '半年前のノート p671unique hollow671',
  '<p>Issue #671 公開検索フィルター検証ノート07。 p671unique 一意マーカー。 hollow671 のフィルターUIを確認します。</p>', '{}',
  'active', NULL, '2025-12-12T07:00:00.000Z', '2025-12-12T07:00:00.000Z',
  NULL, NULL, NULL, NULL, 0
);

INSERT INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '01967100-0000-7000-8000-000000000207', '01967100-0000-7000-8000-0000000000a1', 'public', '2025-12-12T07:00:00.000Z', '2025-12-12T07:00:00.000Z', 0
);

INSERT INTO search_documents (
  note_id, owner_id, visibility, title, body_plain, tag_names_json,
  directory_path, date_for_calendar, updated_at, indexed_at
) VALUES (
  '01967100-0000-7000-8000-000000000207', '01967100-0000-7000-8000-0000000000a1', 'public', '半年前のノート p671unique hollow671', 'Issue #671 公開検索フィルター検証ノート07。 p671unique 一意マーカー。 hollow671 のフィルターUIを確認します。', '["p671-tech"]',
  '', '2025-12-12', '2025-12-12T07:00:00.000Z', '2025-12-12T07:00:00.000Z'
);
INSERT INTO note_tags (note_id, tag_id) VALUES ('01967100-0000-7000-8000-000000000207', '01967100-0000-7000-8000-000000000301');

INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  source_file_id, version
) VALUES (
  '01967100-0000-7000-8000-000000000208', '01967100-0000-7000-8000-0000000000b1', '01967100-0000-7000-8000-0000000000b2', 'p671-note-08', '10ヶ月前のノート hollow671',
  '<p>Issue #671 公開検索フィルター検証ノート08。 hollow671 のフィルターUIを確認します。</p>', '{}',
  'active', NULL, '2025-08-12T09:00:00.000Z', '2025-08-12T09:00:00.000Z',
  NULL, NULL, NULL, NULL, 0
);

INSERT INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '01967100-0000-7000-8000-000000000208', '01967100-0000-7000-8000-0000000000b1', 'public', '2025-08-12T09:00:00.000Z', '2025-08-12T09:00:00.000Z', 0
);

INSERT INTO search_documents (
  note_id, owner_id, visibility, title, body_plain, tag_names_json,
  directory_path, date_for_calendar, updated_at, indexed_at
) VALUES (
  '01967100-0000-7000-8000-000000000208', '01967100-0000-7000-8000-0000000000b1', 'public', '10ヶ月前のノート hollow671', 'Issue #671 公開検索フィルター検証ノート08。 hollow671 のフィルターUIを確認します。', '["p671-diary","p671-design"]',
  '', '2025-08-12', '2025-08-12T09:00:00.000Z', '2025-08-12T09:00:00.000Z'
);
INSERT INTO note_tags (note_id, tag_id) VALUES ('01967100-0000-7000-8000-000000000208', '01967100-0000-7000-8000-000000000302');
INSERT INTO note_tags (note_id, tag_id) VALUES ('01967100-0000-7000-8000-000000000208', '01967100-0000-7000-8000-000000000303');

INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  source_file_id, version
) VALUES (
  '01967100-0000-7000-8000-000000000209', '01950000-0000-7000-8000-000000000001', '019e9546-cb23-73c9-849c-120384e56377', 'p671-note-09', '去年より前のノート hollow671',
  '<p>Issue #671 公開検索フィルター検証ノート09。 hollow671 のフィルターUIを確認します。</p>', '{}',
  'active', NULL, '2025-01-12T09:00:00.000Z', '2025-01-12T09:00:00.000Z',
  NULL, NULL, NULL, NULL, 0
);

INSERT INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '01967100-0000-7000-8000-000000000209', '01950000-0000-7000-8000-000000000001', 'public', '2025-01-12T09:00:00.000Z', '2025-01-12T09:00:00.000Z', 0
);

INSERT INTO search_documents (
  note_id, owner_id, visibility, title, body_plain, tag_names_json,
  directory_path, date_for_calendar, updated_at, indexed_at
) VALUES (
  '01967100-0000-7000-8000-000000000209', '01950000-0000-7000-8000-000000000001', 'public', '去年より前のノート hollow671', 'Issue #671 公開検索フィルター検証ノート09。 hollow671 のフィルターUIを確認します。', '["p671-design"]',
  '', '2025-01-12', '2025-01-12T09:00:00.000Z', '2025-01-12T09:00:00.000Z'
);
INSERT INTO note_tags (note_id, tag_id) VALUES ('01967100-0000-7000-8000-000000000209', '01967100-0000-7000-8000-000000000303');

INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  source_file_id, version
) VALUES (
  '01967100-0000-7000-8000-000000000210', '01967100-0000-7000-8000-0000000000a1', '01967100-0000-7000-8000-0000000000a2', 'p671-note-10', '2年前のノート hollow671',
  '<p>Issue #671 公開検索フィルター検証ノート10。 hollow671 のフィルターUIを確認します。</p>', '{}',
  'active', NULL, '2024-06-01T09:00:00.000Z', '2024-06-01T09:00:00.000Z',
  NULL, NULL, NULL, NULL, 0
);

INSERT INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '01967100-0000-7000-8000-000000000210', '01967100-0000-7000-8000-0000000000a1', 'public', '2024-06-01T09:00:00.000Z', '2024-06-01T09:00:00.000Z', 0
);

INSERT INTO search_documents (
  note_id, owner_id, visibility, title, body_plain, tag_names_json,
  directory_path, date_for_calendar, updated_at, indexed_at
) VALUES (
  '01967100-0000-7000-8000-000000000210', '01967100-0000-7000-8000-0000000000a1', 'public', '2年前のノート hollow671', 'Issue #671 公開検索フィルター検証ノート10。 hollow671 のフィルターUIを確認します。', '["p671-tech","p671-diary"]',
  '', '2024-06-01', '2024-06-01T09:00:00.000Z', '2024-06-01T09:00:00.000Z'
);
INSERT INTO note_tags (note_id, tag_id) VALUES ('01967100-0000-7000-8000-000000000210', '01967100-0000-7000-8000-000000000301');
INSERT INTO note_tags (note_id, tag_id) VALUES ('01967100-0000-7000-8000-000000000210', '01967100-0000-7000-8000-000000000302');
