-- ---------------------------------------------------------------------------
-- Manual-test seed data for Issue #63
--   (FilterBar に内部リンク参照フィルタの note picker UI を追加)
-- ---------------------------------------------------------------------------
-- This seed is **additive only** and assumes the prior seeds for Issue #1 /
-- Issue #8 / Issue #55 have already been applied to the local D1 (test user
-- `test-user-001@example.com` and the 10 base notes already exist).
--
-- If the test user does not yet exist, run the Issue #8 seed first:
--   pnpm db:execute:local .issue/8/manual-test/seed.sql
-- and then run this seed:
--   pnpm db:execute:local .issue/63/.manual-test/seed.sql
--
-- It only adds 8 extra **public** notes whose titles start with diverse
-- leading characters so the picker's title-prefix search can be exercised
-- against all character classes mentioned in testing.md:
--   - 平仮名 ("あ", "い")
--   - 片仮名 ("ア", "ノ")
--   - 漢字  ("日")
--   - ASCII alphabet ("H", "T", "Z")
--
-- One additional note (N15 "ノートテンプレート集") references "公開デザイン
-- ガイド" (Issue #8 / N9) via [[ ]] syntax so that selecting N9 in the
-- picker yields real results in the `?referencingNoteId=<N9 id>` filter.
--
-- All INSERTs use `OR IGNORE` so the seed can be re-applied safely.
-- ---------------------------------------------------------------------------

-- Test account credentials (from Issue #8 base seed; not modified here):
--   email:    test-user-001@example.com
--   password: TestPassword123!
--
-- After applying the seed, log in at /login and you should land on the home
-- page (/) which is the P10 note list used by Issue #63 testing.

-- ---------- Issue #63: Notes ----------------------------------------------
-- All owned by test-user-001 ('01938f00-0000-7000-8000-000000000001'),
-- placed in Inbox ('01938f00-0000-7000-8000-0000000000d1'), status='active'.
-- Notes are public (publication_states.visibility = 'public') so they appear
-- in both the picker (which queries the owner's own notes) and the public
-- listing.

-- N11: 「あ」 (hiragana, A)
INSERT OR IGNORE INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version) VALUES
  ('01938f00-0000-7000-8000-000000006301', '01938f00-0000-7000-8000-000000000001', '01938f00-0000-7000-8000-0000000000d1',
   'asita-no-meeting', 'あしたのミーティング準備',
   '<h1>あしたのミーティング</h1><p>議題: スケジュール調整、進捗共有、次週方針。</p>',
   '{"title":"あしたのミーティング準備","date":"2026-05-17","description":"明日の議題と資料"}',
   'active', NULL, '2026-05-17T08:00:00.000Z', '2026-05-17T08:00:00.000Z', NULL, NULL, NULL, 0);

-- N12: 「ア」 (katakana, A)
INSERT OR IGNORE INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version) VALUES
  ('01938f00-0000-7000-8000-000000006302', '01938f00-0000-7000-8000-000000000001', '01938f00-0000-7000-8000-0000000000d1',
   'architecture-overview', 'アーキテクチャ概観',
   '<h1>アーキテクチャ概観</h1><p>ヘキサゴナル構造、レイヤー分離、ポート/アダプターについて。</p>',
   '{"title":"アーキテクチャ概観","date":"2026-05-18","description":"プロジェクト全体の構造説明"}',
   'active', NULL, '2026-05-18T10:00:00.000Z', '2026-05-18T10:00:00.000Z', NULL, NULL, NULL, 0);

-- N13: 「い」 (hiragana, I)
INSERT OR IGNORE INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version) VALUES
  ('01938f00-0000-7000-8000-000000006303', '01938f00-0000-7000-8000-000000000001', '01938f00-0000-7000-8000-0000000000d1',
   'inspiration-board', 'いいねと思ったアイデア集',
   '<h2>インスピレーション</h2><p>気になった UI 表現、配色、コピーライティングの記録。</p>',
   '{"title":"いいねと思ったアイデア集"}',
   'active', NULL, '2026-05-11T14:00:00.000Z', '2026-05-11T14:00:00.000Z', NULL, NULL, NULL, 0);

-- N14: 「日」 (kanji, hi/nichi)
INSERT OR IGNORE INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version) VALUES
  ('01938f00-0000-7000-8000-000000006304', '01938f00-0000-7000-8000-000000000001', '01938f00-0000-7000-8000-0000000000d1',
   'daily-journal-may', '日誌 2026 年 5 月',
   '<h1>5 月の日誌</h1><p>日々の気づきと記録。</p>',
   '{"title":"日誌 2026 年 5 月","date":"2026-05-01","description":"月次の日誌"}',
   'active', NULL, '2026-05-01T18:00:00.000Z', '2026-05-19T18:00:00.000Z', NULL, NULL, NULL, 0);

-- N15: 「ノ」 (katakana, references N9 公開デザインガイド)
INSERT OR IGNORE INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version) VALUES
  ('01938f00-0000-7000-8000-000000006305', '01938f00-0000-7000-8000-000000000001', '01938f00-0000-7000-8000-0000000000d1',
   'note-templates', 'ノートテンプレート集',
   '<h1>テンプレート集</h1><p>よく使う書式と内部リンクのサンプル。参考: [[公開デザインガイド]]</p>',
   '{"title":"ノートテンプレート集","description":"テンプレートと内部リンクのサンプル"}',
   'active', NULL, '2026-05-18T15:00:00.000Z', '2026-05-18T15:00:00.000Z', NULL, NULL, NULL, 0);

-- N16: "Hello" (ASCII H)
INSERT OR IGNORE INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version) VALUES
  ('01938f00-0000-7000-8000-000000006306', '01938f00-0000-7000-8000-000000000001', '01938f00-0000-7000-8000-0000000000d1',
   'hello-world', 'Hello, world ノート',
   '<h1>Hello, world</h1><p>最初のノートの例。</p>',
   '{"title":"Hello, world ノート","description":"挨拶のサンプル"}',
   'active', NULL, '2026-05-02T09:00:00.000Z', '2026-05-02T09:00:00.000Z', NULL, NULL, NULL, 0);

-- N17: "Today" (ASCII T)
INSERT OR IGNORE INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version) VALUES
  ('01938f00-0000-7000-8000-000000006307', '01938f00-0000-7000-8000-000000000001', '01938f00-0000-7000-8000-0000000000d1',
   'today-summary', 'Today summary 2026-05-19',
   '<h2>Today</h2><p>本日の作業まとめ。</p>',
   '{"title":"Today summary 2026-05-19","date":"2026-05-19"}',
   'active', NULL, '2026-05-19T20:00:00.000Z', '2026-05-19T20:00:00.000Z', NULL, NULL, NULL, 0);

-- N18: "Zzz" (ASCII Z, used for 0-hit edge case is "Zzzzz")
INSERT OR IGNORE INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version) VALUES
  ('01938f00-0000-7000-8000-000000006308', '01938f00-0000-7000-8000-000000000001', '01938f00-0000-7000-8000-0000000000d1',
   'zzz-test-note', 'Zzz_test_note 番外編',
   '<p>並び順テストのための末尾ノート。</p>',
   '{"title":"Zzz_test_note 番外編","description":"並び順確認用"}',
   'active', NULL, '2026-05-03T03:00:00.000Z', '2026-05-03T03:00:00.000Z', NULL, NULL, NULL, 0);

-- ---------- Issue #63: publication_states (all public) --------------------
INSERT OR IGNORE INTO publication_states (note_id, owner_id, visibility, published_at, updated_at, version) VALUES
  ('01938f00-0000-7000-8000-000000006301', '01938f00-0000-7000-8000-000000000001', 'public', '2026-05-17T08:00:00.000Z', '2026-05-17T08:00:00.000Z', 0),
  ('01938f00-0000-7000-8000-000000006302', '01938f00-0000-7000-8000-000000000001', 'public', '2026-05-18T10:00:00.000Z', '2026-05-18T10:00:00.000Z', 0),
  ('01938f00-0000-7000-8000-000000006303', '01938f00-0000-7000-8000-000000000001', 'public', '2026-05-11T14:00:00.000Z', '2026-05-11T14:00:00.000Z', 0),
  ('01938f00-0000-7000-8000-000000006304', '01938f00-0000-7000-8000-000000000001', 'public', '2026-05-01T18:00:00.000Z', '2026-05-19T18:00:00.000Z', 0),
  ('01938f00-0000-7000-8000-000000006305', '01938f00-0000-7000-8000-000000000001', 'public', '2026-05-18T15:00:00.000Z', '2026-05-18T15:00:00.000Z', 0),
  ('01938f00-0000-7000-8000-000000006306', '01938f00-0000-7000-8000-000000000001', 'public', '2026-05-02T09:00:00.000Z', '2026-05-02T09:00:00.000Z', 0),
  ('01938f00-0000-7000-8000-000000006307', '01938f00-0000-7000-8000-000000000001', 'public', '2026-05-19T20:00:00.000Z', '2026-05-19T20:00:00.000Z', 0),
  ('01938f00-0000-7000-8000-000000006308', '01938f00-0000-7000-8000-000000000001', 'public', '2026-05-03T03:00:00.000Z', '2026-05-03T03:00:00.000Z', 0);

-- ---------- Issue #63: search_documents -----------------------------------
-- date_for_calendar is NOT NULL; use the publication date string for notes
-- without an explicit frontMatter.date.
INSERT OR IGNORE INTO search_documents (note_id, owner_id, visibility, title, body_plain, tag_names_json, directory_path, date_for_calendar, updated_at, indexed_at) VALUES
  ('01938f00-0000-7000-8000-000000006301', '01938f00-0000-7000-8000-000000000001', 'public', 'あしたのミーティング準備', '議題 スケジュール調整 進捗共有 次週方針',                                       '[]', 'Inbox', '2026-05-17', '2026-05-17T08:00:00.000Z', '2026-05-17T08:00:00.000Z'),
  ('01938f00-0000-7000-8000-000000006302', '01938f00-0000-7000-8000-000000000001', 'public', 'アーキテクチャ概観',         'ヘキサゴナル構造 レイヤー分離 ポート アダプター',                              '[]', 'Inbox', '2026-05-18', '2026-05-18T10:00:00.000Z', '2026-05-18T10:00:00.000Z'),
  ('01938f00-0000-7000-8000-000000006303', '01938f00-0000-7000-8000-000000000001', 'public', 'いいねと思ったアイデア集',   '気になった UI 表現 配色 コピーライティングの記録',                              '[]', 'Inbox', '2026-05-11', '2026-05-11T14:00:00.000Z', '2026-05-11T14:00:00.000Z'),
  ('01938f00-0000-7000-8000-000000006304', '01938f00-0000-7000-8000-000000000001', 'public', '日誌 2026 年 5 月',           '5 月の日誌 日々の気づきと記録',                                                  '[]', 'Inbox', '2026-05-01', '2026-05-19T18:00:00.000Z', '2026-05-19T18:00:00.000Z'),
  ('01938f00-0000-7000-8000-000000006305', '01938f00-0000-7000-8000-000000000001', 'public', 'ノートテンプレート集',       'テンプレート集 よく使う書式と内部リンクのサンプル 公開デザインガイド',          '[]', 'Inbox', '2026-05-18', '2026-05-18T15:00:00.000Z', '2026-05-18T15:00:00.000Z'),
  ('01938f00-0000-7000-8000-000000006306', '01938f00-0000-7000-8000-000000000001', 'public', 'Hello, world ノート',         '最初のノートの例',                                                                '[]', 'Inbox', '2026-05-02', '2026-05-02T09:00:00.000Z', '2026-05-02T09:00:00.000Z'),
  ('01938f00-0000-7000-8000-000000006307', '01938f00-0000-7000-8000-000000000001', 'public', 'Today summary 2026-05-19',    '本日の作業まとめ',                                                                '[]', 'Inbox', '2026-05-19', '2026-05-19T20:00:00.000Z', '2026-05-19T20:00:00.000Z'),
  ('01938f00-0000-7000-8000-000000006308', '01938f00-0000-7000-8000-000000000001', 'public', 'Zzz_test_note 番外編',        '並び順テストのための末尾ノート',                                                  '[]', 'Inbox', '2026-05-03', '2026-05-03T03:00:00.000Z', '2026-05-03T03:00:00.000Z');

-- ---------- Issue #63: note_internal_links --------------------------------
-- N15 (ノートテンプレート集) → N9 (公開デザインガイド, Issue #8 base note)
-- This single link gives the picker a real referencingNoteId target whose
-- filter result is exactly { N15 }.
INSERT OR IGNORE INTO note_internal_links (id, from_note_id, ref_kind, ref_target, display_text, resolved_note_id) VALUES
  ('01938f00-0000-7000-8000-0000000063a1',
   '01938f00-0000-7000-8000-000000006305', 'title', '公開デザインガイド', NULL,
   '01938f00-0000-7000-8000-00000000b079');
