import { scryptAsync } from "@noble/hashes/scrypt.js";
import { v7 as uuidv7 } from "uuid";

const SCRYPT_LOG_N = 16;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_DK_LEN = 64;
const SCRYPT_SALT_LENGTH = 16;

function bytesToBase64(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return Buffer.from(bin, "binary").toString("base64");
}

async function hashScrypt(raw) {
  const salt = new Uint8Array(SCRYPT_SALT_LENGTH);
  crypto.getRandomValues(salt);
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

const password = process.argv[2] ?? "E2eTest!2026";
const now = new Date().toISOString();

const userId = uuidv7();
const accountId = uuidv7();
const rootId = uuidv7();
const parentId = uuidv7();
const childId = uuidv7();

const hash = await hashScrypt(password);

const ids = { userId, accountId, rootId, parentId, childId, now, hash };
console.error(JSON.stringify(ids, null, 2));

function esc(s) {
  return s.replace(/'/g, "''");
}

const sql = `
DELETE FROM directories WHERE owner_id = '${userId}';
DELETE FROM sessions WHERE user_id = '${userId}';
DELETE FROM accounts WHERE user_id = '${userId}';
DELETE FROM users WHERE email = 'e2e-test@example.com';

INSERT INTO users (id, name, email, email_verified, image, created_at, updated_at, username, display_username, role, banned, ban_reason, ban_expires, bio, avatar_media_id, last_username_changed_at, deleted_at)
VALUES ('${userId}', 'E2E Test User', 'e2e-test@example.com', 1, NULL, '${now}', '${now}', 'e2e-test', 'E2E Test User', 'member', 0, NULL, NULL, NULL, NULL, NULL, NULL);

INSERT INTO accounts (id, user_id, account_id, provider_id, password, access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, created_at, updated_at)
VALUES ('${accountId}', '${userId}', '${userId}', 'credential', '${esc(hash)}', NULL, NULL, NULL, NULL, NULL, NULL, '${now}', '${now}');

INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at)
VALUES ('${rootId}', '${userId}', NULL, '', '', 0, 0, '${now}', '${now}');

INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at)
VALUES ('${parentId}', '${userId}', '${rootId}', 'Projects', 'projects', 1, 0, '${now}', '${now}');

INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at)
VALUES ('${childId}', '${userId}', '${parentId}', 'Frontend', 'frontend', 2, 0, '${now}', '${now}');
`;

import { writeFileSync } from "node:fs";
writeFileSync(new URL("./seed.sql", import.meta.url), sql);
writeFileSync(new URL("./seed-ids.json", import.meta.url), JSON.stringify(ids, null, 2));
console.log("WROTE seed.sql and seed-ids.json");
