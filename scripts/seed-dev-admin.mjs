/**
 * Seed a deterministic admin user + valid session into the local dev D1,
 * so authenticated routes (notably `/admin/*`) can be exercised in the
 * browser without hand-writing SQL each time.
 *
 * Local dev only. Writes through `pnpm db:execute:local` (= `wrangler d1
 * execute hollow-local-d1 --local --file`), the same D1 that `pnpm dev`
 * reads. Run `pnpm db:migrate` first if the schema is not applied yet.
 *
 * Mechanics this relies on (verified against the adapters):
 *   - Sessions are matched by raw token (no hashing) in
 *     `D1SessionService.resolve`, so an arbitrary fixed token works.
 *   - Admin access requires the `active` status, derived as
 *     email_verified=1 / banned=0 / deleted_at=NULL, plus role='admin'.
 *   - `users.id` must satisfy the UUIDv7 format `UuidV7Generator.validate`
 *     enforces, else rehydration (e.g. `/admin/users`) throws DataIntegrity.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Deterministic identifiers. USER_ID / SESSION_ID are valid UUIDv7 so the
// user row survives adapter rehydration. The token is opaque (raw compare).
const USER_ID = "01950000-0000-7000-8000-000000000001";
const SESSION_ID = "01950000-0000-7000-8000-000000000002";
const EMAIL = "dev-admin@example.com";
const USERNAME = "dev-admin";
const NAME = "Dev Admin";
const TOKEN = "dev-admin-session-token";

// Fixed timestamps keep the seed fully deterministic (no Date.now()).
const CREATED_AT = "2024-01-01T00:00:00.000Z";
const EXPIRES_AT = "2999-12-31T23:59:59.000Z";

// Idempotent. The dev admin row (our fixed USER_ID) is upserted, never
// deleted: deleting it cascades into the dev admin's notes / directories /
// media, whose RESTRICT back-references (notes.directory_id → directories,
// directories.parent_id → directories) abort the cascade with
// SQLITE_CONSTRAINT_TRIGGER once any nested data exists — and even when the
// cascade succeeds it destroys data we want to keep. Re-asserting the
// canonical admin state via ON CONFLICT leaves owned data intact. Sessions
// are leaf rows (nothing FK-references them), so a delete-then-insert is
// safe and also clears the fixed token if it was attached to a different
// user.
const SQL = `
DELETE FROM sessions WHERE token = '${TOKEN}' OR user_id = '${USER_ID}' OR id = '${SESSION_ID}';
-- A *different* user (e.g. a manual sign-up) may already hold our fixed
-- email / username; ON CONFLICT(id) below would not catch that and the
-- unique indexes would abort the seed. Drop only such foreign rows — our
-- own USER_ID is excluded so its owned data is preserved by the upsert.
DELETE FROM users WHERE (email = '${EMAIL}' OR username = '${USERNAME}') AND id <> '${USER_ID}';
INSERT INTO users (
  id, name, email, email_verified, image, created_at, updated_at,
  username, display_username, role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '${USER_ID}', '${NAME}', '${EMAIL}', 1, NULL, '${CREATED_AT}', '${CREATED_AT}',
  '${USERNAME}', NULL, 'admin', 0, NULL, NULL,
  NULL, NULL, NULL, NULL
)
-- Only the identity + admin-active columns are re-asserted. created_at is
-- immutable; image / bio / avatar_media_id / last_username_changed_at are
-- profile data the dev admin may have set and are treated as owned data —
-- preserved on re-seed, same as the notes / directories above.
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  email = excluded.email,
  email_verified = excluded.email_verified,
  updated_at = excluded.updated_at,
  username = excluded.username,
  display_username = excluded.display_username,
  role = excluded.role,
  banned = excluded.banned,
  ban_reason = excluded.ban_reason,
  ban_expires = excluded.ban_expires,
  deleted_at = excluded.deleted_at;
INSERT INTO sessions (
  id, user_id, token, expires_at, created_at, updated_at,
  ip_address, user_agent, impersonated_by
) VALUES (
  '${SESSION_ID}', '${USER_ID}', '${TOKEN}', '${EXPIRES_AT}', '${CREATED_AT}', '${CREATED_AT}',
  NULL, NULL, NULL
);
`;

const dir = mkdtempSync(join(tmpdir(), "hollow-seed-"));
const sqlFile = join(dir, "seed-dev-admin.sql");
writeFileSync(sqlFile, SQL);

try {
  execFileSync("pnpm", ["db:execute:local", sqlFile], { stdio: "inherit" });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`
✅ Seeded dev admin into local D1.

   email:    ${EMAIL}
   username: ${USERNAME}
   role:     admin (active)
   token:    ${TOKEN}

Use it in the browser (cookie name is "__Host-session", which is Secure-only
so it cannot be set via document.cookie — inject it over CDP):

   agent-browser cookies set "__Host-session" "${TOKEN}" \\
     --url http://localhost:<port> --path / --secure --sameSite Lax

Then open http://localhost:<port>/admin — you'll be authenticated as admin.
Re-run "pnpm seed:dev-admin" anytime; it is idempotent.
`);
