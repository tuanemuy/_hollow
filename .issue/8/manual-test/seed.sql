-- ---------------------------------------------------------------------------
-- Manual-test seed data for Issue #8 (P10 visibility filter + internal link ref filter)
-- ---------------------------------------------------------------------------
-- Reuses Issue #1 seed (10 notes, mix of private/unlisted/public) and
-- additionally seeds `note_internal_links` rows so that
-- `?referencingNoteId=<id>` filter can be exercised against real data.
--
-- Idempotent re-seed: deletes the test user (cascades to all owned data,
-- including note_internal_links via notes.id ON DELETE CASCADE) and
-- re-inserts. Safe to re-run.
--
-- Test account credentials:
--   email:    test-user-001@example.com
--   password: TestPassword123!
--
-- The password hash below was generated with the same PBKDF2-SHA256 / 600k
-- iteration parameters that `D1CredentialStore.hashPassword` uses, so
-- `verifyPassword` accepts it.
-- ---------------------------------------------------------------------------

-- Wipe everything that cascades from this user first.
DELETE FROM users WHERE id = '01938f00-0000-7000-8000-000000000001';

-- ---------- User ----------------------------------------------------------
INSERT INTO users (
  id, name, email, email_verified, image,
  created_at, updated_at,
  username, display_username, role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '01938f00-0000-7000-8000-000000000001',
  'テストユーザー001',
  'test-user-001@example.com',
  1,
  NULL,
  '2026-05-01T00:00:00.000Z',
  '2026-05-01T00:00:00.000Z',
  'test-user-001',
  'test-user-001',
  'member',
  0, NULL, NULL,
  'manual test シードユーザー',
  NULL, NULL, NULL
);

-- ---------- Account (PBKDF2 password) -------------------------------------
INSERT INTO accounts (
  id, user_id, account_id, provider_id,
  password, access_token, refresh_token, id_token,
  access_token_expires_at, refresh_token_expires_at, scope,
  created_at, updated_at
) VALUES (
  '01938f00-0000-7000-8000-0000000000a1',
  '01938f00-0000-7000-8000-000000000001',
  '01938f00-0000-7000-8000-000000000001',
  'credential',
  'pbkdf2-sha256-v1$600000$FNW58b/97MhJdfElCEp3eA==$/WGvBuiuy7nfuJojvtjHfGCD5AWEZ7x6GNVsLmS7X9M=',
  NULL, NULL, NULL, NULL, NULL, NULL,
  '2026-05-01T00:00:00.000Z',
  '2026-05-01T00:00:00.000Z'
);

-- ---------- Directories ---------------------------------------------------
-- One root per owner (parent_id IS NULL, empty name/slug, depth 0).
-- Inbox / Projects / Archive sit at depth 1 under root.
-- Project A / Project B sit at depth 2 under Projects.
INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at) VALUES
  ('01938f00-0000-7000-8000-0000000000d0', '01938f00-0000-7000-8000-000000000001', NULL, '', '', 0, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'),
  ('01938f00-0000-7000-8000-0000000000d1', '01938f00-0000-7000-8000-000000000001', '01938f00-0000-7000-8000-0000000000d0', 'Inbox',    'inbox',    1, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'),
  ('01938f00-0000-7000-8000-0000000000d2', '01938f00-0000-7000-8000-000000000001', '01938f00-0000-7000-8000-0000000000d0', 'Projects', 'projects', 1, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'),
  ('01938f00-0000-7000-8000-0000000000d3', '01938f00-0000-7000-8000-000000000001', '01938f00-0000-7000-8000-0000000000d0', 'Archive',  'archive',  1, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'),
  ('01938f00-0000-7000-8000-0000000000d4', '01938f00-0000-7000-8000-000000000001', '01938f00-0000-7000-8000-0000000000d2', 'Project A', 'project-a', 2, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'),
  ('01938f00-0000-7000-8000-0000000000d5', '01938f00-0000-7000-8000-000000000001', '01938f00-0000-7000-8000-0000000000d2', 'Project B', 'project-b', 2, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');

-- ---------- Tags ----------------------------------------------------------
INSERT INTO tags (id, owner_id, name, name_normalized, note_count, version, created_at, updated_at) VALUES
  ('01938f00-0000-7000-8000-00000000a071', '01938f00-0000-7000-8000-000000000001', 'work',      'work',      0, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'),
  ('01938f00-0000-7000-8000-00000000a072', '01938f00-0000-7000-8000-000000000001', 'personal',  'personal',  0, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'),
  ('01938f00-0000-7000-8000-00000000a073', '01938f00-0000-7000-8000-000000000001', 'project-a', 'project-a', 0, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'),
  ('01938f00-0000-7000-8000-00000000a074', '01938f00-0000-7000-8000-000000000001', 'ideas',     'ideas',     0, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'),
  ('01938f00-0000-7000-8000-00000000a075', '01938f00-0000-7000-8000-000000000001', 'todo',      'todo',      0, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'),
  ('01938f00-0000-7000-8000-00000000a076', '01938f00-0000-7000-8000-000000000001', 'review',    'review',    0, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'),
  ('01938f00-0000-7000-8000-00000000a077', '01938f00-0000-7000-8000-000000000001', 'design',    'design',    0, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');

-- ---------- Notes ---------------------------------------------------------
-- 10 notes spread across directories, visibilities, dates.

-- N1: Inbox, private, work + todo, recent
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version) VALUES
  ('01938f00-0000-7000-8000-00000000b071', '01938f00-0000-7000-8000-000000000001', '01938f00-0000-7000-8000-0000000000d1',
   'weekly-planning', 'Weekly planning ノート',
   '<h1>Weekly planning</h1><p>今週やること一覧。<strong>レビュー</strong>と<em>仕様策定</em>を中心に。参考: [[公開デザインガイド]] / [[Project A キックオフ]]</p><ul><li>P10 リファクタ</li><li>P11 メタ情報パネル</li></ul>',
   '{"title":"Weekly planning ノート","date":"2026-05-15","tags":["work","todo"],"description":"今週の作業計画","slug":"weekly-planning"}',
   'active', NULL, '2026-05-15T09:00:00.000Z', '2026-05-15T09:00:00.000Z', NULL, NULL, NULL, 0);

-- N2: Inbox, private, ideas
INSERT INTO notes VALUES
  ('01938f00-0000-7000-8000-00000000b072', '01938f00-0000-7000-8000-000000000001', '01938f00-0000-7000-8000-0000000000d1',
   'brainstorm-features', 'ブレインストーミング',
   '<h2>新機能アイデア</h2><p>カレンダー表示で <code>frontMatter.date</code> を優先するモードがほしい。</p>',
   '{"title":"ブレインストーミング","date":"2026-05-14","tags":["ideas"],"description":"アイデアメモ"}',
   'active', NULL, '2026-05-14T11:30:00.000Z', '2026-05-14T11:30:00.000Z', NULL, NULL, NULL, 0);

-- N3: Project A, private, project-a + work
INSERT INTO notes VALUES
  ('01938f00-0000-7000-8000-00000000b073', '01938f00-0000-7000-8000-000000000001', '01938f00-0000-7000-8000-0000000000d4',
   'project-a-kickoff', 'Project A キックオフ',
   '<h1>Project A キックオフ</h1><p>スコープ、マイルストーン、リスクの洗い出し。関連: [[Project B レビュー記録]]</p><blockquote>次回 5/20 に進捗共有。</blockquote>',
   '{"title":"Project A キックオフ","date":"2026-05-12","tags":["project-a","work"],"description":"プロジェクト A の初回ミーティング","slug":"project-a-kickoff"}',
   'active', NULL, '2026-05-12T13:00:00.000Z', '2026-05-12T13:00:00.000Z', NULL, NULL, NULL, 0);

-- N4: Project A, unlisted, project-a + design
INSERT INTO notes VALUES
  ('01938f00-0000-7000-8000-00000000b074', '01938f00-0000-7000-8000-000000000001', '01938f00-0000-7000-8000-0000000000d4',
   'project-a-design-notes', 'Project A デザインメモ',
   '<h2>UI スケッチ</h2><p>Sidebar はツリー + 検索。本文エリアは MD レンダリングを最優先。</p>',
   '{"title":"Project A デザインメモ","tags":["project-a","design"],"description":"ラフ案"}',
   'active', NULL, '2026-05-13T15:45:00.000Z', '2026-05-13T15:45:00.000Z', NULL, NULL, NULL, 0);

-- N5: Project B, private, work + review
INSERT INTO notes VALUES
  ('01938f00-0000-7000-8000-00000000b075', '01938f00-0000-7000-8000-000000000001', '01938f00-0000-7000-8000-0000000000d5',
   'project-b-review', 'Project B レビュー記録',
   '<h1>Review 2026-05-10</h1><p>仕様レビュー結果。修正点 3 件。</p>',
   '{"title":"Project B レビュー記録","date":"2026-05-10","tags":["work","review"]}',
   'active', NULL, '2026-05-10T16:00:00.000Z', '2026-05-10T16:00:00.000Z', NULL, NULL, NULL, 0);

-- N6: Projects (root), private, todo
INSERT INTO notes VALUES
  ('01938f00-0000-7000-8000-00000000b076', '01938f00-0000-7000-8000-000000000001', '01938f00-0000-7000-8000-0000000000d2',
   'meeting-notes-may', '5 月定例ミーティング',
   '<p>5/8 定例：プロダクト方針の共有、Q2 OKR の確認。</p>',
   '{"title":"5 月定例ミーティング","date":"2026-05-08","tags":["todo"]}',
   'active', NULL, '2026-05-08T10:00:00.000Z', '2026-05-08T10:00:00.000Z', NULL, NULL, NULL, 0);

-- N7: Inbox, private, personal
INSERT INTO notes VALUES
  ('01938f00-0000-7000-8000-00000000b077', '01938f00-0000-7000-8000-000000000001', '01938f00-0000-7000-8000-0000000000d1',
   'reading-list', 'Reading list',
   '<h2>読みたい本</h2><ul><li>Domain-Driven Design</li><li>Implementing DDD</li></ul>',
   '{"title":"Reading list","tags":["personal","ideas"]}',
   'active', NULL, '2026-05-05T19:20:00.000Z', '2026-05-05T19:20:00.000Z', NULL, NULL, NULL, 0);

-- N8: Archive, private, work (older)
INSERT INTO notes VALUES
  ('01938f00-0000-7000-8000-00000000b078', '01938f00-0000-7000-8000-000000000001', '01938f00-0000-7000-8000-0000000000d3',
   'q1-retrospective', 'Q1 ふりかえり',
   '<h1>Q1 ふりかえり</h1><p>達成したこと、課題、来期の改善点をまとめた。</p>',
   '{"title":"Q1 ふりかえり","date":"2026-04-01","tags":["work","review"]}',
   'active', NULL, '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z', NULL, NULL, NULL, 0);

-- N9: Public, design + ideas (showcased note)
INSERT INTO notes VALUES
  ('01938f00-0000-7000-8000-00000000b079', '01938f00-0000-7000-8000-000000000001', '01938f00-0000-7000-8000-0000000000d2',
   'public-design-guide', '公開デザインガイド',
   '<h1>デザイン原則</h1><p>シンプルさ、一貫性、フィードバックの即時性。</p><p>参照: [[Project A デザインメモ]]</p><p>サンプル: <a href="https://example.com">link</a></p>',
   '{"title":"公開デザインガイド","date":"2026-05-09","tags":["design","ideas"],"description":"パブリッシュ用のサンプル","slug":"public-design-guide"}',
   'active', NULL, '2026-05-09T12:00:00.000Z', '2026-05-09T12:00:00.000Z', NULL, NULL, NULL, 0);

-- N10: Inbox, private, todo (newest, calendar test)
INSERT INTO notes VALUES
  ('01938f00-0000-7000-8000-00000000b07a', '01938f00-0000-7000-8000-000000000001', '01938f00-0000-7000-8000-0000000000d1',
   'today-todo', '今日のタスク',
   '<ul><li>テストデータ整備</li><li>動作確認</li><li>レビュー</li></ul>',
   '{"title":"今日のタスク","date":"2026-05-16","tags":["todo","personal"]}',
   'active', NULL, '2026-05-16T08:00:00.000Z', '2026-05-16T08:00:00.000Z', NULL, NULL, NULL, 0);

-- ---------- note_tags (many-to-many) --------------------------------------
INSERT INTO note_tags (note_id, tag_id) VALUES
  -- N1: work, todo
  ('01938f00-0000-7000-8000-00000000b071', '01938f00-0000-7000-8000-00000000a071'),
  ('01938f00-0000-7000-8000-00000000b071', '01938f00-0000-7000-8000-00000000a075'),
  -- N2: ideas
  ('01938f00-0000-7000-8000-00000000b072', '01938f00-0000-7000-8000-00000000a074'),
  -- N3: project-a, work
  ('01938f00-0000-7000-8000-00000000b073', '01938f00-0000-7000-8000-00000000a073'),
  ('01938f00-0000-7000-8000-00000000b073', '01938f00-0000-7000-8000-00000000a071'),
  -- N4: project-a, design
  ('01938f00-0000-7000-8000-00000000b074', '01938f00-0000-7000-8000-00000000a073'),
  ('01938f00-0000-7000-8000-00000000b074', '01938f00-0000-7000-8000-00000000a077'),
  -- N5: work, review
  ('01938f00-0000-7000-8000-00000000b075', '01938f00-0000-7000-8000-00000000a071'),
  ('01938f00-0000-7000-8000-00000000b075', '01938f00-0000-7000-8000-00000000a076'),
  -- N6: todo
  ('01938f00-0000-7000-8000-00000000b076', '01938f00-0000-7000-8000-00000000a075'),
  -- N7: personal, ideas
  ('01938f00-0000-7000-8000-00000000b077', '01938f00-0000-7000-8000-00000000a072'),
  ('01938f00-0000-7000-8000-00000000b077', '01938f00-0000-7000-8000-00000000a074'),
  -- N8: work, review
  ('01938f00-0000-7000-8000-00000000b078', '01938f00-0000-7000-8000-00000000a071'),
  ('01938f00-0000-7000-8000-00000000b078', '01938f00-0000-7000-8000-00000000a076'),
  -- N9: design, ideas
  ('01938f00-0000-7000-8000-00000000b079', '01938f00-0000-7000-8000-00000000a077'),
  ('01938f00-0000-7000-8000-00000000b079', '01938f00-0000-7000-8000-00000000a074'),
  -- N10: todo, personal
  ('01938f00-0000-7000-8000-00000000b07a', '01938f00-0000-7000-8000-00000000a075'),
  ('01938f00-0000-7000-8000-00000000b07a', '01938f00-0000-7000-8000-00000000a072');

-- Tag counts (denormalised noteCount)
UPDATE tags SET note_count = 4 WHERE id = '01938f00-0000-7000-8000-00000000a071'; -- work
UPDATE tags SET note_count = 2 WHERE id = '01938f00-0000-7000-8000-00000000a072'; -- personal
UPDATE tags SET note_count = 2 WHERE id = '01938f00-0000-7000-8000-00000000a073'; -- project-a
UPDATE tags SET note_count = 3 WHERE id = '01938f00-0000-7000-8000-00000000a074'; -- ideas
UPDATE tags SET note_count = 4 WHERE id = '01938f00-0000-7000-8000-00000000a075'; -- todo
UPDATE tags SET note_count = 2 WHERE id = '01938f00-0000-7000-8000-00000000a076'; -- review
UPDATE tags SET note_count = 2 WHERE id = '01938f00-0000-7000-8000-00000000a077'; -- design

-- ---------- publication_states -------------------------------------------
-- All notes get a row; visibilities: N4 unlisted, N9 public, others private.
INSERT INTO publication_states (note_id, owner_id, visibility, published_at, updated_at, version) VALUES
  ('01938f00-0000-7000-8000-00000000b071', '01938f00-0000-7000-8000-000000000001', 'private',  NULL, '2026-05-15T09:00:00.000Z', 0),
  ('01938f00-0000-7000-8000-00000000b072', '01938f00-0000-7000-8000-000000000001', 'private',  NULL, '2026-05-14T11:30:00.000Z', 0),
  ('01938f00-0000-7000-8000-00000000b073', '01938f00-0000-7000-8000-000000000001', 'private',  NULL, '2026-05-12T13:00:00.000Z', 0),
  ('01938f00-0000-7000-8000-00000000b074', '01938f00-0000-7000-8000-000000000001', 'unlisted', '2026-05-13T15:45:00.000Z', '2026-05-13T15:45:00.000Z', 0),
  ('01938f00-0000-7000-8000-00000000b075', '01938f00-0000-7000-8000-000000000001', 'private',  NULL, '2026-05-10T16:00:00.000Z', 0),
  ('01938f00-0000-7000-8000-00000000b076', '01938f00-0000-7000-8000-000000000001', 'private',  NULL, '2026-05-08T10:00:00.000Z', 0),
  ('01938f00-0000-7000-8000-00000000b077', '01938f00-0000-7000-8000-000000000001', 'private',  NULL, '2026-05-05T19:20:00.000Z', 0),
  ('01938f00-0000-7000-8000-00000000b078', '01938f00-0000-7000-8000-000000000001', 'private',  NULL, '2026-04-01T09:00:00.000Z', 0),
  ('01938f00-0000-7000-8000-00000000b079', '01938f00-0000-7000-8000-000000000001', 'public',   '2026-05-09T12:00:00.000Z', '2026-05-09T12:00:00.000Z', 0),
  ('01938f00-0000-7000-8000-00000000b07a', '01938f00-0000-7000-8000-000000000001', 'private',  NULL, '2026-05-16T08:00:00.000Z', 0);

-- ---------- search_documents (FTS triggers will sync the virtual table) ---
INSERT INTO search_documents (note_id, owner_id, visibility, title, body_plain, tag_names_json, directory_path, date_for_calendar, updated_at, indexed_at) VALUES
  ('01938f00-0000-7000-8000-00000000b071', '01938f00-0000-7000-8000-000000000001', 'private',  'Weekly planning ノート', '今週やること一覧。レビューと仕様策定を中心に。P10 リファクタ P11 メタ情報パネル', '["work","todo"]',      'Inbox',              '2026-05-15', '2026-05-15T09:00:00.000Z', '2026-05-15T09:00:00.000Z'),
  ('01938f00-0000-7000-8000-00000000b072', '01938f00-0000-7000-8000-000000000001', 'private',  'ブレインストーミング',     '新機能アイデア カレンダー表示で frontMatter.date を優先するモードがほしい',         '["ideas"]',            'Inbox',              '2026-05-14', '2026-05-14T11:30:00.000Z', '2026-05-14T11:30:00.000Z'),
  ('01938f00-0000-7000-8000-00000000b073', '01938f00-0000-7000-8000-000000000001', 'private',  'Project A キックオフ',     'スコープ マイルストーン リスクの洗い出し 次回 5/20 に進捗共有',                    '["project-a","work"]', 'Projects/Project A', '2026-05-12', '2026-05-12T13:00:00.000Z', '2026-05-12T13:00:00.000Z'),
  ('01938f00-0000-7000-8000-00000000b074', '01938f00-0000-7000-8000-000000000001', 'unlisted', 'Project A デザインメモ',   'UI スケッチ Sidebar はツリー + 検索 本文エリアは MD レンダリングを最優先',          '["project-a","design"]','Projects/Project A', '2026-05-13', '2026-05-13T15:45:00.000Z', '2026-05-13T15:45:00.000Z'),
  ('01938f00-0000-7000-8000-00000000b075', '01938f00-0000-7000-8000-000000000001', 'private',  'Project B レビュー記録',   'Review 2026-05-10 仕様レビュー結果 修正点 3 件',                                    '["work","review"]',    'Projects/Project B', '2026-05-10', '2026-05-10T16:00:00.000Z', '2026-05-10T16:00:00.000Z'),
  ('01938f00-0000-7000-8000-00000000b076', '01938f00-0000-7000-8000-000000000001', 'private',  '5 月定例ミーティング',     '5/8 定例 プロダクト方針の共有 Q2 OKR の確認',                                       '["todo"]',             'Projects',           '2026-05-08', '2026-05-08T10:00:00.000Z', '2026-05-08T10:00:00.000Z'),
  ('01938f00-0000-7000-8000-00000000b077', '01938f00-0000-7000-8000-000000000001', 'private',  'Reading list',              '読みたい本 Domain-Driven Design Implementing DDD',                                  '["personal","ideas"]', 'Inbox',              '2026-05-05', '2026-05-05T19:20:00.000Z', '2026-05-05T19:20:00.000Z'),
  ('01938f00-0000-7000-8000-00000000b078', '01938f00-0000-7000-8000-000000000001', 'private',  'Q1 ふりかえり',             'Q1 ふりかえり 達成したこと 課題 来期の改善点',                                       '["work","review"]',    'Archive',            '2026-04-01', '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
  ('01938f00-0000-7000-8000-00000000b079', '01938f00-0000-7000-8000-000000000001', 'public',   '公開デザインガイド',         'デザイン原則 シンプルさ 一貫性 フィードバックの即時性',                              '["design","ideas"]',   'Projects',           '2026-05-09', '2026-05-09T12:00:00.000Z', '2026-05-09T12:00:00.000Z'),
  ('01938f00-0000-7000-8000-00000000b07a', '01938f00-0000-7000-8000-000000000001', 'private',  '今日のタスク',               'テストデータ整備 動作確認 レビュー',                                                  '["todo","personal"]',  'Inbox',              '2026-05-16', '2026-05-16T08:00:00.000Z', '2026-05-16T08:00:00.000Z');

-- ---------- saved_views ---------------------------------------------------
-- One personal saved view: "work / todo タグ + リスト表示" を保存した状態。
-- query_json の形は domain/view/valueObject.ts の ViewQuery に準拠
-- (フラット構造、tagIds は TagId 配列)。
-- sort_json は { by, direction } 形式 (ViewSort)。
INSERT INTO saved_views (
  id, owner_id, name, kind, query_json, display_mode, calendar_date_key, sort_json,
  is_default, broken_conditions_json, version, created_at, updated_at
) VALUES (
  '01938f00-0000-7000-8000-00000000d071',
  '01938f00-0000-7000-8000-000000000001',
  '作業中のタスク',
  'personal',
  '{"directoryId":null,"tagIds":["01938f00-0000-7000-8000-00000000a071","01938f00-0000-7000-8000-00000000a075"],"dateRange":null,"keyword":null,"referencingNoteId":null,"visibilityFilter":[]}',
  'list',
  'updated',
  '{"by":"updatedAt","direction":"desc"}',
  0,
  '[]',
  0,
  '2026-05-15T10:00:00.000Z',
  '2026-05-15T10:00:00.000Z'
);

-- ---------- note_internal_links -----------------------------------------
-- 4 resolved internal links across 3 source notes; multiple directions so
-- ?referencingNoteId=<id> can be exercised against several targets.
--
-- Direction map (from → to):
--   N1 (Weekly planning)         → N9 (公開デザインガイド)        [resolved]
--   N1 (Weekly planning)         → N3 (Project A キックオフ)       [resolved]
--   N3 (Project A キックオフ)     → N5 (Project B レビュー記録)    [resolved]
--   N9 (公開デザインガイド)       → N4 (Project A デザインメモ)    [resolved]
--
-- ref_kind='title' / ref_target = <referenced note title>.
-- Column order: id, from_note_id, ref_kind, ref_target, display_text, resolved_note_id.
INSERT INTO note_internal_links (id, from_note_id, ref_kind, ref_target, display_text, resolved_note_id) VALUES
  ('01938f00-0000-7000-8000-0000000000l1',
   '01938f00-0000-7000-8000-00000000b071', 'title', '公開デザインガイド',     NULL,
   '01938f00-0000-7000-8000-00000000b079'),
  ('01938f00-0000-7000-8000-0000000000l2',
   '01938f00-0000-7000-8000-00000000b071', 'title', 'Project A キックオフ',    NULL,
   '01938f00-0000-7000-8000-00000000b073'),
  ('01938f00-0000-7000-8000-0000000000l3',
   '01938f00-0000-7000-8000-00000000b073', 'title', 'Project B レビュー記録',  NULL,
   '01938f00-0000-7000-8000-00000000b075'),
  ('01938f00-0000-7000-8000-0000000000l4',
   '01938f00-0000-7000-8000-00000000b079', 'title', 'Project A デザインメモ',  NULL,
   '01938f00-0000-7000-8000-00000000b074');

-- ---------- instance_settings (singleton) --------------------------------
-- Some routes / DI may expect the singleton row. Insert if absent.
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
  '2026-05-01T00:00:00.000Z'
);
