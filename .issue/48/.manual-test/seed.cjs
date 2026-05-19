#!/usr/bin/env node
// Generates SQL seed for Issue #48 manual tests:
//   - 1 login-capable user (mt48-eve)
//   - Multiple notes by that owner spread across distinct updatedAt dates
//   - Notes carrying the keyword "uniquekw" in all 3 visibilities
//     (private / unlisted / public), at least 3 of them
//   - Bonus notes for cursor pagination (10+ uniquekw notes total)
//   - search_documents rows matching publication_states.visibility
//
// IDs are UUID v7 (validated by IdGenerator.validate). Password hash is
// produced with the same PBKDF2-SHA256 / 600,000 iter / 16B salt / 32B key
// parameters as D1CredentialStore.hashPassword so verifyPassword accepts it.

const { v7: uuidv7 } = require("uuid");
const crypto = require("node:crypto");

// ---------- helpers --------------------------------------------------------

const PBKDF2_ITER = 600_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

function hashPassword(raw) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = crypto.pbkdf2Sync(
    raw,
    salt,
    PBKDF2_ITER,
    KEY_BYTES,
    "sha256",
  );
  return [
    "pbkdf2-sha256-v1",
    String(PBKDF2_ITER),
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function row(values) {
  return `(${values.map(sqlString).join(", ")})`;
}

// ---------- IDs (UUID v7) --------------------------------------------------

const ids = {
  user: uuidv7(),
  account: uuidv7(),
  rootDir: uuidv7(),
  inboxDir: uuidv7(),
};

// Generate note IDs deterministically by purpose
function makeNote(label) {
  return { id: uuidv7(), label };
}

// 12 notes total carrying "uniquekw":
//   private: 5 (incl. cursor pagination filler)
//   unlisted: 3
//   public: 4
// Spread across 5+ distinct dates.
const notes = [
  // Recent week
  {
    ...makeNote("N1-private-2026-05-20"),
    vis: "private",
    date: "2026-05-20T09:00:00.000Z",
  },
  {
    ...makeNote("N2-public-2026-05-19"),
    vis: "public",
    date: "2026-05-19T10:00:00.000Z",
  },
  {
    ...makeNote("N3-unlisted-2026-05-18"),
    vis: "unlisted",
    date: "2026-05-18T11:00:00.000Z",
  },
  // A few days back
  {
    ...makeNote("N4-private-2026-05-15"),
    vis: "private",
    date: "2026-05-15T08:00:00.000Z",
  },
  {
    ...makeNote("N5-public-2026-05-13"),
    vis: "public",
    date: "2026-05-13T14:00:00.000Z",
  },
  {
    ...makeNote("N6-unlisted-2026-05-10"),
    vis: "unlisted",
    date: "2026-05-10T16:30:00.000Z",
  },
  // Older
  {
    ...makeNote("N7-private-2026-05-05"),
    vis: "private",
    date: "2026-05-05T07:15:00.000Z",
  },
  {
    ...makeNote("N8-public-2026-04-28"),
    vis: "public",
    date: "2026-04-28T12:00:00.000Z",
  },
  {
    ...makeNote("N9-unlisted-2026-04-20"),
    vis: "unlisted",
    date: "2026-04-20T18:00:00.000Z",
  },
  {
    ...makeNote("N10-private-2026-04-10"),
    vis: "private",
    date: "2026-04-10T09:30:00.000Z",
  },
  {
    ...makeNote("N11-public-2026-03-15"),
    vis: "public",
    date: "2026-03-15T11:00:00.000Z",
  },
  {
    ...makeNote("N12-private-2026-02-20"),
    vis: "private",
    date: "2026-02-20T15:45:00.000Z",
  },
];

// ---------- SQL output -----------------------------------------------------

const out = [];
out.push(
  "-- Seed for Issue #48 manual tests (search projection: updatedAt / directoryId / slug + visibility badge)",
);
out.push("-- Owner: mt48-eve (login: mt48-eve@example.com / Password123!)");
out.push(
  "-- Idempotent: deletes user row, cascades to notes/publication_states/search_documents.",
);
out.push("");
out.push("DELETE FROM users WHERE username = 'mt48-eve';");
out.push("");

// User
out.push(
  "INSERT INTO users (id, name, email, email_verified, image, created_at, updated_at, username, display_username, role, banned, ban_reason, ban_expires, bio, avatar_media_id, last_username_changed_at, deleted_at) VALUES",
);
out.push(
  row([
    ids.user,
    "mt48-eve",
    "mt48-eve@example.com",
    1,
    null,
    "2026-02-01T00:00:00.000Z",
    "2026-02-01T00:00:00.000Z",
    "mt48-eve",
    "mt48-eve",
    "member",
    0,
    null,
    null,
    "Issue #48 manual-test owner",
    null,
    null,
    null,
  ]) + ";",
);
out.push("");

// Account (password)
const passwordHash = hashPassword("Password123!");
out.push(
  "INSERT INTO accounts (id, user_id, account_id, provider_id, password, access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, created_at, updated_at) VALUES",
);
out.push(
  row([
    ids.account,
    ids.user,
    ids.user,
    "credential",
    passwordHash,
    null,
    null,
    null,
    null,
    null,
    null,
    "2026-02-01T00:00:00.000Z",
    "2026-02-01T00:00:00.000Z",
  ]) + ";",
);
out.push("");

// Directories: root (depth 0, empty name/slug) + Inbox (depth 1)
out.push(
  "INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at) VALUES",
);
out.push(
  [
    row([
      ids.rootDir,
      ids.user,
      null,
      "",
      "",
      0,
      0,
      "2026-02-01T00:00:00.000Z",
      "2026-02-01T00:00:00.000Z",
    ]),
    row([
      ids.inboxDir,
      ids.user,
      ids.rootDir,
      "Inbox",
      "inbox",
      1,
      0,
      "2026-02-01T00:00:00.000Z",
      "2026-02-01T00:00:00.000Z",
    ]),
  ].join(",\n") + ";",
);
out.push("");

// Notes
out.push(
  "INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at, version) VALUES",
);
const noteRows = notes.map((n, i) => {
  const slug = `mt48-${i + 1}-${n.vis}`;
  const title = `[${n.vis}] uniquekw note ${i + 1} (${n.date.slice(0, 10)})`;
  const content = `<h1>uniquekw note ${i + 1}</h1><p>This is a manual-test note containing the keyword <strong>uniquekw</strong>. visibility=${n.vis}, updatedAt=${n.date}. Repeating uniquekw to boost score for cursor pagination differentiation: ${"uniquekw ".repeat(i + 1)}</p>`;
  const frontMatter = JSON.stringify({
    title,
    date: n.date.slice(0, 10),
    tags: ["mt48"],
  });
  return row([
    n.id,
    ids.user,
    ids.inboxDir,
    slug,
    title,
    content,
    frontMatter,
    "active",
    null,
    n.date,
    n.date,
    null,
    null,
    null,
    0,
  ]);
});
out.push(noteRows.join(",\n") + ";");
out.push("");

// publication_states
out.push(
  "INSERT INTO publication_states (note_id, owner_id, visibility, published_at, updated_at, version) VALUES",
);
const pubRows = notes.map((n) =>
  row([
    n.id,
    ids.user,
    n.vis,
    n.vis === "public" || n.vis === "unlisted" ? n.date : null,
    n.date,
    0,
  ]),
);
out.push(pubRows.join(",\n") + ";");
out.push("");

// search_documents (FTS trigger will sync the virtual table)
out.push(
  "INSERT INTO search_documents (note_id, owner_id, visibility, title, body_plain, tag_names_json, directory_path, date_for_calendar, updated_at, indexed_at) VALUES",
);
const sdRows = notes.map((n, i) => {
  const title = `[${n.vis}] uniquekw note ${i + 1} (${n.date.slice(0, 10)})`;
  const body = `uniquekw note ${i + 1}. This is a manual-test note containing the keyword uniquekw. visibility=${n.vis}, updatedAt=${n.date}. ${"uniquekw ".repeat(i + 1)}`;
  return row([
    n.id,
    ids.user,
    n.vis,
    title,
    body,
    JSON.stringify(["mt48"]),
    "Inbox",
    n.date.slice(0, 10),
    n.date,
    n.date,
  ]);
});
out.push(sdRows.join(",\n") + ";");
out.push("");

// Reference comment block
out.push("");
out.push("-- ===== IDs reference =====");
out.push(`-- user.id      = ${ids.user}`);
out.push(`-- account.id   = ${ids.account}`);
out.push(`-- root dir.id  = ${ids.rootDir}`);
out.push(`-- inbox dir.id = ${ids.inboxDir}`);
notes.forEach((n) => {
  out.push(`-- ${n.label} -> ${n.id}`);
});

process.stdout.write(out.join("\n") + "\n");
