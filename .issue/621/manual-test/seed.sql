-- ===========================================================================
-- Issue #621 ブラウザ検証用シード（公開ページ P30/P31/P32）
--
-- 投入対象: dev-admin (USER_ID 01950000-0000-7000-8000-000000000001) 所有の
--   公開ノート 7件。幅バグ検証のためタイトル・本文の長さにばらつきを持たせる。
--     - 極端に短いもの 2件 (short / a)
--     - 非常に長いタイトル＋長い本文 3件 (long-title-*, long-body-cjk)
--     - 中くらい 2件 (medium-*)
--   さらに検証用タグ 3件 (design / test / guide) を一部ノードに付与。
--
-- 公開判定: publication_states.visibility = 'public'（listUserPublicNotes /
--   getPublicNote / searchPublicNotes の唯一のゲート）。検索ヒットには
--   search_documents への対応行が必須（FTS は AFTER INSERT トリガーで自動同期）。
--
-- 冪等性: 固定テストID (01950621-...-000001..000007 / タグ ...-0001..0003) を
--   FK 子から順に DELETE してから INSERT。既存の dev-admin データには触れない。
--   directory_id は dev-admin の既存ルートディレクトリを流用。
-- ===========================================================================

-- --- 既存テストデータの掃除（FK 子から順に） ---------------------------------
DELETE FROM note_tags WHERE note_id IN (
  '01950621-0000-7000-8000-000000000001',
  '01950621-0000-7000-8000-000000000002',
  '01950621-0000-7000-8000-000000000003',
  '01950621-0000-7000-8000-000000000004',
  '01950621-0000-7000-8000-000000000005',
  '01950621-0000-7000-8000-000000000006',
  '01950621-0000-7000-8000-000000000007'
);
DELETE FROM search_documents WHERE note_id IN (
  '01950621-0000-7000-8000-000000000001',
  '01950621-0000-7000-8000-000000000002',
  '01950621-0000-7000-8000-000000000003',
  '01950621-0000-7000-8000-000000000004',
  '01950621-0000-7000-8000-000000000005',
  '01950621-0000-7000-8000-000000000006',
  '01950621-0000-7000-8000-000000000007'
);
DELETE FROM publication_states WHERE note_id IN (
  '01950621-0000-7000-8000-000000000001',
  '01950621-0000-7000-8000-000000000002',
  '01950621-0000-7000-8000-000000000003',
  '01950621-0000-7000-8000-000000000004',
  '01950621-0000-7000-8000-000000000005',
  '01950621-0000-7000-8000-000000000006',
  '01950621-0000-7000-8000-000000000007'
);
DELETE FROM notes WHERE id IN (
  '01950621-0000-7000-8000-000000000001',
  '01950621-0000-7000-8000-000000000002',
  '01950621-0000-7000-8000-000000000003',
  '01950621-0000-7000-8000-000000000004',
  '01950621-0000-7000-8000-000000000005',
  '01950621-0000-7000-8000-000000000006',
  '01950621-0000-7000-8000-000000000007'
);
-- 自前ID（...-0000000a0002/0003）のタグだけ掃除。design は dev-admin が既に
-- 別IDで保持しているため削除しない（INSERT OR IGNORE で温存）。
DELETE FROM tags WHERE id IN (
  '01950621-0000-7000-8000-0000000a0002',
  '01950621-0000-7000-8000-0000000a0003'
);

-- --- タグ 3件（design / test / guide） ---------------------------------------
-- design は dev-admin に既存（別ID）なので OR IGNORE で温存。note_tags は
-- 後段で (owner_id, name_normalized) 解決により既存IDへ正しく結びつける。
INSERT OR IGNORE INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at) VALUES
  ('01950621-0000-7000-8000-0000000a0001', '01950000-0000-7000-8000-000000000001', 'design', 'design', 0, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'),
  ('01950621-0000-7000-8000-0000000a0002', '01950000-0000-7000-8000-000000000001', 'test',   'test',   0, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'),
  ('01950621-0000-7000-8000-0000000a0003', '01950000-0000-7000-8000-000000000001', 'guide',  'guide',  0, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');

-- ===========================================================================
-- ノート1: 極端に短い（タイトル 1 文字 / 本文ごく短い）
-- ===========================================================================
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  source_file_id, version
) VALUES (
  '01950621-0000-7000-8000-000000000001',
  '01950000-0000-7000-8000-000000000001',
  '01950542-0000-7000-8000-000000000010',
  'a',
  'a',
  '<p>テスト</p>',
  '{}',
  'active', NULL, '2024-02-01T00:00:00.000Z', '2024-02-01T00:00:00.000Z',
  NULL, NULL, NULL, NULL, 0
);
INSERT INTO publication_states (note_id, owner_id, visibility, published_at, updated_at, version) VALUES
  ('01950621-0000-7000-8000-000000000001', '01950000-0000-7000-8000-000000000001', 'public', '2024-02-01T00:00:00.000Z', '2024-02-01T00:00:00.000Z', 0);
INSERT INTO search_documents (note_id, owner_id, visibility, title, body_plain, tag_names_json, directory_path, date_for_calendar, updated_at, indexed_at) VALUES
  ('01950621-0000-7000-8000-000000000001', '01950000-0000-7000-8000-000000000001', 'public', 'a', 'テスト', '[]', '', '2024-02-01', '2024-02-01T00:00:00.000Z', '2024-02-01T00:00:00.000Z');

-- ===========================================================================
-- ノート2: 短い（タイトル短い / 本文 1 行）
-- ===========================================================================
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  source_file_id, version
) VALUES (
  '01950621-0000-7000-8000-000000000002',
  '01950000-0000-7000-8000-000000000001',
  '01950542-0000-7000-8000-000000000010',
  'short',
  'Short',
  '<p>短いノート。テスト用の本文です。</p>',
  '{}',
  'active', NULL, '2024-02-02T00:00:00.000Z', '2024-02-02T00:00:00.000Z',
  NULL, NULL, NULL, NULL, 0
);
INSERT INTO publication_states (note_id, owner_id, visibility, published_at, updated_at, version) VALUES
  ('01950621-0000-7000-8000-000000000002', '01950000-0000-7000-8000-000000000001', 'public', '2024-02-02T00:00:00.000Z', '2024-02-02T00:00:00.000Z', 0);
INSERT INTO search_documents (note_id, owner_id, visibility, title, body_plain, tag_names_json, directory_path, date_for_calendar, updated_at, indexed_at) VALUES
  ('01950621-0000-7000-8000-000000000002', '01950000-0000-7000-8000-000000000001', 'public', 'Short', '短いノート。テスト用の本文です。', '["test"]', '', '2024-02-02', '2024-02-02T00:00:00.000Z', '2024-02-02T00:00:00.000Z');
INSERT INTO note_tags (note_id, tag_id)
  SELECT '01950621-0000-7000-8000-000000000002', id FROM tags
  WHERE owner_id='01950000-0000-7000-8000-000000000001' AND name_normalized='test';

-- ===========================================================================
-- ノート3: 中くらい（design タグ付き）
-- ===========================================================================
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  source_file_id, version
) VALUES (
  '01950621-0000-7000-8000-000000000003',
  '01950000-0000-7000-8000-000000000001',
  '01950542-0000-7000-8000-000000000010',
  'note-medium-design-principles',
  'デザイン原則についての中くらいのノート',
  '<p>デザイン原則をまとめた中くらいの長さのノートです。余白、タイポグラフィ、コントラスト、一貫性といった基本を扱います。テストというキーワードも含めているので検索からも到達できます。</p><p>2段落目では具体例を少し挙げます。リストやカードのレイアウトで余白をどう取るか、見出しの階層をどう設計するかといった話題です。</p>',
  '{}',
  'active', NULL, '2024-02-03T00:00:00.000Z', '2024-02-03T00:00:00.000Z',
  NULL, NULL, NULL, NULL, 0
);
INSERT INTO publication_states (note_id, owner_id, visibility, published_at, updated_at, version) VALUES
  ('01950621-0000-7000-8000-000000000003', '01950000-0000-7000-8000-000000000001', 'public', '2024-02-03T00:00:00.000Z', '2024-02-03T00:00:00.000Z', 0);
INSERT INTO search_documents (note_id, owner_id, visibility, title, body_plain, tag_names_json, directory_path, date_for_calendar, updated_at, indexed_at) VALUES
  ('01950621-0000-7000-8000-000000000003', '01950000-0000-7000-8000-000000000001', 'public', 'デザイン原則についての中くらいのノート', 'デザイン原則をまとめた中くらいの長さのノートです。余白、タイポグラフィ、コントラスト、一貫性といった基本を扱います。テストというキーワードも含めているので検索からも到達できます。2段落目では具体例を少し挙げます。リストやカードのレイアウトで余白をどう取るか、見出しの階層をどう設計するかといった話題です。', '["design"]', '', '2024-02-03', '2024-02-03T00:00:00.000Z', '2024-02-03T00:00:00.000Z');
INSERT INTO note_tags (note_id, tag_id)
  SELECT '01950621-0000-7000-8000-000000000003', id FROM tags
  WHERE owner_id='01950000-0000-7000-8000-000000000001' AND name_normalized='design';

-- ===========================================================================
-- ノート4: 中くらい（guide タグ付き / 英数字混在）
-- ===========================================================================
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  source_file_id, version
) VALUES (
  '01950621-0000-7000-8000-000000000004',
  '01950000-0000-7000-8000-000000000001',
  '01950542-0000-7000-8000-000000000010',
  'note-medium-getting-started',
  'Getting Started Guide — はじめてのセットアップ手順',
  '<p>This is a medium-length public note mixing English and 日本語. It walks through a getting-started flow: install, configure, and verify. テスト keyword is embedded so /search?q=テスト reaches it too.</p><p>Step by step instructions follow with a short checklist so readers can confirm each part works before moving on.</p>',
  '{}',
  'active', NULL, '2024-02-04T00:00:00.000Z', '2024-02-04T00:00:00.000Z',
  NULL, NULL, NULL, NULL, 0
);
INSERT INTO publication_states (note_id, owner_id, visibility, published_at, updated_at, version) VALUES
  ('01950621-0000-7000-8000-000000000004', '01950000-0000-7000-8000-000000000001', 'public', '2024-02-04T00:00:00.000Z', '2024-02-04T00:00:00.000Z', 0);
INSERT INTO search_documents (note_id, owner_id, visibility, title, body_plain, tag_names_json, directory_path, date_for_calendar, updated_at, indexed_at) VALUES
  ('01950621-0000-7000-8000-000000000004', '01950000-0000-7000-8000-000000000001', 'public', 'Getting Started Guide — はじめてのセットアップ手順', 'This is a medium-length public note mixing English and 日本語. It walks through a getting-started flow: install, configure, and verify. テスト keyword is embedded so search reaches it too. Step by step instructions follow with a short checklist so readers can confirm each part works before moving on.', '["guide"]', '', '2024-02-04', '2024-02-04T00:00:00.000Z', '2024-02-04T00:00:00.000Z');
INSERT INTO note_tags (note_id, tag_id)
  SELECT '01950621-0000-7000-8000-000000000004', id FROM tags
  WHERE owner_id='01950000-0000-7000-8000-000000000001' AND name_normalized='guide';

-- ===========================================================================
-- ノート5: 非常に長いタイトル + 長い本文（幅バグ検証メイン / design+test タグ）
-- ===========================================================================
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  source_file_id, version
) VALUES (
  '01950621-0000-7000-8000-000000000005',
  '01950000-0000-7000-8000-000000000001',
  '01950542-0000-7000-8000-000000000010',
  'note-width-long-title-sample',
  'これは折り返しと省略表示の幅バグを検証するための非常に長いタイトルのノートでありタイトルがカードやヘッダーの横幅を突き破らないことヘッダーの一覧詳細の各レイアウトで適切に省略または折り返しされることを確認するためのサンプルですテストキーワードも含む',
  '<p>これは幅バグ検証用の非常に長い本文を持つ公開ノートです。タイトルが極端に長い場合に、一覧カードと詳細ヘッダーの両方でタイトルが横幅を突き破らず、適切に折り返しまたは省略されることを確認します。テストというキーワードを含むので /search?q=テスト で確実にヒットします。</p><p>本文も長くして、スニペットの行数clamp、長い段落の折り返し、word-break の挙動を検証します。途中に very-long-unbroken-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa のような区切りのない長い英数字列を入れて overflow を誘発します。</p><p>さらに段落を重ね、長文がレイアウトの縦横を破綻させないことを目視確認します。リスト、引用、コードのような要素はここには含めていませんが、プレーンな段落の連続でも十分にスクロールと折り返しの確認ができます。デザインとテストの観点を両方含めた内容です。</p>',
  '{}',
  'active', NULL, '2024-02-05T00:00:00.000Z', '2024-02-05T00:00:00.000Z',
  NULL, NULL, NULL, NULL, 0
);
INSERT INTO publication_states (note_id, owner_id, visibility, published_at, updated_at, version) VALUES
  ('01950621-0000-7000-8000-000000000005', '01950000-0000-7000-8000-000000000001', 'public', '2024-02-05T00:00:00.000Z', '2024-02-05T00:00:00.000Z', 0);
INSERT INTO search_documents (note_id, owner_id, visibility, title, body_plain, tag_names_json, directory_path, date_for_calendar, updated_at, indexed_at) VALUES
  ('01950621-0000-7000-8000-000000000005', '01950000-0000-7000-8000-000000000001', 'public', 'これは折り返しと省略表示の幅バグを検証するための非常に長いタイトルのノートでありタイトルがカードやヘッダーの横幅を突き破らないことヘッダーの一覧詳細の各レイアウトで適切に省略または折り返しされることを確認するためのサンプルですテストキーワードも含む', 'これは幅バグ検証用の非常に長い本文を持つ公開ノートです。タイトルが極端に長い場合に、一覧カードと詳細ヘッダーの両方でタイトルが横幅を突き破らず、適切に折り返しまたは省略されることを確認します。テストというキーワードを含むので検索で確実にヒットします。本文も長くして、スニペットの行数clamp、長い段落の折り返し、word-break の挙動を検証します。デザインとテストの観点を両方含めた内容です。', '["design","test"]', '', '2024-02-05', '2024-02-05T00:00:00.000Z', '2024-02-05T00:00:00.000Z');
INSERT INTO note_tags (note_id, tag_id)
  SELECT '01950621-0000-7000-8000-000000000005', id FROM tags
  WHERE owner_id='01950000-0000-7000-8000-000000000001' AND name_normalized IN ('design','test');

-- ===========================================================================
-- ノート6: 長いタイトル + 長い本文（英語主体で word-break 検証 / guide タグ）
-- ===========================================================================
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  source_file_id, version
) VALUES (
  '01950621-0000-7000-8000-000000000006',
  '01950000-0000-7000-8000-000000000001',
  '01950542-0000-7000-8000-000000000010',
  'note-width-long-title-english',
  'A Very Long English Title That Should Wrap Or Truncate Gracefully Across The List Card And The Detail Header Without Breaking The Layout Width On Narrow And Wide Viewports — テスト',
  '<p>This is a long-body public note written mostly in English so that line-wrapping and truncation behaviour can be checked against latin text rather than CJK. The keyword テスト is embedded so the Japanese search query still matches this note in /search.</p><p>The body deliberately contains a single extremely long unbroken token like supercalifragilisticexpialidociousnessandmorelettersthatkeepgoingwithoutanyspacesatallhere to force the layout to apply overflow-wrap or break-word handling. If that token escapes the content column, the width bug is reproduced.</p><p>Additional paragraphs continue to provide enough vertical content to verify scrolling, spacing, and that the long title above does not push the header beyond the viewport on either narrow mobile widths or wide desktop widths.</p>',
  '{}',
  'active', NULL, '2024-02-06T00:00:00.000Z', '2024-02-06T00:00:00.000Z',
  NULL, NULL, NULL, NULL, 0
);
INSERT INTO publication_states (note_id, owner_id, visibility, published_at, updated_at, version) VALUES
  ('01950621-0000-7000-8000-000000000006', '01950000-0000-7000-8000-000000000001', 'public', '2024-02-06T00:00:00.000Z', '2024-02-06T00:00:00.000Z', 0);
INSERT INTO search_documents (note_id, owner_id, visibility, title, body_plain, tag_names_json, directory_path, date_for_calendar, updated_at, indexed_at) VALUES
  ('01950621-0000-7000-8000-000000000006', '01950000-0000-7000-8000-000000000001', 'public', 'A Very Long English Title That Should Wrap Or Truncate Gracefully Across The List Card And The Detail Header Without Breaking The Layout Width On Narrow And Wide Viewports — テスト', 'This is a long-body public note written mostly in English so that line-wrapping and truncation behaviour can be checked against latin text rather than CJK. The keyword テスト is embedded so the Japanese search query still matches this note. The body deliberately contains a single extremely long unbroken token to force the layout to apply overflow-wrap or break-word handling.', '["guide"]', '', '2024-02-06', '2024-02-06T00:00:00.000Z', '2024-02-06T00:00:00.000Z');
INSERT INTO note_tags (note_id, tag_id)
  SELECT '01950621-0000-7000-8000-000000000006', id FROM tags
  WHERE owner_id='01950000-0000-7000-8000-000000000001' AND name_normalized='guide';

-- ===========================================================================
-- ノート7: 長いタイトル + 長い本文（CJK 連続文字で trigram 部分一致確認）
-- ===========================================================================
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  source_file_id, version
) VALUES (
  '01950621-0000-7000-8000-000000000007',
  '01950000-0000-7000-8000-000000000001',
  '01950542-0000-7000-8000-000000000010',
  'note-width-long-body-cjk',
  '長い本文と日本語の連続文字によるトリグラム部分一致検証用の公開ノートでありデザインというキーワードを含むタイトルです',
  '<p>このノートは日本語の連続した文章で構成された長い本文を持ちます。trigram トークナイザーにより「デザイン」のような部分文字列が「デザイン原則」「デザインメモ」などにヒットすることを確認するためのものです。テストとデザインの両方のキーワードを本文に含めています。</p><p>段落を重ねて十分な長さを確保します。句読点や改行をまたいだ検索、長い一文の折り返し、ノート詳細ページでの本文の読みやすさを目視で確認できるようにしています。公開トップの一覧カードでは、このノートのタイトルと抜粋が崩れずに表示されることを確認します。</p>',
  '{}',
  'active', NULL, '2024-02-07T00:00:00.000Z', '2024-02-07T00:00:00.000Z',
  NULL, NULL, NULL, NULL, 0
);
INSERT INTO publication_states (note_id, owner_id, visibility, published_at, updated_at, version) VALUES
  ('01950621-0000-7000-8000-000000000007', '01950000-0000-7000-8000-000000000001', 'public', '2024-02-07T00:00:00.000Z', '2024-02-07T00:00:00.000Z', 0);
INSERT INTO search_documents (note_id, owner_id, visibility, title, body_plain, tag_names_json, directory_path, date_for_calendar, updated_at, indexed_at) VALUES
  ('01950621-0000-7000-8000-000000000007', '01950000-0000-7000-8000-000000000001', 'public', '長い本文と日本語の連続文字によるトリグラム部分一致検証用の公開ノートでありデザインというキーワードを含むタイトルです', 'このノートは日本語の連続した文章で構成された長い本文を持ちます。trigram トークナイザーにより「デザイン」のような部分文字列が「デザイン原則」「デザインメモ」などにヒットすることを確認するためのものです。テストとデザインの両方のキーワードを本文に含めています。段落を重ねて十分な長さを確保します。', '["design"]', '', '2024-02-07', '2024-02-07T00:00:00.000Z', '2024-02-07T00:00:00.000Z');
INSERT INTO note_tags (note_id, tag_id)
  SELECT '01950621-0000-7000-8000-000000000007', id FROM tags
  WHERE owner_id='01950000-0000-7000-8000-000000000001' AND name_normalized='design';
