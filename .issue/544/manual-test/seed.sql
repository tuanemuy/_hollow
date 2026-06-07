-- ===========================================================================
-- Issue #544 ブラウザ検証用シード（領域5 公開・共有面 P30/P31/P32/P33）
--
-- 投入対象: dev-admin (USER_ID 01950000-0000-7000-8000-000000000001) 所有の
--   - 公開ノート 2件（検索ヒット用。本文が長い1件 + 短い1件）
--   - 共有リンク 3件（パスワード付き有効 / 失効 / 「期限切れ=gone」）
--
-- 冪等性: 固定テストID (……000020-000032) を DELETE してから INSERT する。
--   既存ユーザー / 既存ノート / dev-admin の他データには触れない。
--
-- ハッシュ値はプロジェクトの scrypt / token モジュールと同一形式で生成済み。
--   - 共有リンク token は SHA-256(base64url, no padding) を token_hash に格納
--   - パスワードは scrypt エンコード文字列を password_hash に格納（平文 test1234）
-- ===========================================================================

-- --- 既存テストデータの掃除（FK 子から順に） ---------------------------------
DELETE FROM share_links WHERE id IN (
  '01950000-0000-7000-8000-000000000030',
  '01950000-0000-7000-8000-000000000031',
  '01950000-0000-7000-8000-000000000032'
);
DELETE FROM search_documents WHERE note_id IN (
  '01950000-0000-7000-8000-000000000020',
  '01950000-0000-7000-8000-000000000021'
);
DELETE FROM publication_states WHERE note_id IN (
  '01950000-0000-7000-8000-000000000020',
  '01950000-0000-7000-8000-000000000021'
);
DELETE FROM notes WHERE id IN (
  '01950000-0000-7000-8000-000000000020',
  '01950000-0000-7000-8000-000000000021'
);

-- --- 公開ノート1: 本文が長い（スニペット 2 行 clamp 確認用） -----------------
-- directory_id は dev-admin のルートディレクトリ（既存）を流用。
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  source_file_id, version
) VALUES (
  '01950000-0000-7000-8000-000000000020',
  '01950000-0000-7000-8000-000000000001',
  '019e9546-cb23-73c9-849c-120384e56377',
  'issue-544-long-public',
  'Issue 544 検証用 公開ノート（本文長め）',
  '<p>これは Issue 544 の動作確認用の公開ノートです。検索結果スニペットが2行でclampされることを確認するために、本文を意図的に長くしています。テストというキーワードを本文中に含めているので、/search?q=テスト で確実にヒットします。さらに行が増えるよう説明を続けます。スニペットは leading-relaxed の行間で、最大2行を超えた分は省略記号で切り詰められるはずです。三行目以降のこの文章は表示上カットされます。テスト用のダミー本文をもう少し追記して十分な長さを確保します。</p>',
  '{}',
  'active', NULL, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z',
  NULL, NULL, NULL, NULL, 0
);
INSERT INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '01950000-0000-7000-8000-000000000020',
  '01950000-0000-7000-8000-000000000001',
  'public', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z', 0
);
INSERT INTO search_documents (
  note_id, owner_id, visibility, title, body_plain, tag_names_json,
  directory_path, date_for_calendar, updated_at, indexed_at
) VALUES (
  '01950000-0000-7000-8000-000000000020',
  '01950000-0000-7000-8000-000000000001',
  'public',
  'Issue 544 検証用 公開ノート（本文長め）',
  'これは Issue 544 の動作確認用の公開ノートです。検索結果スニペットが2行でclampされることを確認するために、本文を意図的に長くしています。テストというキーワードを本文中に含めているので、検索で確実にヒットします。さらに行が増えるよう説明を続けます。スニペットは leading-relaxed の行間で、最大2行を超えた分は省略記号で切り詰められるはずです。三行目以降のこの文章は表示上カットされます。テスト用のダミー本文をもう少し追記して十分な長さを確保します。',
  '[]', '', '2024-01-01', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'
);

-- --- 公開ノート2: 本文が短い（clamp が悪さしない確認用） ---------------------
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  source_file_id, version
) VALUES (
  '01950000-0000-7000-8000-000000000021',
  '01950000-0000-7000-8000-000000000001',
  '019e9546-cb23-73c9-849c-120384e56377',
  'issue-544-short-public',
  'Issue 544 検証用 公開ノート（本文短め）',
  '<p>短いテスト本文。</p>',
  '{}',
  'active', NULL, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z',
  NULL, NULL, NULL, NULL, 0
);
INSERT INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '01950000-0000-7000-8000-000000000021',
  '01950000-0000-7000-8000-000000000001',
  'public', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z', 0
);
INSERT INTO search_documents (
  note_id, owner_id, visibility, title, body_plain, tag_names_json,
  directory_path, date_for_calendar, updated_at, indexed_at
) VALUES (
  '01950000-0000-7000-8000-000000000021',
  '01950000-0000-7000-8000-000000000001',
  'public',
  'Issue 544 検証用 公開ノート（本文短め）',
  '短いテスト本文。',
  '[]', '', '2024-01-01', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'
);

-- --- 共有リンク(a): パスワード付き・有効（STATE1 ゲート / 不一致 / ロックアウト用）
-- token       = test-share-passworded-0001
-- token_hash  = SHA-256(base64url) → 下記
-- password    = test1234 （scrypt エンコード文字列）
INSERT INTO share_links (
  id, note_id, owner_id, token_hash, password_hash, status,
  failed_attempts, locked_until, created_at, revoked_at, last_accessed_at,
  updated_at, version
) VALUES (
  '01950000-0000-7000-8000-000000000030',
  '01950000-0000-7000-8000-000000000020',
  '01950000-0000-7000-8000-000000000001',
  'xPXDpuKw5Jbw6vVYBf93uHu6tp6TCoR9TtDgoE1RCUU',
  '$scrypt$ln=16,r=8,p=1$Y+reUD4IE4VFfpoBIowkVA==$870lQcrrgR7QExJ6TBiyYlnOK8xKSZOoCY0DaownSwrKkExHha5+5a/+1XVGQhhAFB7NZ2sx5bbYVZVTPwYsIg==',
  'active', 0, NULL, '2024-01-01T00:00:00.000Z', NULL, NULL,
  '2024-01-01T00:00:00.000Z', 0
);

-- --- 共有リンク(b): 失効（revoked）（STATE3「トップへ戻る」CTA 確認用） --------
-- token = test-share-revoked-0002
INSERT INTO share_links (
  id, note_id, owner_id, token_hash, password_hash, status,
  failed_attempts, locked_until, created_at, revoked_at, last_accessed_at,
  updated_at, version
) VALUES (
  '01950000-0000-7000-8000-000000000031',
  '01950000-0000-7000-8000-000000000020',
  '01950000-0000-7000-8000-000000000001',
  '3mPqs-quh-ucOpuN-1X0uVgHZ2WOiFXGrvhRFLYFcWY',
  NULL,
  'revoked', 0, NULL, '2024-01-01T00:00:00.000Z',
  '2024-01-02T00:00:00.000Z', NULL,
  '2024-01-02T00:00:00.000Z', 1
);

-- --- 共有リンク(c): 「期限切れ/gone」（STATE3 確認用 / 別経路） ----------------
-- スキーマ上「expired（時限失効）」状態は存在しない（locked_until 以外に
-- 期限フィールドが無く、status は active/revoked のみ）。UI の STATE3
-- (isExpiredOrGone) は revoked か notFound で発火する。(b) と区別した
-- 「gone」サンプルとして、これも revoked で1件用意する（token を変える）。
-- token = test-share-expired-gone-0003
INSERT INTO share_links (
  id, note_id, owner_id, token_hash, password_hash, status,
  failed_attempts, locked_until, created_at, revoked_at, last_accessed_at,
  updated_at, version
) VALUES (
  '01950000-0000-7000-8000-000000000032',
  '01950000-0000-7000-8000-000000000020',
  '01950000-0000-7000-8000-000000000001',
  'un-p7ugFmcgOV6JieWDYPLfJeC9gNFt6hXGuSkhVjTQ',
  NULL,
  'revoked', 0, NULL, '2024-01-01T00:00:00.000Z',
  '2024-01-02T00:00:00.000Z', NULL,
  '2024-01-02T00:00:00.000Z', 1
);
