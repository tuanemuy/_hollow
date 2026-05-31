-- Issue #389 browser-verification seed (note-list / home UI improvements).
-- Idempotent: removes any prior test-389 user (cascades to its sessions,
-- directories, notes, tags, note_tags, publication_states) before
-- re-inserting. Safe to re-run.

DELETE FROM users WHERE id = '019e7ec9-02e5-700e-b569-9cf9220b82fb';

-- Test user. status=active (deleted_at NULL, banned 0, email_verified 1).
INSERT INTO users (
  id, name, email, email_verified, image,
  created_at, updated_at, username, display_username,
  role, banned, ban_reason, ban_expires, bio,
  avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '019e7ec9-02e5-700e-b569-9cf9220b82fb',
  'Test 389',
  'test-389@example.com',
  1, NULL,
  '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z',
  'test389', 'test389',
  'member', 0, NULL, NULL, 'Issue 389 note-list UI test user',
  NULL, NULL, NULL
);

-- Session row. Token stored in plaintext (better-auth convention); the
-- value below is the __Host-session cookie value used by the browser.
-- Expires 2030 so it stays valid for verification.
INSERT INTO sessions (
  id, user_id, token, expires_at, created_at, updated_at,
  ip_address, user_agent, impersonated_by
) VALUES (
  '019e7ec9-02e6-70a1-ae3e-f2adc5869c35',
  '019e7ec9-02e5-700e-b569-9cf9220b82fb',
  'seed389-tEsTsEsSiOnToKeN-bbbbbbbbbbbbbbbbbbbbbbbb',
  '2030-01-01T00:00:00.000Z',
  '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z',
  '127.0.0.1', 'seed-script', NULL
);

-- Directories. Root (name/slug empty, depth 0, parent NULL) is the
-- implicit container required for every user. A single child dir holds
-- every note (directory hierarchy is out of scope for #389).
INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at) VALUES
 ('019e7ec9-02e6-70a1-ae3e-f77a28cbd06f', '019e7ec9-02e5-700e-b569-9cf9220b82fb', NULL, '', '', 0, 0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
 ('019e7ec9-02e6-70a1-ae3e-faeadecb8765', '019e7ec9-02e5-700e-b569-9cf9220b82fb', '019e7ec9-02e6-70a1-ae3e-f77a28cbd06f', 'Notes', 'notes', 1, 0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z');

-- Tags. name_normalized = NFKC(name) lowercased (D1TagRepository.normalizeName).
-- tag_long carries an intentionally long name to test tile tag wrapping.
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at) VALUES
 ('019e7ec9-02e7-7779-9097-fb900ba4859e', '019e7ec9-02e5-700e-b569-9cf9220b82fb', 'work',     'work',     0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
 ('019e7ec9-02e7-7779-9097-fd0f35f27ee9', '019e7ec9-02e5-700e-b569-9cf9220b82fb', 'idea',     'idea',     0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
 ('019e7ec9-02e7-7779-9098-01a9235aa900', '019e7ec9-02e5-700e-b569-9cf9220b82fb', 'archived', 'archived', 0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
 ('019e7ec9-02e7-7779-9098-05a9567404e2', '019e7ec9-02e5-700e-b569-9cf9220b82fb', 'this-is-a-long-tag-name-for-tile-wrap-testing', 'this-is-a-long-tag-name-for-tile-wrap-testing', 0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
 ('019e7ec9-02e7-7779-9098-0a435a0df8ba', '019e7ec9-02e5-700e-b569-9cf9220b82fb', 'personal', 'personal', 0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
 ('019e7ec9-02e7-7779-9098-0eb95fc395bd', '019e7ec9-02e5-700e-b569-9cf9220b82fb', 'draft',    'draft',    0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z');

-- Notes (all active, all under the 'Notes' directory). updated_at is
-- deliberately spread across several days/months so the "updated at"
-- display varies between rows.
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version) VALUES
 ('019e7ec9-02e7-7779-9097-dd443ce8576c', '019e7ec9-02e5-700e-b569-9cf9220b82fb', '019e7ec9-02e6-70a1-ae3e-faeadecb8765', 'public-note',   '公開ノート（タグ複数・長い抜粋）',     '<p>これは公開ノートの本文です。一覧の抜粋表示を確認するため、ある程度の長さの文章を入れています。リスト表示とタイル表示で同じ情報量・同じ抜粋が表示されること、サムネイルが廃止されていること、罫線が二重に出ていないことを確認します。さらに続く長い段落として、200文字を超える本文を入れて抜粋の切り詰めが効いているかも確認できるようにしておきます。これでおおむね二百文字に達するはずです。</p>', '{}', 'active', NULL, '2026-05-01T09:00:00.000Z', '2026-05-30T18:30:00.000Z', NULL, NULL, NULL, 0),
 ('019e7ec9-02e7-7779-9097-e1cf6f7f89dc', '019e7ec9-02e5-700e-b569-9cf9220b82fb', '019e7ec9-02e6-70a1-ae3e-faeadecb8765', 'unlisted-note', '限定公開ノート（長いタグ名・短い抜粋）', '<p>限定公開の短い本文。</p>', '{}', 'active', NULL, '2026-05-15T10:00:00.000Z', '2026-05-28T08:15:00.000Z', NULL, NULL, NULL, 0),
 ('019e7ec9-02e7-7779-9097-e442e2478dad', '019e7ec9-02e5-700e-b569-9cf9220b82fb', '019e7ec9-02e6-70a1-ae3e-faeadecb8765', 'private-note',  '非公開ノート（タグ複数・抜粋あり）',     '<p>非公開ノートの本文です。公開状態チップが private 色で表示されること、複数タグが並ぶことを確認します。タイル表示でのタグ折り返しも合わせて確認できます。</p>', '{}', 'active', NULL, '2026-04-20T12:00:00.000Z', '2026-05-25T14:45:00.000Z', NULL, NULL, NULL, 0),
 ('019e7ec9-02e7-7779-9097-ea75badd8459', '019e7ec9-02e5-700e-b569-9cf9220b82fb', '019e7ec9-02e6-70a1-ae3e-faeadecb8765', 'no-tag-note',   'タグなしノート（公開・中程度の抜粋）',   '<p>タグの付いていないノートです。タグ行が無いときのレイアウト崩れや罫線の二重表示が無いかを確認します。</p>', '{}', 'active', NULL, '2026-03-10T08:00:00.000Z', '2026-05-20T11:00:00.000Z', NULL, NULL, NULL, 0),
 ('019e7ec9-02e7-7779-9097-ef9c10fd66b4', '019e7ec9-02e5-700e-b569-9cf9220b82fb', '019e7ec9-02e6-70a1-ae3e-faeadecb8765', 'empty-body-note', '抜粋なしノート（本文空・private）',     '', '{}', 'active', NULL, '2026-02-01T07:00:00.000Z', '2026-05-10T09:30:00.000Z', NULL, NULL, NULL, 0),
 ('019e7ec9-02e7-7779-9097-f3c75113d11f', '019e7ec9-02e5-700e-b569-9cf9220b82fb', '019e7ec9-02e6-70a1-ae3e-faeadecb8765', 'short-excerpt-note', '短い抜粋ノート（限定公開）',         '<p>短文。</p>', '{}', 'active', NULL, '2026-01-15T06:00:00.000Z', '2026-04-15T16:20:00.000Z', NULL, NULL, NULL, 0),
 ('019e7ec9-02e7-7779-9097-f541acbc7917', '019e7ec9-02e5-700e-b569-9cf9220b82fb', '019e7ec9-02e6-70a1-ae3e-faeadecb8765', 'archive-ref-note', 'アーカイブ参考（非公開・タグ2件）',   '<p>古い更新日時のノートです。更新日時表示が他の行とバラけて見えることを確認するための行です。</p>', '{}', 'active', NULL, '2025-11-01T05:00:00.000Z', '2025-12-31T23:59:00.000Z', NULL, NULL, NULL, 0);

-- note_tags. note1: work+idea / note2: long / note3: work+idea+long / note4: none
-- note5: draft / note6: personal / note7: archived+work
INSERT INTO note_tags (note_id, tag_id) VALUES
 ('019e7ec9-02e7-7779-9097-dd443ce8576c', '019e7ec9-02e7-7779-9097-fb900ba4859e'),
 ('019e7ec9-02e7-7779-9097-dd443ce8576c', '019e7ec9-02e7-7779-9097-fd0f35f27ee9'),
 ('019e7ec9-02e7-7779-9097-e1cf6f7f89dc', '019e7ec9-02e7-7779-9098-05a9567404e2'),
 ('019e7ec9-02e7-7779-9097-e442e2478dad', '019e7ec9-02e7-7779-9097-fb900ba4859e'),
 ('019e7ec9-02e7-7779-9097-e442e2478dad', '019e7ec9-02e7-7779-9097-fd0f35f27ee9'),
 ('019e7ec9-02e7-7779-9097-e442e2478dad', '019e7ec9-02e7-7779-9098-05a9567404e2'),
 ('019e7ec9-02e7-7779-9097-ef9c10fd66b4', '019e7ec9-02e7-7779-9098-0eb95fc395bd'),
 ('019e7ec9-02e7-7779-9097-f3c75113d11f', '019e7ec9-02e7-7779-9098-0a435a0df8ba'),
 ('019e7ec9-02e7-7779-9097-f541acbc7917', '019e7ec9-02e7-7779-9098-01a9235aa900'),
 ('019e7ec9-02e7-7779-9097-f541acbc7917', '019e7ec9-02e7-7779-9097-fb900ba4859e');

-- publication_states. visibility drives the home publish-state chip.
-- Notes with no row default to 'private' display; we insert one per note
-- so coverage is explicit (public/unlisted/private each >= 1).
-- public: note1, note4 / unlisted: note2, note6 / private: note3, note5, note7
INSERT INTO publication_states (note_id, owner_id, visibility, published_at, updated_at, version) VALUES
 ('019e7ec9-02e7-7779-9097-dd443ce8576c', '019e7ec9-02e5-700e-b569-9cf9220b82fb', 'public',   '2026-05-30T18:30:00.000Z', '2026-05-30T18:30:00.000Z', 0),
 ('019e7ec9-02e7-7779-9097-e1cf6f7f89dc', '019e7ec9-02e5-700e-b569-9cf9220b82fb', 'unlisted', NULL,                       '2026-05-28T08:15:00.000Z', 0),
 ('019e7ec9-02e7-7779-9097-e442e2478dad', '019e7ec9-02e5-700e-b569-9cf9220b82fb', 'private',  NULL,                       '2026-05-25T14:45:00.000Z', 0),
 ('019e7ec9-02e7-7779-9097-ea75badd8459', '019e7ec9-02e5-700e-b569-9cf9220b82fb', 'public',   '2026-05-20T11:00:00.000Z', '2026-05-20T11:00:00.000Z', 0),
 ('019e7ec9-02e7-7779-9097-ef9c10fd66b4', '019e7ec9-02e5-700e-b569-9cf9220b82fb', 'private',  NULL,                       '2026-05-10T09:30:00.000Z', 0),
 ('019e7ec9-02e7-7779-9097-f3c75113d11f', '019e7ec9-02e5-700e-b569-9cf9220b82fb', 'unlisted', NULL,                       '2026-04-15T16:20:00.000Z', 0),
 ('019e7ec9-02e7-7779-9097-f541acbc7917', '019e7ec9-02e5-700e-b569-9cf9220b82fb', 'private',  NULL,                       '2025-12-31T23:59:00.000Z', 0);
