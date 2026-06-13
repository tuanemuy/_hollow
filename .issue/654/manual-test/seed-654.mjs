/**
 * Issue #654 browser-verification seed (local dev D1 only).
 *
 * Layers ADDITIONAL data on top of `scripts/seed-public-user.mjs` (which must
 * be run first — it owns the `test-public-user` author, the root directory,
 * and the base 8 public notes / 3 public tags). This script only adds the
 * #654-specific data and never touches the base seed's rows.
 *
 * What #654 verification needs (from `.issue/654/testing.md`):
 *   1. A public tag attached only to a note that falls on page 2 (so the
 *      "+タグ" master set is a strict superset of the page-1 discovery tags).
 *      Public list page size is PAGINATION_DEFAULT_LIMIT = 20 and the default
 *      sort is publishedAt desc, so the page-2 note is given the oldest
 *      published_at of all notes and >20 newer notes are present.
 *   2. A tag attached only to a private/unlisted/trash note (never to a public
 *      note) so the publication gate hides it from the master set.
 *   3. >= 9 public tag kinds total (transport cap tags.max(8) suppression).
 *
 * All ids live in a distinct `01951901-...` UUIDv7 band so they never collide
 * with the base seed's `01951900-...` band. Re-running is safe: this script
 * deletes its own `01951901-...` notes / tags first, then re-inserts.
 *
 * name_normalized follows the adapter (`normalizeName` = NFKC + toLowerCase):
 * ASCII tags lower-cased, Japanese tags unchanged.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Reuse the base seed's owner + root directory (created by seed-public-user.mjs).
const USER_ID = "01951900-0000-7000-8000-000000000001";
const ROOT_DIR_ID = "01951900-0000-7000-8000-000000000010";
const USERNAME = "test-public-user";
const CREATED_AT = "2025-01-01T00:00:00.000Z";

const sqlEscape = (s) => s.replace(/'/g, "''");

// --- Tags (band 01951901-...-03xx) ---------------------------------------
// Extra PUBLIC tags to push the public tag-kind count well past 9.
const PUBLIC_EXTRA_TAGS = [
  { seq: 1, name: "Rust", normalized: "rust" },
  { seq: 2, name: "Go", normalized: "go" },
  { seq: 3, name: "データベース", normalized: "データベース" },
  { seq: 4, name: "テスト", normalized: "テスト" },
  { seq: 5, name: "ブラウザ", normalized: "ブラウザ" },
  { seq: 6, name: "アーキテクチャ", normalized: "アーキテクチャ" },
];
// PUBLIC tag attached ONLY to the page-2 note (requirement 1).
const PAGE_TWO_TAG = {
  seq: 7,
  name: "ページ2タグ",
  normalized: "ページ2タグ",
};
// PRIVATE-ONLY tag: attached only to a private note, never to a public note
// (requirement 2). Must be absent from the "+タグ" master set.
const PRIVATE_TAG = {
  seq: 8,
  name: "非公開タグ",
  normalized: "非公開タグ",
};

function tagId(seq) {
  return `01951901-0000-7000-8000-0000000003${String(seq).padStart(2, "0")}`;
}

// --- Notes (band 01951901-...-04xx) --------------------------------------
// Filler PUBLIC notes so that there are > 20 notes newer than the page-2 note,
// guaranteeing the page-2 note (oldest published_at) lands on page 2 under the
// default publishedAt-desc sort with page size 20.
// published_at spread: all newer than the page-2 note, older than the base
// seed's oldest (2025-09-12) to keep the page-1/page-2 boundary deterministic
// regardless of base-seed ordering. 16 fillers + base 8 = 24 notes newer than
// the page-2 note, so the page-2 note sits at position 25 → page 2.
const FILLER_COUNT = 16;
const fillerNotes = [];
for (let i = 0; i < FILLER_COUNT; i++) {
  // 2025-08-31 down to 2025-08-16, one per day, all < base-seed oldest.
  const day = String(31 - i).padStart(2, "0");
  fillerNotes.push({
    seq: 10 + i,
    title: `#654 ページ埋めノート ${i + 1}`,
    slug: `issue654-filler-${i + 1}`,
    body: `<p>#654 検証用のページ埋め公開ノート ${i + 1} です。タグなし。</p>`,
    publishedAt: `2025-08-${day}T00:00:00.000Z`,
    tagSeqs: [],
    visibility: "public",
    published: true,
  });
}

// Page-2 note: oldest published_at, carries ONLY the page-2 public tag.
const PAGE_TWO_NOTE = {
  seq: 50,
  title: "#654 ページ2のノート（ページ2タグ付き）",
  slug: "issue654-page-two",
  body: "<p>#654 検証用。published_at が最も古いのでページ2に表示されます。「ページ2タグ」のみ付与。</p>",
  publishedAt: "2025-07-01T00:00:00.000Z",
  tagSeqs: [PAGE_TWO_TAG.seq],
  visibility: "public",
  published: true,
};

// A few PUBLIC notes carrying the extra public tags so those tags are real
// members of the public master set (page-1 dated so they are discoverable).
const PUBLIC_TAGGED_NOTES = [
  {
    seq: 60,
    title: "#654 Rust/Go のノート",
    slug: "issue654-rust-go",
    body: "<p>#654 検証用。Rust と Go タグの公開ノート。</p>",
    publishedAt: "2026-06-11T00:00:00.000Z",
    tagSeqs: [1, 2],
    visibility: "public",
    published: true,
  },
  {
    seq: 61,
    title: "#654 DB/テストのノート",
    slug: "issue654-db-test",
    body: "<p>#654 検証用。データベース・テストタグの公開ノート。</p>",
    publishedAt: "2026-06-10T00:00:00.000Z",
    tagSeqs: [3, 4],
    visibility: "public",
    published: true,
  },
  {
    seq: 62,
    title: "#654 ブラウザ/アーキテクチャのノート",
    slug: "issue654-browser-arch",
    body: "<p>#654 検証用。ブラウザ・アーキテクチャタグの公開ノート。</p>",
    publishedAt: "2026-06-08T00:00:00.000Z",
    tagSeqs: [5, 6],
    visibility: "public",
    published: true,
  },
];

// Private note carrying ONLY the private-only tag (gate negative control).
const PRIVATE_TAGGED_NOTE = {
  seq: 70,
  title: "#654 非公開ノート（非公開タグ付き・表示されないはず）",
  slug: "issue654-private-tagged",
  body: "<p>#654 検証用。非公開ノートで「非公開タグ」のみ付与。公開タグ母集合に出ないこと。</p>",
  publishedAt: null,
  tagSeqs: [PRIVATE_TAG.seq],
  visibility: "private",
  published: false,
};

const ALL_NOTES = [
  ...fillerNotes,
  PAGE_TWO_NOTE,
  ...PUBLIC_TAGGED_NOTES,
  PRIVATE_TAGGED_NOTE,
];
const ALL_TAGS = [...PUBLIC_EXTRA_TAGS, PAGE_TWO_TAG, PRIVATE_TAG];

function noteId(seq) {
  return `01951901-0000-7000-8000-0000000004${String(seq).padStart(2, "0")}`;
}

const lines = [];

// Idempotent reset of THIS script's owned rows only (01951901-... band).
// Notes first (cascades note_tags / publication_states), then tags.
lines.push(
  `DELETE FROM notes WHERE owner_id = '${USER_ID}' AND id LIKE '01951901-%';`,
  `DELETE FROM tags WHERE owner_id = '${USER_ID}' AND id LIKE '01951901-%';`,
);

// Tags (INSERT OR REPLACE keeps re-runs safe).
for (const tag of ALL_TAGS) {
  lines.push(`
INSERT OR REPLACE INTO tags (
  id, owner_id, name, name_normalized, version, created_at, updated_at
) VALUES (
  '${tagId(tag.seq)}', '${USER_ID}', '${sqlEscape(tag.name)}', '${sqlEscape(tag.normalized)}', 0, '${CREATED_AT}', '${CREATED_AT}'
);`);
}

for (const note of ALL_NOTES) {
  const id = noteId(note.seq);
  const ts = note.publishedAt ?? CREATED_AT;
  lines.push(`
INSERT OR REPLACE INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  source_file_id, version
) VALUES (
  '${id}', '${USER_ID}', '${ROOT_DIR_ID}', '${note.slug}', '${sqlEscape(note.title)}',
  '${sqlEscape(note.body)}', '{}',
  'active', NULL, '${ts}', '${ts}',
  NULL, NULL, NULL, NULL, 0
);`);
  for (const seq of note.tagSeqs) {
    lines.push(
      `INSERT OR REPLACE INTO note_tags (note_id, tag_id) VALUES ('${id}', '${tagId(seq)}');`,
    );
  }
  lines.push(`
INSERT OR REPLACE INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '${id}', '${USER_ID}', '${note.visibility}', ${note.published ? `'${note.publishedAt}'` : "NULL"}, '${ts}', 0
);`);
}

const SQL = lines.join("\n");
const dir = mkdtempSync(join(tmpdir(), "hollow-seed-654-"));
const sqlFile = join(dir, "seed-654.sql");
writeFileSync(sqlFile, SQL);
try {
  execFileSync("pnpm", ["db:execute:local", sqlFile], { stdio: "inherit" });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`
✅ Seeded Issue #654 verification data into local D1.

   username:           ${USERNAME}
   extra public tags:  ${PUBLIC_EXTRA_TAGS.map((t) => t.name).join(", ")}
   page-2-only tag:    ${PAGE_TWO_TAG.name}
   private-only tag:   ${PRIVATE_TAG.name}
   filler public notes:${FILLER_COUNT}

Open: http://localhost:<port>/u/${USERNAME}
`);
