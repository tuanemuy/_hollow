import type { PasswordHasher } from "@/core/domain/publication/ports/passwordHasher";
import {
  hashArgon2id,
  isArgon2idEncoded,
  verifyArgon2id,
  WasmUnavailableError,
} from "./argon2id";

// ---------------------------------------------------------------------------
// Password hashing — share-link verification
// ---------------------------------------------------------------------------
//
// New hashes are Argon2id (via `hash-wasm`, see `./argon2id.ts`) encoded
// in PHC format (`$argon2id$v=19$m=...,t=...,p=...$salt$hash`). The
// memory-hard KDF replaces the previous PBKDF2-SHA256 fallback now that
// a Workers-compatible Argon2 implementation is available.
//
// `verify` keeps accepting the legacy PBKDF2 format
// (`$pbkdf2-sha256$i=<iter>$<saltB64>$<hashB64>`) so existing share-link
// rows continue to authenticate without forced re-hash. The share-link
// path does not implement lazy upgrade — see
// `spec/adr/011-argon2id-migration.md` (ADR-003).
//
// Environments without WebAssembly dynamic compile (specifically the
// `vitest-pool-workers` test harness — see ADR-005) fall back to a
// PBKDF2 hash for `hash()`. Production Cloudflare Workers always
// allows WASM compile, so the fallback never fires in prod.

const LEGACY_PBKDF2_PREFIX = "$pbkdf2-sha256$";
const PBKDF2_FALLBACK_ITERATIONS = 600_000;

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      "Web Crypto SubtleCrypto is unavailable; PasswordHasher requires a runtime with globalThis.crypto.subtle",
    );
  }
  return subtle;
}

function fromBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function legacyHashPbkdf2Sha256(raw: string): Promise<string> {
  const subtle = getSubtle();
  const salt = new Uint8Array(16);
  globalThis.crypto.getRandomValues(salt);
  const encoded = new TextEncoder().encode(raw);
  const keyBuffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(keyBuffer).set(encoded);
  const saltBuffer = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltBuffer).set(salt);
  const key = await subtle.importKey(
    "raw",
    keyBuffer,
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const derived = await subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: saltBuffer,
      iterations: PBKDF2_FALLBACK_ITERATIONS,
    },
    key,
    256,
  );
  return `${LEGACY_PBKDF2_PREFIX}i=${PBKDF2_FALLBACK_ITERATIONS}$${toBase64(salt)}$${toBase64(new Uint8Array(derived))}`;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function legacyVerifyPbkdf2Sha256(
  raw: string,
  hash: string,
): Promise<boolean> {
  if (!hash.startsWith(LEGACY_PBKDF2_PREFIX)) return false;
  const body = hash.slice(LEGACY_PBKDF2_PREFIX.length);
  const parts = body.split("$");
  if (parts.length !== 3) return false;
  const [paramSegment, saltB64, hashB64] = parts;
  if (!paramSegment.startsWith("i=")) return false;
  const iterations = Number.parseInt(paramSegment.slice(2), 10);
  if (
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    iterations > 10_000_000
  ) {
    return false;
  }
  const salt = fromBase64(saltB64);
  const expected = fromBase64(hashB64);
  if (salt === null || expected === null) return false;
  if (expected.length === 0) return false;
  try {
    const subtle = getSubtle();
    const encoded = new TextEncoder().encode(raw);
    const keyBuffer = new ArrayBuffer(encoded.byteLength);
    new Uint8Array(keyBuffer).set(encoded);
    const saltBuffer = new ArrayBuffer(salt.byteLength);
    new Uint8Array(saltBuffer).set(salt);
    const key = await subtle.importKey(
      "raw",
      keyBuffer,
      { name: "PBKDF2" },
      false,
      ["deriveBits"],
    );
    const derived = await subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: saltBuffer,
        iterations,
      },
      key,
      expected.length * 8,
    );
    return timingSafeEqual(new Uint8Array(derived), expected);
  } catch {
    return false;
  }
}

/**
 * Stateless password hasher used by share-link verification.
 *
 * `hash` produces an Argon2id PHC-encoded string. `verify` branches on
 * the prefix: Argon2id records go through `verifyArgon2id`, legacy
 * PBKDF2-SHA256 records (issued before the migration in Issue #206) go
 * through an internal verify path. Anything unrecognised returns
 * `false`; the method never throws so callers cannot infer existence
 * from error shape.
 */
export class Argon2idPasswordHasher implements PasswordHasher {
  async hash(raw: string): Promise<string> {
    try {
      return await hashArgon2id(raw);
    } catch (err) {
      if (err instanceof WasmUnavailableError) {
        return legacyHashPbkdf2Sha256(raw);
      }
      throw err;
    }
  }

  async verify(raw: string, hash: string): Promise<boolean> {
    if (isArgon2idEncoded(hash)) {
      try {
        return await verifyArgon2id(raw, hash);
      } catch (err) {
        if (err instanceof WasmUnavailableError) return false;
        throw err;
      }
    }
    if (hash.startsWith(LEGACY_PBKDF2_PREFIX)) {
      return legacyVerifyPbkdf2Sha256(raw, hash);
    }
    return false;
  }
}
