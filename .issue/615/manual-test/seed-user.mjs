/**
 * One-off seed for Issue #615 (P22 session list richness) browser verification.
 *
 * Creates a single password-login-capable, email-verified test user
 * (`test-615@example.com`) into the local dev D1 so it can sign in at /login
 * and produce a real "このセッション" cookie-backed session. The extra
 * differing-userAgent sessions are injected separately by seed-sessions.sql.
 *
 * Scrypt hashing mirrors scripts/seed-dev-login.mjs / the project's
 * app/core/adapters/security/scrypt.ts (OWASP second tier). Local dev only;
 * idempotent (upsert on the fixed UUIDv7 ids).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scryptAsync } from "@noble/hashes/scrypt.js";

const USER_ID = "01951615-0000-7000-8000-000000000001";
const ACCOUNT_ID = "01951615-0000-7000-8000-000000000002";
const EMAIL = "test-615@example.com";
const USERNAME = "test-615";
const NAME = "Test 615";
const ROLE = "member";

// Satisfies RawPassword invariants (12..128 chars, mixed classes).
const PASSWORD = "Test615Passw0rd!";

const CREATED_AT = "2024-01-01T00:00:00.000Z";

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

const dir = mkdtempSync(join(tmpdir(), "hollow-seed-615-"));
const sqlFile = join(dir, "seed-user-615.sql");
writeFileSync(sqlFile, SQL);

try {
  execFileSync("pnpm", ["db:execute:local", sqlFile], { stdio: "inherit" });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n✅ Seeded test-615 user.\n   email:    ${EMAIL}\n   password: ${PASSWORD}\n   user_id:  ${USER_ID}\n`);
