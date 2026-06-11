/**
 * Seed a deterministic *public* author + a spread of public notes into the
 * local dev D1, so the public profile page `/u/<username>` (P30, Issue #619)
 * can be exercised in the browser.
 *
 * Local dev only. Writes through `pnpm db:execute:local` (= `wrangler d1
 * execute hollow-local-d1 --local --file`), the same D1 that `pnpm dev`
 * reads. Run `pnpm db:migrate` first if the schema is not applied yet.
 *
 * What a note must satisfy to surface on `/u/<username>` (read from the
 * adapter `D1PublicationStateRepository` + `listUserPublicNotes`):
 *   - `users`: username matches, and the row derives to `active` —
 *     `email_verified=1`, `banned=0`, `deleted_at IS NULL`.
 *   - `notes`: `status='active'`.
 *   - `publication_states`: same `note_id`/`owner_id`, `visibility='public'`,
 *     `published_at IS NOT NULL` (ISO-8601 text — lexicographic = chronological).
 *
 * Id format: every `id` that is rehydrated by an adapter is validated against
 * the UUIDv7 pattern (`UuidV7Generator.validate`), so all ids below are valid
 * UUIDv7 with a deterministic, collision-free `019519...` prefix distinct from
 * the dev-admin seed's `01950000...`.
 *
 * Dates are fixed relative to the verification date 2026-06-12 ("today"):
 * today / a few days ago / a few weeks ago / a few months ago — the spread the
 * relative-date and period-filter checks rely on.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const USER_ID = "01951900-0000-7000-8000-000000000001";
const ROOT_DIR_ID = "01951900-0000-7000-8000-000000000010";
const EMAIL = "test-public-user@example.com";
const USERNAME = "test-public-user";
const NAME = "公開テストユーザー";
const BIO =
  "公開ページ（P30）検証用のテストユーザーです。技術メモや日々の記録を公開しています。";

// Fixed timestamps keep the seed fully deterministic (no Date.now()).
const CREATED_AT = "2025-01-01T00:00:00.000Z";

// Three tags shared across the notes (tag filter verification).
const TAGS = [
  { id: "01951900-0000-7000-8000-000000000101", name: "TypeScript", normalized: "typescript" },
  { id: "01951900-0000-7000-8000-000000000102", name: "設計", normalized: "設計" },
  { id: "01951900-0000-7000-8000-000000000103", name: "日記", normalized: "日記" },
];

// Public notes. `publishedAt` is the verification spread:
//   today (2026-06-12), a few days ago, ~1 week, ~3 weeks, ~1 / 2 / 5 months ago.
// `tagIdx` indexes into TAGS (the tag(s) attached to that note).
const NOTES = [
  {
    seq: 1,
    title: "今日公開したノート",
    slug: "note-today",
    body: "<p>これは今日公開したノートです。相対日付が「今日」と表示されることを確認します。</p>",
    publishedAt: "2026-06-12T01:00:00.000Z",
    tagIdx: [0, 1],
  },
  {
    seq: 2,
    title: "数日前のノート",
    slug: "note-few-days-ago",
    body: "<p>数日前に公開したノートです。</p>",
    publishedAt: "2026-06-09T03:00:00.000Z",
    tagIdx: [0],
  },
  {
    seq: 3,
    title: "1週間前のノート",
    slug: "note-one-week-ago",
    body: "<p>約1週間前に公開したノートです。</p>",
    publishedAt: "2026-06-05T05:00:00.000Z",
    tagIdx: [2],
  },
  {
    seq: 4,
    title: "3週間前のノート",
    slug: "note-three-weeks-ago",
    body: "<p>約3週間前に公開したノートです。期間フィルターの検証に使います。</p>",
    publishedAt: "2026-05-22T08:00:00.000Z",
    tagIdx: [1],
  },
  {
    seq: 5,
    title: "1ヶ月前のノート",
    slug: "note-one-month-ago",
    body: "<p>約1ヶ月前に公開したノートです。</p>",
    publishedAt: "2026-05-12T02:00:00.000Z",
    tagIdx: [0, 2],
  },
  {
    seq: 6,
    title: "2ヶ月前のノート",
    slug: "note-two-months-ago",
    body: "<p>約2ヶ月前に公開したノートです。</p>",
    publishedAt: "2026-04-12T06:00:00.000Z",
    tagIdx: [1],
  },
  {
    seq: 7,
    title: "5ヶ月前のノート",
    slug: "note-five-months-ago",
    body: "<p>約5ヶ月前に公開したノートです。古い公開ノートの表示を確認します。</p>",
    publishedAt: "2026-01-12T07:00:00.000Z",
    tagIdx: [2],
  },
  {
    seq: 8,
    title: "去年公開したノート",
    slug: "note-last-year",
    body: "<p>去年公開したノートです。カレンダー/タイル表示の年跨ぎを確認します。</p>",
    publishedAt: "2025-09-12T09:00:00.000Z",
    tagIdx: [0, 1, 2],
  },
];

// One private note as a negative control: it must NOT appear on /u/<username>.
const PRIVATE_NOTE = {
  seq: 99,
  title: "非公開ノート（表示されないはず）",
  slug: "note-private-control",
  body: "<p>これは非公開ノートです。公開一覧には出ないことを確認します。</p>",
};

function noteId(seq) {
  return `01951900-0000-7000-8000-0000000002${String(seq).padStart(2, "0")}`;
}
function pubVersion() {
  return 1;
}

const sqlEscape = (s) => s.replace(/'/g, "''");

const lines = [];

// Idempotent reset of this seed's owned data. Children first so RESTRICT
// back-references (notes.directory_id → directories) do not abort. Sessions
// for this user, then notes (cascades note_tags / publication_states), tags,
// the root directory, and finally any foreign row holding our email/username.
lines.push(
  `DELETE FROM sessions WHERE user_id = '${USER_ID}';`,
  `DELETE FROM notes WHERE owner_id = '${USER_ID}';`,
  `DELETE FROM tags WHERE owner_id = '${USER_ID}';`,
  `DELETE FROM directories WHERE owner_id = '${USER_ID}';`,
  `DELETE FROM users WHERE (email = '${EMAIL}' OR username = '${USERNAME}') AND id <> '${USER_ID}';`,
);

// User (active author: email_verified=1, banned=0, deleted_at=NULL).
lines.push(`
INSERT INTO users (
  id, name, email, email_verified, image, created_at, updated_at,
  username, display_username, role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '${USER_ID}', '${sqlEscape(NAME)}', '${EMAIL}', 1, NULL, '${CREATED_AT}', '${CREATED_AT}',
  '${USERNAME}', NULL, 'member', 0, NULL, NULL,
  '${sqlEscape(BIO)}', NULL, NULL, NULL
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  email = excluded.email,
  email_verified = excluded.email_verified,
  updated_at = excluded.updated_at,
  username = excluded.username,
  role = excluded.role,
  banned = excluded.banned,
  bio = excluded.bio,
  deleted_at = excluded.deleted_at;`);

// Root directory (parent_id NULL, depth 0, empty name/slug).
lines.push(`
INSERT INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES (
  '${ROOT_DIR_ID}', '${USER_ID}', NULL, '', '', 0, 0, '${CREATED_AT}', '${CREATED_AT}'
);`);

// Tags.
for (const tag of TAGS) {
  lines.push(`
INSERT INTO tags (
  id, owner_id, name, name_normalized, version, created_at, updated_at
) VALUES (
  '${tag.id}', '${USER_ID}', '${sqlEscape(tag.name)}', '${sqlEscape(tag.normalized)}', 0, '${CREATED_AT}', '${CREATED_AT}'
);`);
}

function insertNote(note, publishedAt) {
  const id = noteId(note.seq);
  // created_at slightly before published_at so the createdAt sort axis is
  // sensible; updated_at = published_at.
  const createdAt = publishedAt ?? CREATED_AT;
  lines.push(`
INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  source_file_id, version
) VALUES (
  '${id}', '${USER_ID}', '${ROOT_DIR_ID}', '${note.slug}', '${sqlEscape(note.title)}',
  '${sqlEscape(note.body)}', '{}',
  'active', NULL, '${createdAt}', '${createdAt}',
  NULL, NULL, NULL, NULL, 0
);`);
  return id;
}

for (const note of NOTES) {
  const id = insertNote(note, note.publishedAt);
  // note_tags
  for (const idx of note.tagIdx) {
    lines.push(
      `INSERT INTO note_tags (note_id, tag_id) VALUES ('${id}', '${TAGS[idx].id}');`,
    );
  }
  // publication_states: public + published_at set.
  lines.push(`
INSERT INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '${id}', '${USER_ID}', 'public', '${note.publishedAt}', '${note.publishedAt}', ${pubVersion()}
);`);
}

// Private control note (active note, but visibility=private, no published_at).
{
  const id = insertNote(PRIVATE_NOTE, null);
  lines.push(`
INSERT INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '${id}', '${USER_ID}', 'private', NULL, '${CREATED_AT}', 0
);`);
}

const SQL = lines.join("\n");

const dir = mkdtempSync(join(tmpdir(), "hollow-seed-public-"));
const sqlFile = join(dir, "seed-public-user.sql");
writeFileSync(sqlFile, SQL);

try {
  execFileSync("pnpm", ["db:execute:local", sqlFile], { stdio: "inherit" });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`
✅ Seeded public test author into local D1.

   username:      ${USERNAME}
   display name:  ${NAME}
   public notes:  ${NOTES.length} (+ 1 private control)
   tags:          ${TAGS.map((t) => t.name).join(", ")}

Open the public profile page:

   http://localhost:<port>/u/${USERNAME}

Re-run "node scripts/seed-public-user.mjs" anytime; it is idempotent.
`);
