/**
 * Seed deterministic test data for Issue #540 browser verification into the
 * local dev D1 (miniflare). Creates a dedicated member user `mt540-user` with
 * a valid raw-token session, a directory hierarchy, tagged notes with mixed
 * visibility, a backlink relationship, and four personal saved views (one
 * broken) so P10 / P11 / P12 / P20 can be exercised against real data.
 *
 * Local dev only. Writes through `pnpm db:execute:local` (= `wrangler d1
 * execute hollow-local-d1 --local --file`), the same D1 that `pnpm dev`
 * reads. Run `pnpm db:migrate` first if the schema is not applied yet.
 *
 * Mechanics this relies on (verified against the adapters):
 *   - Sessions are matched by raw token (no hashing) in `D1SessionService`,
 *     so an arbitrary fixed token works.
 *   - Member access requires the `active` status (email_verified=1 /
 *     banned=0 / deleted_at=NULL).
 *   - All ids are valid UUIDv7 (version nibble `7`, variant nibble `8`) so
 *     rehydration via `UuidV7Generator.validate` does not throw DataIntegrity.
 *   - JSON column shapes (query_json / sort_json / broken_conditions_json)
 *     match `savedViewRepository` encode/decode exactly.
 *
 * Idempotent: all mt540-owned rows are deleted (child-first) then re-inserted.
 * Only mt540-* data is touched; existing production-like rows are untouched.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const B = "01950540-0000-7000-8000-0000000000";

// Identities (all valid UUIDv7).
const USER_ID = `${B}01`;
const SESSION_ID = `${B}02`;

// Directories.
const DIR_ROOT = `${B}10`;
const DIR_RESEARCH = `${B}11`;
const DIR_PAPERS = `${B}12`; // child of Research (論文メモ)
const DIR_PROJECTS = `${B}13`;

// Tags.
const TAG_RESEARCH = `${B}20`;
const TAG_PAPER = `${B}21`;
const TAG_AI = `${B}22`;
const TAG_DRAFT = `${B}23`;
const TAG_DESIGN = `${B}24`;

// Notes.
const NOTE_A = `${B}30`; // references NOTE_B (backlink source)
const NOTE_B = `${B}31`; // referenced by NOTE_A (backlink target)
const NOTE_C = `${B}32`;
const NOTE_D = `${B}33`;
const NOTE_E = `${B}34`;
const NOTE_F = `${B}35`;
const NOTE_G = `${B}36`;

// Internal link row.
const LINK_A_TO_B = `${B}40`;

// Saved views.
const VIEW_TAG = `${B}50`;
const VIEW_VIS = `${B}51`;
const VIEW_DATE = `${B}52`;
const VIEW_SORT_DIR = `${B}53`;

// A non-existent id used inside a broken saved view's broken_conditions_json.
const GHOST_TAG = `${B}ff`;

const EMAIL = "mt540@example.com";
const USERNAME = "mt540-user";
const NAME = "MT540 Test User";
const TOKEN = "mt540-session-token";

const CREATED_AT = "2026-05-01T00:00:00.000Z";
const EXPIRES_AT = "2999-12-31T23:59:59.000Z";

// Date for the "past 30 days" preset view. matchDateRangePreset compares at
// render time against the current date, so exact preset match is best-effort;
// the range is anchored to a recent window relative to today (2026-06-07).
const DATE_FROM = "2026-05-08T00:00:00.000Z";
const DATE_TO = "2026-06-07T23:59:59.000Z";

const sql = (strings, ...vals) =>
  strings.reduce((acc, s, i) => acc + s + (i < vals.length ? vals[i] : ""), "");

// Per-note insert helpers keep the long VALUES lists readable.
function noteRow({ id, dirId, slug, title, html, fm = "{}" }) {
  return `INSERT INTO notes (
  id, owner_id, directory_id, slug, title, content_html, front_matter_json,
  status, trashed_at, created_at, updated_at, edit_lock_user_id,
  edit_lock_acquired_at, edit_lock_expires_at, version, source_file_id
) VALUES (
  '${id}', '${USER_ID}', '${dirId}', '${slug}', '${title}', '${html}', '${fm}',
  'active', NULL, '${CREATED_AT}', '${CREATED_AT}', NULL,
  NULL, NULL, 0, NULL
);`;
}

function pubRow(noteId, visibility) {
  const publishedAt =
    visibility === "private" ? "NULL" : `'${CREATED_AT}'`;
  return `INSERT INTO publication_states (
  note_id, owner_id, visibility, published_at, updated_at, version
) VALUES (
  '${noteId}', '${USER_ID}', '${visibility}', ${publishedAt}, '${CREATED_AT}', 0
);`;
}

function tagRow(id, name) {
  return `INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('${id}', '${USER_ID}', '${name}', '${name.toLowerCase()}', 0, '${CREATED_AT}', '${CREATED_AT}');`;
}

function noteTag(noteId, tagId) {
  return `INSERT INTO note_tags (note_id, tag_id) VALUES ('${noteId}', '${tagId}');`;
}

function dirRow({ id, parentId, name, slug, depth }) {
  const parent = parentId === null ? "NULL" : `'${parentId}'`;
  return `INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at)
VALUES ('${id}', '${USER_ID}', ${parent}, '${name}', '${slug}', ${depth}, 0, '${CREATED_AT}', '${CREATED_AT}');`;
}

const NOTE_IDS = [NOTE_A, NOTE_B, NOTE_C, NOTE_D, NOTE_E, NOTE_F, NOTE_G];
const DIR_IDS = [DIR_PAPERS, DIR_PROJECTS, DIR_RESEARCH, DIR_ROOT]; // child-first for FK RESTRICT
const VIEW_IDS = [VIEW_TAG, VIEW_VIS, VIEW_DATE, VIEW_SORT_DIR];
const TAG_IDS = [TAG_RESEARCH, TAG_PAPER, TAG_AI, TAG_DRAFT, TAG_DESIGN];

const inList = (ids) => ids.map((i) => `'${i}'`).join(", ");

const SQL = `
PRAGMA foreign_keys = ON;

-- ---- Idempotent cleanup (child rows first; only mt540-owned data) ----
DELETE FROM note_internal_links WHERE from_note_id IN (${inList(NOTE_IDS)}) OR id = '${LINK_A_TO_B}';
DELETE FROM note_tags WHERE note_id IN (${inList(NOTE_IDS)});
DELETE FROM publication_states WHERE owner_id = '${USER_ID}';
DELETE FROM saved_views WHERE owner_id = '${USER_ID}';
DELETE FROM notes WHERE owner_id = '${USER_ID}';
DELETE FROM tags WHERE owner_id = '${USER_ID}';
DELETE FROM directories WHERE owner_id = '${USER_ID}' AND parent_id IS NOT NULL;
DELETE FROM directories WHERE owner_id = '${USER_ID}';
DELETE FROM sessions WHERE token = '${TOKEN}' OR user_id = '${USER_ID}' OR id = '${SESSION_ID}';
DELETE FROM users WHERE (email = '${EMAIL}' OR username = '${USERNAME}') AND id <> '${USER_ID}';

-- ---- User ----
INSERT INTO users (
  id, name, email, email_verified, image, created_at, updated_at,
  username, display_username, role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '${USER_ID}', '${NAME}', '${EMAIL}', 1, NULL, '${CREATED_AT}', '${CREATED_AT}',
  '${USERNAME}', NULL, 'member', 0, NULL, NULL,
  NULL, NULL, NULL, NULL
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name, email = excluded.email,
  email_verified = excluded.email_verified, updated_at = excluded.updated_at,
  username = excluded.username, role = excluded.role,
  banned = excluded.banned, deleted_at = excluded.deleted_at;

-- ---- Session (raw token) ----
INSERT INTO sessions (
  id, user_id, token, expires_at, created_at, updated_at,
  ip_address, user_agent, impersonated_by
) VALUES (
  '${SESSION_ID}', '${USER_ID}', '${TOKEN}', '${EXPIRES_AT}', '${CREATED_AT}', '${CREATED_AT}',
  NULL, NULL, NULL
);

-- ---- Directories (root + hierarchy) ----
${dirRow({ id: DIR_ROOT, parentId: null, name: "", slug: "", depth: 0 })}
${dirRow({ id: DIR_RESEARCH, parentId: DIR_ROOT, name: "Research", slug: "research", depth: 1 })}
${dirRow({ id: DIR_PAPERS, parentId: DIR_RESEARCH, name: "論文メモ", slug: "papers", depth: 2 })}
${dirRow({ id: DIR_PROJECTS, parentId: DIR_ROOT, name: "プロジェクト", slug: "projects", depth: 1 })}

-- ---- Tags ----
${tagRow(TAG_RESEARCH, "research")}
${tagRow(TAG_PAPER, "paper")}
${tagRow(TAG_AI, "ai")}
${tagRow(TAG_DRAFT, "draft")}
${tagRow(TAG_DESIGN, "design")}

-- ---- Notes ----
${noteRow({ id: NOTE_A, dirId: DIR_PAPERS, slug: "transformer-survey", title: "Transformer Survey", html: "<p>See <a>Attention Is All You Need</a> for the seminal work.</p>", fm: '{"author":"mt540"}' })}
${noteRow({ id: NOTE_B, dirId: DIR_PAPERS, slug: "attention-is-all-you-need", title: "Attention Is All You Need", html: "<p>Notes on the original attention paper.</p>" })}
${noteRow({ id: NOTE_C, dirId: DIR_RESEARCH, slug: "research-index", title: "Research Index", html: "<p>Top-level research landing note.</p>" })}
${noteRow({ id: NOTE_D, dirId: DIR_PROJECTS, slug: "project-roadmap", title: "Project Roadmap", html: "<p>Q3 roadmap draft.</p>" })}
${noteRow({ id: NOTE_E, dirId: DIR_PROJECTS, slug: "design-spec", title: "Design Spec", html: "<p>UI design specification.</p>" })}
${noteRow({ id: NOTE_F, dirId: DIR_ROOT, slug: "scratchpad", title: "Scratchpad", html: "<p>Quick private notes.</p>" })}
${noteRow({ id: NOTE_G, dirId: DIR_ROOT, slug: "public-announcement", title: "Public Announcement", html: "<p>A publicly visible note.</p>" })}

-- ---- Note tags (multiple tags per note) ----
${noteTag(NOTE_A, TAG_RESEARCH)}
${noteTag(NOTE_A, TAG_PAPER)}
${noteTag(NOTE_A, TAG_AI)}
${noteTag(NOTE_B, TAG_PAPER)}
${noteTag(NOTE_B, TAG_AI)}
${noteTag(NOTE_C, TAG_RESEARCH)}
${noteTag(NOTE_D, TAG_DRAFT)}
${noteTag(NOTE_E, TAG_DESIGN)}
${noteTag(NOTE_E, TAG_DRAFT)}
${noteTag(NOTE_G, TAG_RESEARCH)}

-- ---- Publication states (mixed visibility) ----
${pubRow(NOTE_A, "public")}
${pubRow(NOTE_B, "unlisted")}
${pubRow(NOTE_C, "private")}
${pubRow(NOTE_D, "private")}
${pubRow(NOTE_E, "unlisted")}
${pubRow(NOTE_F, "private")}
${pubRow(NOTE_G, "public")}

-- ---- Internal link: NOTE_A -> NOTE_B (resolved) => backlink on NOTE_B ----
INSERT INTO note_internal_links (id, from_note_id, ref_kind, ref_target, display_text, resolved_note_id)
VALUES ('${LINK_A_TO_B}', '${NOTE_A}', 'title', 'Attention Is All You Need', 'Attention Is All You Need', '${NOTE_B}');

-- ---- Saved views (personal, varied conditions; last one broken) ----
-- 1) tag filter
INSERT INTO saved_views (id, owner_id, name, kind, query_json, display_mode, calendar_date_key, sort_json, is_default, broken_conditions_json, version, created_at, updated_at)
VALUES ('${VIEW_TAG}', '${USER_ID}', 'AI論文', 'personal',
  '${JSON.stringify({ directoryId: null, tagIds: [TAG_AI, TAG_PAPER], dateRange: null, keyword: null, referencingNoteId: null, visibilityFilter: [] })}',
  'list', 'updated', '${JSON.stringify({ by: "updatedAt", direction: "desc" })}', 0, '[]', 0, '${CREATED_AT}', '${CREATED_AT}');

-- 2) visibility filter
INSERT INTO saved_views (id, owner_id, name, kind, query_json, display_mode, calendar_date_key, sort_json, is_default, broken_conditions_json, version, created_at, updated_at)
VALUES ('${VIEW_VIS}', '${USER_ID}', '公開ノート', 'personal',
  '${JSON.stringify({ directoryId: null, tagIds: [], dateRange: null, keyword: null, referencingNoteId: null, visibilityFilter: ["public", "unlisted"] })}',
  'tile', 'updated', '${JSON.stringify({ by: "updatedAt", direction: "desc" })}', 0, '[]', 0, '${CREATED_AT}', '${CREATED_AT}');

-- 3) date range (best-effort "past 30 days")
INSERT INTO saved_views (id, owner_id, name, kind, query_json, display_mode, calendar_date_key, sort_json, is_default, broken_conditions_json, version, created_at, updated_at)
VALUES ('${VIEW_DATE}', '${USER_ID}', '最近の更新', 'personal',
  '${JSON.stringify({ directoryId: null, tagIds: [], dateRange: { from: DATE_FROM, to: DATE_TO }, keyword: null, referencingNoteId: null, visibilityFilter: [] })}',
  'list', 'updated', '${JSON.stringify({ by: "updatedAt", direction: "desc" })}', 0, '[]', 0, '${CREATED_AT}', '${CREATED_AT}');

-- 4) sort + directory filter, with a BROKEN tag condition (ghost tag id)
INSERT INTO saved_views (id, owner_id, name, kind, query_json, display_mode, calendar_date_key, sort_json, is_default, broken_conditions_json, version, created_at, updated_at)
VALUES ('${VIEW_SORT_DIR}', '${USER_ID}', 'プロジェクト(壊れ)', 'personal',
  '${JSON.stringify({ directoryId: DIR_PROJECTS, tagIds: [GHOST_TAG], dateRange: null, keyword: null, referencingNoteId: null, visibilityFilter: [] })}',
  'list', 'updated', '${JSON.stringify({ by: "title", direction: "asc" })}', 0,
  '${JSON.stringify([{ kind: "tag", id: GHOST_TAG, lastSeenName: "deleted-tag", lastSeenAt: CREATED_AT }])}', 0, '${CREATED_AT}', '${CREATED_AT}');
`;

const dir = mkdtempSync(join(tmpdir(), "hollow-seed-540-"));
const sqlFile = join(dir, "seed-540.sql");
// Also persist the rendered SQL next to this script for reference / re-run.
const persisted = join(import.meta.dirname, "seed.sql");
writeFileSync(sqlFile, SQL);
writeFileSync(persisted, SQL);

try {
  execFileSync("pnpm", ["db:execute:local", sqlFile], { stdio: "inherit" });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`
✅ Seeded Issue #540 test data into local D1.

   user:     ${USERNAME} (${EMAIL}), role=member, active
   token:    ${TOKEN}
   cookie:   __Host-session = ${TOKEN}

Inject the session cookie over CDP (Secure-only, cannot use document.cookie):

   agent-browser cookies set "__Host-session" "${TOKEN}" \\
     --url http://localhost:<port> --path / --secure --sameSite Lax

Then open http://localhost:<port>/ authenticated as ${USERNAME}.
Re-run anytime; it is idempotent.
`);
