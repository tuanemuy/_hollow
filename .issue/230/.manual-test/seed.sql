-- ---------------------------------------------------------------------------
-- Manual-test seed data for Issue #230
-- (Front Matter エディタ: 固定プロパティ前提 → 「あれば表示」モデル)
-- ---------------------------------------------------------------------------
-- このファイルは Issue #1 の seed.sql で投入された
--   user:      01938f00-0000-7000-8000-000000000001 (test-user-001@example.com)
--   directory: 01938f00-0000-7000-8000-0000000000d1 (Inbox)
-- が既に存在することを前提に、Issue #230 用のノートを「加算」する。
--
-- 既存ユーザー・既存ノートは削除しない。INSERT OR REPLACE で冪等。
-- search_documents は登録しない（このテストでは検索操作なし）。
-- publication_states は全て private（detail UI 確認のため）。
--
-- ノート ID: 01938f00-0000-7000-8000-0000000023XX (XX=01..05)
-- ---------------------------------------------------------------------------

-- ノート1: 確認項目1 (custom keys: mood, project)
INSERT OR REPLACE INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version
) VALUES (
  '01938f00-0000-7000-8000-000000002301',
  '01938f00-0000-7000-8000-000000000001',
  '01938f00-0000-7000-8000-0000000000d1',
  'issue-230-custom-keys',
  'Issue 230 - custom keys (mood/project)',
  '<p>確認項目1: 既存任意キー (mood, project) の後方互換テスト用ノート。</p>',
  '{"mood":"tired","project":"alpha"}',
  'active', NULL,
  '2026-05-20T09:00:00.000Z', '2026-05-20T09:00:00.000Z',
  NULL, NULL, NULL, 0
);

-- ノート2: 確認項目2 (legacy frontMatter.tags 残置)
INSERT OR REPLACE INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version
) VALUES (
  '01938f00-0000-7000-8000-000000002302',
  '01938f00-0000-7000-8000-000000000001',
  '01938f00-0000-7000-8000-0000000000d1',
  'issue-230-legacy-tags',
  'Issue 230 - legacy tags',
  '<p>確認項目2: 既存 frontMatter.tags が disabled + 削除ボタン有効で表示されるかのテスト。</p>',
  '{"tags":["legacy","old"]}',
  'active', NULL,
  '2026-05-20T09:05:00.000Z', '2026-05-20T09:05:00.000Z',
  NULL, NULL, NULL, 0
);

-- ノート3: 確認項目6 (rename + ordering: a, b, c)
INSERT OR REPLACE INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version
) VALUES (
  '01938f00-0000-7000-8000-000000002303',
  '01938f00-0000-7000-8000-000000000001',
  '01938f00-0000-7000-8000-0000000000d1',
  'issue-230-rename-ordering',
  'Issue 230 - rename / ordering (a/b/c)',
  '<p>確認項目6: キー rename と並び順保持のテスト用ノート。b → xyz に変更しても a → xyz → c の順序が保たれること。</p>',
  '{"a":"1","b":"2","c":"3"}',
  'active', NULL,
  '2026-05-20T09:10:00.000Z', '2026-05-20T09:10:00.000Z',
  NULL, NULL, NULL, 0
);

-- ノート4: 確認項目7 (mode toggle + complex values: scalar/array/object)
INSERT OR REPLACE INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version
) VALUES (
  '01938f00-0000-7000-8000-000000002304',
  '01938f00-0000-7000-8000-000000000001',
  '01938f00-0000-7000-8000-0000000000d1',
  'issue-230-mode-toggle-complex',
  'Issue 230 - mode toggle / complex values',
  '<p>確認項目7: 構造モード ⇔ raw JSON モードで配列・オブジェクト等の複雑値が保持されるかのテスト。</p>',
  '{"a":"1","arr":["x","y"],"nested":{"k":1}}',
  'active', NULL,
  '2026-05-20T09:15:00.000Z', '2026-05-20T09:15:00.000Z',
  NULL, NULL, NULL, 0
);

-- ノート5: 確認項目8 (detail panel: mood/title/tags が同列で並ぶ)
INSERT OR REPLACE INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version
) VALUES (
  '01938f00-0000-7000-8000-000000002305',
  '01938f00-0000-7000-8000-000000000001',
  '01938f00-0000-7000-8000-0000000000d1',
  'issue-230-detail-display',
  'Issue 230 - detail panel display',
  '<p>確認項目8: 詳細画面 (P11) FrontMatterPanel で known/others 分割が撤去され、mood / title / tags が挿入順 1 つの &lt;dl&gt; に並ぶかのテスト。</p>',
  '{"mood":"tired","title":"T","tags":["legacy"]}',
  'active', NULL,
  '2026-05-20T09:20:00.000Z', '2026-05-20T09:20:00.000Z',
  NULL, NULL, NULL, 0
);

-- ---------- publication_states (全 private) -------------------------------
INSERT OR REPLACE INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES
  ('01938f00-0000-7000-8000-000000002301', '01938f00-0000-7000-8000-000000000001', 'private', NULL, '2026-05-20T09:00:00.000Z', 0),
  ('01938f00-0000-7000-8000-000000002302', '01938f00-0000-7000-8000-000000000001', 'private', NULL, '2026-05-20T09:05:00.000Z', 0),
  ('01938f00-0000-7000-8000-000000002303', '01938f00-0000-7000-8000-000000000001', 'private', NULL, '2026-05-20T09:10:00.000Z', 0),
  ('01938f00-0000-7000-8000-000000002304', '01938f00-0000-7000-8000-000000000001', 'private', NULL, '2026-05-20T09:15:00.000Z', 0),
  ('01938f00-0000-7000-8000-000000002305', '01938f00-0000-7000-8000-000000000001', 'private', NULL, '2026-05-20T09:20:00.000Z', 0);
