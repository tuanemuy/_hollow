/**
 * Seed a deterministic, *password-login-capable* user into the local dev D1.
 *
 * `seed-dev-admin.mjs` injects a user + session but no password credential,
 * so its user can only be authenticated by injecting the session cookie — it
 * cannot go through the real email+password login form. This script adds the
 * missing piece: an `active` user plus a `credential` row in `accounts` whose
 * password is a real scrypt hash (computed with the project's own
 * `@noble/hashes` scrypt at the same OWASP profile the adapter uses), so the
 * user can sign in at `/login` and create fresh sessions.
 *
 * Login path it satisfies (verified against the adapters / usecase):
 *   - `logIn` -> `D1CredentialStore.verifyPassword(email, password)` does a
 *     scrypt `verifyHash` against `accounts.password`.
 *   - `logIn` then requires the user `status` to be `active`
 *     (email_verified=1 / banned=0 / deleted_at=NULL).
 *
 * Local dev only. Writes through `pnpm db:execute:local`. Run `pnpm
 * db:migrate` first if the schema is not applied yet. Idempotent.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scryptAsync } from "@noble/hashes/scrypt.js";

// Deterministic identifiers. USER_ID / ACCOUNT_ID are valid UUIDv7 so the
// user row survives adapter rehydration (UuidV7Generator.validate).
const USER_ID = "01950000-0000-7000-8000-000000000010";
const ACCOUNT_ID = "01950000-0000-7000-8000-000000000011";
const EMAIL = "dev-login@example.com";
const USERNAME = "dev-login";
const NAME = "Dev Login";
const ROLE = "member";

// Satisfies the domain RawPassword invariants (12..128 chars, >=2 of
// letters/digits/symbols) so it also survives a future password change.
const PASSWORD = "DevPassw0rd!2024";

const CREATED_AT = "2024-01-01T00:00:00.000Z";

// Scrypt profile mirrors app/core/adapters/security/scrypt.ts (OWASP second
// tier). hashScrypt's encoding: `$scrypt$ln=..,r=..,p=..$<salt-b64>$<hash-b64>`.
const SCRYPT_LOG_N = 16;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_DK_LEN = 64;
const SCRYPT_SALT_LENGTH = 16;

function bytesToBase64(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function hashScrypt(raw) {
  const salt = new Uint8Array(SCRYPT_SALT_LENGTH);
  globalThis.crypto.getRandomValues(salt);
  const derived = await scryptAsync(raw, salt, {
    N: 1 << SCRYPT_LOG_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    dkLen: SCRYPT_DK_LEN,
  });
  return [
    "",
    "scrypt",
    `ln=${SCRYPT_LOG_N},r=${SCRYPT_R},p=${SCRYPT_P}`,
    bytesToBase64(salt),
    bytesToBase64(derived),
  ].join("$");
}

const passwordHash = await hashScrypt(PASSWORD);

// Drop any *different* user holding our fixed email / username so the unique
// indexes don't abort the upsert; our own USER_ID is excluded. The credential
// row is delete-then-insert (leaf on accounts) so the hash is refreshed and
// any stale row for this email/account is cleared.
const SQL = `
DELETE FROM accounts WHERE id = '${ACCOUNT_ID}' OR (user_id = '${USER_ID}' AND provider_id = 'credential');
DELETE FROM users WHERE (email = '${EMAIL}' OR username = '${USERNAME}') AND id <> '${USER_ID}';
INSERT INTO users (
  id, name, email, email_verified, image, created_at, updated_at,
  username, display_username, role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '${USER_ID}', '${NAME}', '${EMAIL}', 1, NULL, '${CREATED_AT}', '${CREATED_AT}',
  '${USERNAME}', NULL, '${ROLE}', 0, NULL, NULL,
  NULL, NULL, NULL, NULL
)
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
INSERT INTO accounts (
  id, user_id, account_id, provider_id, password,
  access_token, refresh_token, id_token,
  access_token_expires_at, refresh_token_expires_at, scope,
  created_at, updated_at
) VALUES (
  '${ACCOUNT_ID}', '${USER_ID}', '${USER_ID}', 'credential', '${passwordHash}',
  NULL, NULL, NULL,
  NULL, NULL, NULL,
  '${CREATED_AT}', '${CREATED_AT}'
);
`;

const dir = mkdtempSync(join(tmpdir(), "hollow-seed-login-"));
const sqlFile = join(dir, "seed-dev-login.sql");
writeFileSync(sqlFile, SQL);

try {
  execFileSync("pnpm", ["db:execute:local", sqlFile], { stdio: "inherit" });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`
✅ Seeded a password-login-capable user into local D1.

   login URL: http://localhost:<port>/login
   email:     ${EMAIL}     (this is the login identifier)
   password:  ${PASSWORD}
   role:      ${ROLE} (active)

Sign in at /login with the email + password above. To create multiple active
sessions for the same user (needed for /settings/security), log in from two
separate cookie jars / browsers / incognito windows.

Re-run "node scripts/seed-dev-login.mjs" anytime; it is idempotent.
`);
