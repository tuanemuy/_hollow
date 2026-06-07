-- Manual-test seed for Issue #542 (領域3: ゴミ箱 / タグ管理 / 公開設定 のモック追従)
--
-- All test data is OWNED BY THE DEV ADMIN user seeded by `pnpm seed:dev-admin`
-- (user id 01950000-0000-7000-8000-000000000001), so logging in as
-- dev-admin@example.com immediately exposes this data on /trash, /tags and the
-- publish-settings modal.
--
-- New rows use the id prefix 01950542-... so cleanup never touches non-test
-- data. Run after `pnpm db:apply:local` and `pnpm seed:dev-admin`.
--
-- Idempotent: child rows are deleted first, then re-inserted.

PRAGMA foreign_keys = ON;

-- ---- Idempotent cleanup (child rows first; only mt542-owned data) ----
DELETE FROM share_links WHERE id IN (
  '01950542-0000-7000-8000-000000000060',
  '01950542-0000-7000-8000-000000000061',
  '01950542-0000-7000-8000-000000000062'
);
DELETE FROM note_tags WHERE note_id IN (
  '01950542-0000-7000-8000-000000000030',
  '01950542-0000-7000-8000-000000000031',
  '01950542-0000-7000-8000-000000000032',
  '01950542-0000-7000-8000-000000000033',
  '01950542-0000-7000-8000-000000000034',
  '01950542-0000-7000-8000-000000000035',
  '01950542-0000-7000-8000-000000000036',
  '01950542-0000-7000-8000-000000000037',
  '01950542-0000-7000-8000-000000000038'
);
DELETE FROM publication_states WHERE note_id IN (
  '01950542-0000-7000-8000-000000000030',
  '01950542-0000-7000-8000-000000000031',
  '01950542-0000-7000-8000-000000000032',
  '01950542-0000-7000-8000-000000000033',
  '01950542-0000-7000-8000-000000000034',
  '01950542-0000-7000-8000-000000000035',
  '01950542-0000-7000-8000-000000000036',
  '01950542-0000-7000-8000-000000000037',
  '01950542-0000-7000-8000-000000000038'
);
DELETE FROM notes WHERE id IN (
  '01950542-0000-7000-8000-000000000030',
  '01950542-0000-7000-8000-000000000031',
  '01950542-0000-7000-8000-000000000032',
  '01950542-0000-7000-8000-000000000033',
  '01950542-0000-7000-8000-000000000034',
  '01950542-0000-7000-8000-000000000035',
  '01950542-0000-7000-8000-000000000036',
  '01950542-0000-7000-8000-000000000037',
  '01950542-0000-7000-8000-000000000038'
);
DELETE FROM tags WHERE id IN (
  '01950542-0000-7000-8000-000000000020',
  '01950542-0000-7000-8000-000000000021',
  '01950542-0000-7000-8000-000000000022',
  '01950542-0000-7000-8000-000000000023',
  '01950542-0000-7000-8000-000000000024',
  '01950542-0000-7000-8000-000000000025'
);
DELETE FROM directories WHERE id IN (
  '01950542-0000-7000-8000-000000000012',
  '01950542-0000-7000-8000-000000000011'
);
DELETE FROM directories WHERE id = '01950542-0000-7000-8000-000000000010';

-- ---- Directories (root + hierarchy) ----
-- The dev-admin seed does not create directories, so create them here.
-- Root: name='' slug='' depth=0 parent_id=NULL (matches DirectoryService.ensureRoot).
INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at)
VALUES ('01950542-0000-7000-8000-000000000010', '01950000-0000-7000-8000-000000000001', NULL, '', '', 0, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');
INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at)
VALUES ('01950542-0000-7000-8000-000000000011', '01950000-0000-7000-8000-000000000001', '01950542-0000-7000-8000-000000000010', 'Notes', 'notes', 1, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');
INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at)
VALUES ('01950542-0000-7000-8000-000000000012', '01950000-0000-7000-8000-000000000001', '01950542-0000-7000-8000-000000000010', 'Archive', 'archive', 1, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');

-- ---- Tags (varied note counts: 4 / 2 / 1 / 1 / 0) ----
-- tag-frontend  (20): 4 notes  -> high count
-- tag-design    (21): 2 notes
-- tag-bug       (22): 1 note
-- tag-archived  (23): 1 note   (attached to a trashed note; still counts via note_tags)
-- tag-unused    (24): 0 notes  -> zero-count tag (still has merge candidates, since other tags exist)
-- tag-llm       (25): 2 notes
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950542-0000-7000-8000-000000000020', '01950000-0000-7000-8000-000000000001', 'frontend', 'frontend', 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950542-0000-7000-8000-000000000021', '01950000-0000-7000-8000-000000000001', 'design', 'design', 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950542-0000-7000-8000-000000000022', '01950000-0000-7000-8000-000000000001', 'bug', 'bug', 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950542-0000-7000-8000-000000000023', '01950000-0000-7000-8000-000000000001', 'archived', 'archived', 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950542-0000-7000-8000-000000000024', '01950000-0000-7000-8000-000000000001', 'unused', 'unused', 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950542-0000-7000-8000-000000000025', '01950000-0000-7000-8000-000000000001', 'llm', 'llm', 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');

-- ---- Active notes (for tags + publish settings) ----
-- 30: public, multi-tag
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at, edit_lock_user_id,
  edit_lock_acquired_at, edit_lock_expires_at, version, source_file_id
) VALUES (
  '01950542-0000-7000-8000-000000000030', '01950000-0000-7000-8000-000000000001', '01950542-0000-7000-8000-000000000011', 'mt542-public-roadmap', '[MT542] 公開ロードマップ',
  '<p>このノートは <strong>公開</strong> 設定の検証用です。公開時の URL プレビューを確認してください。</p>', '{}',
  'active', NULL, '2026-05-01T00:00:00.000Z', '2026-05-20T10:00:00.000Z', NULL,
  NULL, NULL, 0, NULL
);
-- 31: unlisted, has 2 share links (one accessed, one not)
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at, edit_lock_user_id,
  edit_lock_acquired_at, edit_lock_expires_at, version, source_file_id
) VALUES (
  '01950542-0000-7000-8000-000000000031', '01950000-0000-7000-8000-000000000001', '01950542-0000-7000-8000-000000000011', 'mt542-unlisted-share', '[MT542] 限定公開リンク検証ノート',
  '<p>このノートは <strong>限定公開</strong> で、共有リンクを 2 本発行済みです。1 本は最終アクセスあり、1 本は未アクセスです。</p>', '{}',
  'active', NULL, '2026-05-02T00:00:00.000Z', '2026-05-21T11:00:00.000Z', NULL,
  NULL, NULL, 0, NULL
);
-- 32: private
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at, edit_lock_user_id,
  edit_lock_acquired_at, edit_lock_expires_at, version, source_file_id
) VALUES (
  '01950542-0000-7000-8000-000000000032', '01950000-0000-7000-8000-000000000001', '01950542-0000-7000-8000-000000000011', 'mt542-private-draft', '[MT542] 非公開の下書き',
  '<p>このノートは <strong>非公開</strong> です。公開設定モーダルで非公開ラジオが選択済みになっていることを確認してください。</p>', '{}',
  'active', NULL, '2026-05-03T00:00:00.000Z', '2026-05-22T09:00:00.000Z', NULL,
  NULL, NULL, 0, NULL
);
-- 33: active, tag-heavy (frontend + design + llm)
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at, edit_lock_user_id,
  edit_lock_acquired_at, edit_lock_expires_at, version, source_file_id
) VALUES (
  '01950542-0000-7000-8000-000000000033', '01950000-0000-7000-8000-000000000001', '01950542-0000-7000-8000-000000000011', 'mt542-tagged-a', '[MT542] タグ付きノート A',
  '<p>frontend / design / llm タグが付いています。</p>', '{}',
  'active', NULL, '2026-05-04T00:00:00.000Z', '2026-05-23T09:00:00.000Z', NULL,
  NULL, NULL, 0, NULL
);
-- 34: active, frontend + bug
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at, edit_lock_user_id,
  edit_lock_acquired_at, edit_lock_expires_at, version, source_file_id
) VALUES (
  '01950542-0000-7000-8000-000000000034', '01950000-0000-7000-8000-000000000001', '01950542-0000-7000-8000-000000000011', 'mt542-tagged-b', '[MT542] タグ付きノート B',
  '<p>frontend / bug タグが付いています。</p>', '{}',
  'active', NULL, '2026-05-05T00:00:00.000Z', '2026-05-24T09:00:00.000Z', NULL,
  NULL, NULL, 0, NULL
);

-- ---- Trashed notes (P17 ゴミ箱) ----
-- status='trashed' + trashed_at set. Varied titles (one very long), varied
-- content (drives the excerpt), varied trashed_at (削除日 differs per row).
-- 35: short title, recent trash
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at, edit_lock_user_id,
  edit_lock_acquired_at, edit_lock_expires_at, version, source_file_id
) VALUES (
  '01950542-0000-7000-8000-000000000035', '01950000-0000-7000-8000-000000000001', '01950542-0000-7000-8000-000000000011', 'mt542-trash-short', '[MT542] 古いメモ',
  '<p>もう使わなくなった短いメモ。完全削除の確認ダイアログで対象名がこのタイトルになることを確認します。</p>', '{}',
  'trashed', '2026-06-05T12:00:00.000Z', '2026-04-01T00:00:00.000Z', '2026-06-05T12:00:00.000Z', NULL,
  NULL, NULL, 0, NULL
);
-- 36: long title + long excerpt, older trash date
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at, edit_lock_user_id,
  edit_lock_acquired_at, edit_lock_expires_at, version, source_file_id
) VALUES (
  '01950542-0000-7000-8000-000000000036', '01950000-0000-7000-8000-000000000001', '01950542-0000-7000-8000-000000000011', 'mt542-trash-long', '[MT542] とても長いタイトルのノート — レイアウトが崩れないか・省略表示やラップが正しく効くかをゴミ箱一覧で検証するためのサンプル',
  '<p>長めの抜粋テキストです。ゴミ箱一覧のカードでタイトルと抜粋がどのように折り返されるか、削除日と並んで破綻しないかを確認します。十分な長さを確保するためにダミー文をもう少し続けます。これで抜粋の省略・折り返しの挙動が分かります。</p>', '{}',
  'trashed', '2026-06-01T08:30:00.000Z', '2026-03-15T00:00:00.000Z', '2026-06-01T08:30:00.000Z', NULL,
  NULL, NULL, 0, NULL
);
-- 37: medium title, oldest trash date (different 削除日)
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at, edit_lock_user_id,
  edit_lock_acquired_at, edit_lock_expires_at, version, source_file_id
) VALUES (
  '01950542-0000-7000-8000-000000000037', '01950000-0000-7000-8000-000000000001', '01950542-0000-7000-8000-000000000012', 'mt542-trash-spec', '[MT542] 廃止した仕様メモ',
  '<p>古い仕様のメモ。復元（回帰確認）の対象としても使えます。</p>', '{}',
  'trashed', '2026-05-10T15:45:00.000Z', '2026-02-20T00:00:00.000Z', '2026-05-10T15:45:00.000Z', NULL,
  NULL, NULL, 0, NULL
);
-- 38: trashed note with the 'archived' tag (so tag-archived has count 1)
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at, edit_lock_user_id,
  edit_lock_acquired_at, edit_lock_expires_at, version, source_file_id
) VALUES (
  '01950542-0000-7000-8000-000000000038', '01950000-0000-7000-8000-000000000001', '01950542-0000-7000-8000-000000000012', 'mt542-trash-tagged', '[MT542] アーカイブ済みノート',
  '<p>archived タグの付いたゴミ箱ノート。</p>', '{}',
  'trashed', '2026-05-28T18:00:00.000Z', '2026-02-25T00:00:00.000Z', '2026-05-28T18:00:00.000Z', NULL,
  NULL, NULL, 0, NULL
);

-- ---- Note tags ----
-- frontend (20): notes 30, 33, 34  + (also 31 for a 4th) => 4 notes
INSERT INTO note_tags (note_id, tag_id) VALUES ('01950542-0000-7000-8000-000000000030', '01950542-0000-7000-8000-000000000020');
INSERT INTO note_tags (note_id, tag_id) VALUES ('01950542-0000-7000-8000-000000000033', '01950542-0000-7000-8000-000000000020');
INSERT INTO note_tags (note_id, tag_id) VALUES ('01950542-0000-7000-8000-000000000034', '01950542-0000-7000-8000-000000000020');
INSERT INTO note_tags (note_id, tag_id) VALUES ('01950542-0000-7000-8000-000000000031', '01950542-0000-7000-8000-000000000020');
-- design (21): notes 30, 33 => 2 notes
INSERT INTO note_tags (note_id, tag_id) VALUES ('01950542-0000-7000-8000-000000000030', '01950542-0000-7000-8000-000000000021');
INSERT INTO note_tags (note_id, tag_id) VALUES ('01950542-0000-7000-8000-000000000033', '01950542-0000-7000-8000-000000000021');
-- bug (22): note 34 => 1 note
INSERT INTO note_tags (note_id, tag_id) VALUES ('01950542-0000-7000-8000-000000000034', '01950542-0000-7000-8000-000000000022');
-- archived (23): trashed note 38 => 1 note
INSERT INTO note_tags (note_id, tag_id) VALUES ('01950542-0000-7000-8000-000000000038', '01950542-0000-7000-8000-000000000023');
-- llm (25): notes 33, 31 => 2 notes
INSERT INTO note_tags (note_id, tag_id) VALUES ('01950542-0000-7000-8000-000000000033', '01950542-0000-7000-8000-000000000025');
INSERT INTO note_tags (note_id, tag_id) VALUES ('01950542-0000-7000-8000-000000000031', '01950542-0000-7000-8000-000000000025');
-- unused (24): no note_tags => 0 notes

-- ---- Publication states (mixed visibility) ----
INSERT INTO publication_states (note_id, owner_id, visibility, published_at, updated_at, version)
VALUES ('01950542-0000-7000-8000-000000000030', '01950000-0000-7000-8000-000000000001', 'public', '2026-05-20T10:00:00.000Z', '2026-05-20T10:00:00.000Z', 0);
INSERT INTO publication_states (note_id, owner_id, visibility, published_at, updated_at, version)
VALUES ('01950542-0000-7000-8000-000000000031', '01950000-0000-7000-8000-000000000001', 'unlisted', '2026-05-21T11:00:00.000Z', '2026-05-21T11:00:00.000Z', 0);
INSERT INTO publication_states (note_id, owner_id, visibility, published_at, updated_at, version)
VALUES ('01950542-0000-7000-8000-000000000032', '01950000-0000-7000-8000-000000000001', 'private', NULL, '2026-05-22T09:00:00.000Z', 0);
INSERT INTO publication_states (note_id, owner_id, visibility, published_at, updated_at, version)
VALUES ('01950542-0000-7000-8000-000000000033', '01950000-0000-7000-8000-000000000001', 'private', NULL, '2026-05-23T09:00:00.000Z', 0);
INSERT INTO publication_states (note_id, owner_id, visibility, published_at, updated_at, version)
VALUES ('01950542-0000-7000-8000-000000000034', '01950000-0000-7000-8000-000000000001', 'public', '2026-05-24T09:00:00.000Z', '2026-05-24T09:00:00.000Z', 0);

-- ---- Share links (P14 限定公開リンク) ----
-- Both for note 31 (unlisted). token_hash is opaque & only needs to be unique:
-- the owner-facing DTO materialises the URL from the link id, not the token.
-- 60: active, last_accessed_at NON-NULL  (最終アクセス表示あり)
INSERT INTO share_links (
  id, note_id, owner_id, token_hash, password_hash, status, failed_attempts,
  locked_until, created_at, revoked_at, last_accessed_at, updated_at, version
) VALUES (
  '01950542-0000-7000-8000-000000000060', '01950542-0000-7000-8000-000000000031', '01950000-0000-7000-8000-000000000001',
  'mt542-tokenhash-accessed-0000000000000000000000', NULL, 'active', 0,
  NULL, '2026-05-21T11:05:00.000Z', NULL, '2026-06-04T16:20:00.000Z', '2026-06-04T16:20:00.000Z', 0
);
-- 61: active, last_accessed_at NULL  (未アクセス: 最終アクセス非表示)
INSERT INTO share_links (
  id, note_id, owner_id, token_hash, password_hash, status, failed_attempts,
  locked_until, created_at, revoked_at, last_accessed_at, updated_at, version
) VALUES (
  '01950542-0000-7000-8000-000000000061', '01950542-0000-7000-8000-000000000031', '01950000-0000-7000-8000-000000000001',
  'mt542-tokenhash-unaccessed-000000000000000000', NULL, 'active', 0,
  NULL, '2026-05-21T11:06:00.000Z', NULL, NULL, '2026-05-21T11:06:00.000Z', 0
);
