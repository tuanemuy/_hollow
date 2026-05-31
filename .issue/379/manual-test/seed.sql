-- Issue #379 manual-test seed
--
-- ゴミ箱(trashed)ノート詳細ページがエラー境界に落ちるバグの検証用データ。
-- Owner: existing-user (existing@example.com / Password123!)
--   user id     : 01938f00-0000-7000-8000-0000000000a1
--   root dir id : 01938f00-0000-7000-8000-0000000000a3
--
-- すべて INSERT OR REPLACE で再実行安全。
--
-- 検証用ノート:
--   note-T1 (379t1): root 直下, trashed, publication=private（trash 後の通常状態）
--   note-T2 (379t2): root 直下, trashed だが publication=public + active share_link が残存
--                    （trash イベント未処理＝eventual-consistency エッジ。listShareLinks は
--                     status!=active で throw するため、修正後はフォールバックで描画されるべき）
--   note-A1 (379a1): root 直下, active, public + published_at（既存ホットパスの維持確認）

-- ---- note-T1 : trashed / private ----
INSERT OR REPLACE INTO notes (
  id, owner_id, directory_id, slug, title,
  content_html, front_matter_json, status, trashed_at,
  created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version
) VALUES (
  '019e7900-0000-7000-8000-0000000379a1',
  '01938f00-0000-7000-8000-0000000000a1',
  '01938f00-0000-7000-8000-0000000000a3',
  'issue-379-trashed-private',
  'Issue 379 検証ノートT1（ゴミ箱・非公開）',
  '<p>これは Issue #379 の検証用ゴミ箱ノート T1 の本文です。trashed でもこの本文が表示されるべきです。</p>',
  '{}', 'trashed', '2026-05-23T00:00:00.000Z',
  '2026-05-10T00:00:00.000Z', '2026-05-23T00:00:00.000Z',
  NULL, NULL, NULL, 1
);
INSERT OR REPLACE INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '019e7900-0000-7000-8000-0000000379a1',
  '01938f00-0000-7000-8000-0000000000a1',
  'private', NULL, '2026-05-23T00:00:00.000Z', 1
);

-- ---- note-T2 : trashed but publication still public + lingering active share_link ----
INSERT OR REPLACE INTO notes (
  id, owner_id, directory_id, slug, title,
  content_html, front_matter_json, status, trashed_at,
  created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version
) VALUES (
  '019e7900-0000-7000-8000-0000000379a2',
  '01938f00-0000-7000-8000-0000000000a1',
  '01938f00-0000-7000-8000-0000000000a3',
  'issue-379-trashed-was-public',
  'Issue 379 検証ノートT2（ゴミ箱・公開状態残存エッジ）',
  '<p>これは Issue #379 の検証用ゴミ箱ノート T2 の本文です。trash イベント未処理で publication=public でも描画されるべきです。</p>',
  '{}', 'trashed', '2026-05-23T00:00:00.000Z',
  '2026-05-10T00:00:00.000Z', '2026-05-23T00:00:00.000Z',
  NULL, NULL, NULL, 1
);
INSERT OR REPLACE INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '019e7900-0000-7000-8000-0000000379a2',
  '01938f00-0000-7000-8000-0000000000a1',
  'public', '2026-05-20T10:00:00.000Z', '2026-05-20T10:00:00.000Z', 1
);
INSERT OR REPLACE INTO share_links (
  id, note_id, owner_id, token_hash, password_hash, status,
  failed_attempts, locked_until, created_at, revoked_at, last_accessed_at,
  updated_at, version
) VALUES (
  '019e7900-0000-7000-8000-00000037912a',
  '019e7900-0000-7000-8000-0000000379a2',
  '01938f00-0000-7000-8000-0000000000a1',
  'issue379-t2-token-hash-placeholder',
  NULL, 'active',
  0, NULL, '2026-05-20T10:00:00.000Z', NULL, NULL,
  '2026-05-20T10:00:00.000Z', 0
);

-- ---- note-A1 : active / public (hot-path regression guard) ----
INSERT OR REPLACE INTO notes (
  id, owner_id, directory_id, slug, title,
  content_html, front_matter_json, status, trashed_at,
  created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version
) VALUES (
  '019e7900-0000-7000-8000-0000000379b1',
  '01938f00-0000-7000-8000-0000000000a1',
  '01938f00-0000-7000-8000-0000000000a3',
  'issue-379-active-public',
  'Issue 379 検証ノートA1（通常・公開）',
  '<p>これは Issue #379 の検証用 active ノート A1 の本文です。従来どおり公開状態チップが表示されるべきです。</p>',
  '{}', 'active', NULL,
  '2026-05-10T00:00:00.000Z', '2026-05-20T14:32:00.000Z',
  NULL, NULL, NULL, 0
);
INSERT OR REPLACE INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '019e7900-0000-7000-8000-0000000379b1',
  '01938f00-0000-7000-8000-0000000000a1',
  'public', '2026-05-20T10:00:00.000Z', '2026-05-20T10:00:00.000Z', 1
);
