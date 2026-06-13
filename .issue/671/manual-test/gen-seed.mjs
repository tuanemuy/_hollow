/**
 * Issue #671 — P32 公開検索フィルター UI 検証用シード生成。
 *
 * 公開検索画面 `/search` のフィルター UI（期間ラジオ・@ユーザーチップ・
 * タグチップ・アクティブチップ行）を確認できるよう、複数ユーザー・複数タグ・
 * 期間スプレッドを持つ公開ノートを投入する。
 *
 * ローカル D1 専用。`pnpm db:execute:local <生成SQL>` で投入する
 * （= `wrangler d1 execute hollow-local-d1 --local --file`、`pnpm dev` が読む D1）。
 * 先に `pnpm db:migrate` でスキーマ適用が必要。
 *
 * 公開検索でヒットする条件（adapters/d1/searchIndex.ts + searchPublicNotes.ts より）:
 *   - users: username 一致かつ active（email_verified=1 / banned=0 / deleted_at=NULL）
 *   - notes: status='active'
 *   - publication_states: visibility='public' かつ published_at IS NOT NULL
 *   - search_documents: 同 note_id の public 行（FTS5 は INSERT トリガー
 *     search_documents_ai で自動同期。明示 INSERT で良い）
 *   - 期間フィルターは publication_states.published_at に対して評価される
 *     （dateBasis='published_at'）。now はサーバー実時計（≒今日）。
 *
 * 冪等: 固定 ID prefix `01967100-*` の行を DELETE してから再投入する。
 * 既存の他シードデータ（seeduser / searchtest618 / dev-admin の既存ノート等）は
 * 一切触らない。
 */

// 共通キーワード: 全公開ノートのタイトル・本文に含めるので `/search?q=hollow671`
// で全件ヒットする。
const KEYWORD = "hollow671";

// 既存の dev-admin（公開ノートを持たせる第3の著者として再利用）。
// directories は owner ごとにルート(parent_id NULL)が1件のみ（uniq_directories_owner_root）。
// dev-admin は既にルート dir を持つのでそれを再利用する（新規作成しない）。
const ADMIN = "01950000-0000-7000-8000-000000000001";
const ADMIN_DIR = "019e9546-cb23-73c9-849c-120384e56377"; // dev-admin の既存ルート dir

// 新規テストユーザー2名（ログイン不要・公開ノート所有のみ）。
const USER_A = "01967100-0000-7000-8000-0000000000a1";
const USER_A_DIR = "01967100-0000-7000-8000-0000000000a2";
const USER_B = "01967100-0000-7000-8000-0000000000b1";
const USER_B_DIR = "01967100-0000-7000-8000-0000000000b2";

const USERS = [
  {
    id: USER_A,
    username: "p671-alice",
    name: "P671 Alice",
    email: "p671-alice@example.com",
    dir: USER_A_DIR,
  },
  {
    id: USER_B,
    username: "p671-bob",
    name: "P671 Bob",
    email: "p671-bob@example.com",
    dir: USER_B_DIR,
  },
];

// タグ（ファセット/チップ確認用）。owner はノートの所有者に合わせる必要はない
// （tag_names_json で検索するため）が、note_tags の整合のため所有者を持たせる。
const TAGS = [
  { id: "01967100-0000-7000-8000-000000000301", name: "p671-tech", owner: USER_A },
  { id: "01967100-0000-7000-8000-000000000302", name: "p671-diary", owner: USER_B },
  { id: "01967100-0000-7000-8000-000000000303", name: "p671-design", owner: ADMIN },
];

// 期間スプレッド（サーバー実時計 ≒ 2026-06-13 基準）:
//   7d 窓内 / 30d 窓内 / 1y 窓内 / 1y より古い（all のみ）
// 各バンドで件数が変わるよう配置する。
// owner: 著者（チップ/ファセット確認）。tagIdx: 付与タグ。
const NOTES = [
  // --- 過去7日以内（7d / 30d / 1y / all すべてに含まれる）---
  { seq: 1, owner: USER_A, title: "今日のノート", publishedAt: "2026-06-12T01:00:00.000Z", tagIdx: [0], extra: "" },
  { seq: 2, owner: USER_B, title: "数日前のノート", publishedAt: "2026-06-09T03:00:00.000Z", tagIdx: [1], extra: "" },
  { seq: 3, owner: ADMIN, title: "1週間以内のノート", publishedAt: "2026-06-07T05:00:00.000Z", tagIdx: [2], extra: "" },
  // --- 過去30日以内・7日より前（30d / 1y / all）---
  { seq: 4, owner: USER_A, title: "3週間前のノート", publishedAt: "2026-05-22T08:00:00.000Z", tagIdx: [0, 2], extra: "" },
  { seq: 5, owner: USER_B, title: "4週間前のノート 蜻蛉", publishedAt: "2026-05-16T02:00:00.000Z", tagIdx: [1], extra: " 蜻蛉が飛ぶ季節の記録。" },
  // --- 過去1年以内・30日より前（1y / all）---
  { seq: 6, owner: ADMIN, title: "3ヶ月前のノート", publishedAt: "2026-03-12T06:00:00.000Z", tagIdx: [2], extra: "" },
  { seq: 7, owner: USER_A, title: "半年前のノート p671unique", publishedAt: "2025-12-12T07:00:00.000Z", tagIdx: [0], extra: " p671unique 一意マーカー。" },
  { seq: 8, owner: USER_B, title: "10ヶ月前のノート", publishedAt: "2025-08-12T09:00:00.000Z", tagIdx: [1, 2], extra: "" },
  // --- 過去1年より古い（all のみ）---
  { seq: 9, owner: ADMIN, title: "去年より前のノート", publishedAt: "2025-01-12T09:00:00.000Z", tagIdx: [2], extra: "" },
  { seq: 10, owner: USER_A, title: "2年前のノート", publishedAt: "2024-06-01T09:00:00.000Z", tagIdx: [0, 1], extra: "" },
];

const CREATED_AT = "2025-01-01T00:00:00.000Z";
const esc = (s) => s.replace(/'/g, "''");
const noteId = (seq) =>
  `01967100-0000-7000-8000-0000000002${String(seq).padStart(2, "0")}`;

const ids = NOTES.map((n) => noteId(n.seq));
const inList = ids.map((id) => `'${id}'`).join(",");

const lines = [];
lines.push(`-- Issue #671 P32 公開検索フィルターUI検証シード（冪等: 固定ID削除→再投入）`);

// 冪等リセット（子から）。
lines.push(`DELETE FROM note_tags WHERE note_id IN (${inList});`);
lines.push(`DELETE FROM search_documents WHERE note_id IN (${inList});`);
lines.push(`DELETE FROM publication_states WHERE note_id IN (${inList});`);
lines.push(`DELETE FROM notes WHERE id IN (${inList});`);
lines.push(
  `DELETE FROM tags WHERE id IN (${TAGS.map((t) => `'${t.id}'`).join(",")});`,
);
// dev-admin の既存ルート dir は消さない（他データが参照）。新規2ユーザー分のみ。
lines.push(
  `DELETE FROM directories WHERE id IN ('${USER_A_DIR}','${USER_B_DIR}');`,
);
// 新規テストユーザーのみ（dev-admin は触らない）。
for (const u of USERS) {
  lines.push(
    `DELETE FROM users WHERE (email = '${u.email}' OR username = '${u.username}') AND id <> '${u.id}';`,
  );
}

// 新規テストユーザー（active: email_verified=1 / banned=0 / deleted_at=NULL）。
for (const u of USERS) {
  lines.push(`
INSERT INTO users (
  id, name, email, email_verified, image, created_at, updated_at,
  username, display_username, role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '${u.id}', '${esc(u.name)}', '${u.email}', 1, NULL, '${CREATED_AT}', '${CREATED_AT}',
  '${u.username}', NULL, 'member', 0, NULL, NULL,
  NULL, NULL, NULL, NULL
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  email = excluded.email,
  email_verified = excluded.email_verified,
  username = excluded.username,
  role = excluded.role,
  banned = excluded.banned,
  deleted_at = excluded.deleted_at;`);
}

// ルートディレクトリ。新規2ユーザー分のみ作成（dev-admin は既存ルートを再利用）。
// owner ごとにルート(parent_id NULL)は1件のみなので空 name/slug でよい。
const DIRS = [
  { id: USER_A_DIR, owner: USER_A },
  { id: USER_B_DIR, owner: USER_B },
];
for (const d of DIRS) {
  lines.push(`
INSERT INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES (
  '${d.id}', '${d.owner}', NULL, '', '', 0, 0, '${CREATED_AT}', '${CREATED_AT}'
);`);
}

// タグ。
for (const t of TAGS) {
  lines.push(`
INSERT INTO tags (
  id, owner_id, name, name_normalized, version, created_at, updated_at
) VALUES (
  '${t.id}', '${t.owner}', '${esc(t.name)}', '${esc(t.name)}', 0, '${CREATED_AT}', '${CREATED_AT}'
);`);
}

const dirOf = (owner) =>
  owner === ADMIN ? ADMIN_DIR : owner === USER_A ? USER_A_DIR : USER_B_DIR;

for (const note of NOTES) {
  const id = noteId(note.seq);
  const dir = dirOf(note.owner);
  const day = note.publishedAt.slice(0, 10);
  // 共通キーワードをタイトル・本文の両方に入れる。
  const title = `${note.title} ${KEYWORD}`;
  const body = `Issue #671 公開検索フィルター検証ノート${String(note.seq).padStart(2, "0")}。${note.extra} ${KEYWORD} のフィルターUIを確認します。`;
  const slug = `p671-note-${String(note.seq).padStart(2, "0")}`;
  const tagNames = note.tagIdx.map((i) => TAGS[i].name);
  const tagJson = JSON.stringify(tagNames);

  lines.push(`
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  source_file_id, version
) VALUES (
  '${id}', '${note.owner}', '${dir}', '${slug}', '${esc(title)}',
  '<p>${esc(body)}</p>', '{}',
  'active', NULL, '${note.publishedAt}', '${note.publishedAt}',
  NULL, NULL, NULL, NULL, 0
);`);

  lines.push(`
INSERT INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '${id}', '${note.owner}', 'public', '${note.publishedAt}', '${note.publishedAt}', 0
);`);

  // search_documents: public 行。FTS5 へは search_documents_ai トリガーで自動同期。
  lines.push(`
INSERT INTO search_documents (
  note_id, owner_id, visibility, title, body_plain, tag_names_json,
  directory_path, date_for_calendar, updated_at, indexed_at
) VALUES (
  '${id}', '${note.owner}', 'public', '${esc(title)}', '${esc(body)}', '${esc(tagJson)}',
  '', '${day}', '${note.publishedAt}', '${note.publishedAt}'
);`);

  for (const i of note.tagIdx) {
    lines.push(
      `INSERT INTO note_tags (note_id, tag_id) VALUES ('${id}', '${TAGS[i].id}');`,
    );
  }
}

process.stdout.write(`${lines.join("\n")}\n`);
