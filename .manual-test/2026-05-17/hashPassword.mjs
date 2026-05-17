// Generates PBKDF2-SHA256 hashes for seed accounts using the same
// parameters as app/core/adapters/d1/repositories/credentialStore.ts.
// Format: `pbkdf2-sha256-v1$<iter>$<salt-b64>$<hash-b64>`
//
// Usage: `node hashPassword.mjs` prints a JSON map { label: hash }.
// All seed accounts share the password `Password123!` for test convenience.
import { webcrypto as crypto } from "node:crypto";

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_KEY_BYTES = 32;
const PBKDF2_HASH = "SHA-256";
const PBKDF2_ENCODING_VERSION = "pbkdf2-sha256-v1";

function bytesToBase64(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return Buffer.from(bin, "binary").toString("base64");
}

async function hashPassword(raw) {
  const salt = new Uint8Array(PBKDF2_SALT_BYTES);
  crypto.getRandomValues(salt);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(raw),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    PBKDF2_KEY_BYTES * 8,
  );
  return [
    PBKDF2_ENCODING_VERSION,
    String(PBKDF2_ITERATIONS),
    bytesToBase64(salt),
    bytesToBase64(new Uint8Array(derived)),
  ].join("$");
}

const accounts = [
  // Baseline (NEVER mutated by any TC — used for login + as collision targets)
  { label: "existing-user", password: "Password123!" },
  { label: "mailowner", password: "Password123!" },
  { label: "admin-user", password: "Password123!" },
  // Throwaway accounts — each consumed by exactly one destructive TC
  { label: "tc-rename-a", password: "Password123!" }, // TC-A4-02
  { label: "tc-rename-b", password: "Password123!" }, // TC-A4-03 (login as this; rename target is existing-user)
  { label: "tc-rename-c", password: "Password123!" }, // TC-A4-05 (rate limit; renamed twice)
  { label: "tc-delete-a", password: "Password123!" }, // TC-A5-01
  { label: "tc-email-a", password: "Password123!" }, // TC-A6-01
  { label: "tc-email-b", password: "Password123!" }, // TC-A6-04
  { label: "tc-password-a", password: "Password123!" }, // TC-A3-01
  // Pre-state accounts
  { label: "tc-unverified", password: "Password123!" }, // TC-A2-03 (email_verified=0)
  { label: "tc-suspended", password: "Password123!" }, // TC-A2-04 (banned=1)
];

const out = {};
for (const a of accounts) {
  out[a.label] = await hashPassword(a.password);
}
process.stdout.write(JSON.stringify(out, null, 2));
