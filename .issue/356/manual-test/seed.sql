-- Issue #356 manual-test seed
--
-- P11 ノート詳細レイアウト再構成の検証用データ。
-- Owner: existing-user (existing@example.com / Password123!)
--   user id     : 01938f00-0000-7000-8000-0000000000a1
--   root dir id : 01938f00-0000-7000-8000-0000000000a3
--   nested dir  : Bar (01938f02-0000-7000-8000-000000000002)
--                  └ Child1Renamed (019e6e06-f2ad-768e-bea1-2dfec4149d5d)
--
-- すべて INSERT OR IGNORE / OR REPLACE で再実行安全。
--
-- 検証用ノート:
--   note-A (356a) : Bar/Child1Renamed 配下, public + published_at, tags 付き,
--                   note-B から参照される（バックリンクあり）
--   note-B (356b) : Bar 配下, unlisted, note-A を内部リンクで参照
--   note-C (356c) : root 直下, publication_states 無し(=private), 長いタイトル
--   note-D (356d) : Bar 配下, trashed

-- ---- note-A : nested / public / tags / backlinked ----
INSERT OR REPLACE INTO notes (
  id, owner_id, directory_id, slug, title,
  content_html, front_matter_json, status, trashed_at,
  created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version
) VALUES (
  '01938f56-0000-7000-8000-00000000035a',
  '01938f00-0000-7000-8000-0000000000a1',
  '019e6e06-f2ad-768e-bea1-2dfec4149d5d',
  'issue-356-note-a',
  'Issue 356 検証ノートA（公開・ネスト・バックリンクあり）',
  '<p>これは Issue #356 の検証用ノート A です。本文はパンくず・タイトル・アクションの下にすぐ表示されるべきです。</p>',
  '{}', 'active', NULL,
  '2026-05-10T00:00:00.000Z', '2026-05-20T14:32:00.000Z',
  NULL, NULL, NULL, 0
);

INSERT OR REPLACE INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at
) VALUES (
  '01938f56-0000-7000-8000-00000000035a',
  '01938f00-0000-7000-8000-0000000000a1',
  'public', '2026-05-20T10:00:00.000Z', '2026-05-20T10:00:00.000Z'
);

-- tags for note-A
INSERT OR IGNORE INTO tags (id, owner_id, name, name_normalized, note_count, version, created_at, updated_at)
VALUES ('01938f56-0000-7000-8000-0000000000f1','01938f00-0000-7000-8000-0000000000a1','design','design',1,0,'2026-05-10T00:00:00.000Z','2026-05-10T00:00:00.000Z');
INSERT OR IGNORE INTO tags (id, owner_id, name, name_normalized, note_count, version, created_at, updated_at)
VALUES ('01938f56-0000-7000-8000-0000000000f2','01938f00-0000-7000-8000-0000000000a1','essay','essay',1,0,'2026-05-10T00:00:00.000Z','2026-05-10T00:00:00.000Z');
INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES ('01938f56-0000-7000-8000-00000000035a','01938f56-0000-7000-8000-0000000000f1');
INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES ('01938f56-0000-7000-8000-00000000035a','01938f56-0000-7000-8000-0000000000f2');

-- ---- note-B : Bar / unlisted / references note-A ----
INSERT OR REPLACE INTO notes (
  id, owner_id, directory_id, slug, title,
  content_html, front_matter_json, status, trashed_at,
  created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version
) VALUES (
  '01938f56-0000-7000-8000-00000000035b',
  '01938f00-0000-7000-8000-0000000000a1',
  '01938f02-0000-7000-8000-000000000002',
  'issue-356-note-b',
  'Issue 356 検証ノートB（限定公開・Aを参照）',
  '<p>このノートは <a href="#">検証ノートA</a> を参照しています。</p>',
  '{}', 'active', NULL,
  '2026-05-11T00:00:00.000Z', '2026-05-21T09:00:00.000Z',
  NULL, NULL, NULL, 0
);

INSERT OR REPLACE INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at
) VALUES (
  '01938f56-0000-7000-8000-00000000035b',
  '01938f00-0000-7000-8000-0000000000a1',
  'unlisted', NULL, '2026-05-21T09:00:00.000Z'
);

-- internal link B -> A (resolved), gives note-A a backlink from note-B
INSERT OR REPLACE INTO note_internal_links (
  id, from_note_id, ref_kind, ref_target, display_text, resolved_note_id
) VALUES (
  '01938f56-0000-7000-8000-0000000000l1',
  '01938f56-0000-7000-8000-00000000035b',
  'title', 'Issue 356 検証ノートA（公開・ネスト・バックリンクあり）', '検証ノートA',
  '01938f56-0000-7000-8000-00000000035a'
);

-- ---- note-C : root level / private(no pub row) / long title ----
INSERT OR REPLACE INTO notes (
  id, owner_id, directory_id, slug, title,
  content_html, front_matter_json, status, trashed_at,
  created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version
) VALUES (
  '01938f56-0000-7000-8000-00000000035c',
  '01938f00-0000-7000-8000-0000000000a1',
  '01938f00-0000-7000-8000-0000000000a3',
  'issue-356-note-c',
  'Issue 356 検証ノートC ルート直下に置かれた非常に長いタイトルで折返し挙動とパンくずのフォールバックを同時に確認するためのサンプルノートです',
  '<p>ルート直下のノート。パンくずは「すべてのノート › タイトル」のみで葉リンクは出ないはずです。</p>',
  '{}', 'active', NULL,
  '2026-05-12T00:00:00.000Z', '2026-05-22T11:11:00.000Z',
  NULL, NULL, NULL, 0
);

-- ---- note-D : Bar / trashed ----
INSERT OR REPLACE INTO notes (
  id, owner_id, directory_id, slug, title,
  content_html, front_matter_json, status, trashed_at,
  created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version
) VALUES (
  '01938f56-0000-7000-8000-00000000035d',
  '01938f00-0000-7000-8000-0000000000a1',
  '01938f02-0000-7000-8000-000000000002',
  'issue-356-note-d',
  'Issue 356 検証ノートD（ゴミ箱）',
  '<p>ゴミ箱に入った検証用ノート。上部は「ゴミ箱を開く」のみのはずです。</p>',
  '{}', 'trashed', '2026-05-23T00:00:00.000Z',
  '2026-05-13T00:00:00.000Z', '2026-05-23T00:00:00.000Z',
  NULL, NULL, NULL, 0
);
