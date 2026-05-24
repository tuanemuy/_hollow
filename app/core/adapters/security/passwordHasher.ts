import type { PasswordHasher } from "@/core/domain/publication/ports/passwordHasher";
import { hashScrypt, isScryptEncoded, verifyScrypt } from "./scrypt";

// Share-link does not implement lazy upgrade for legacy rows — see
// `spec/adr/011-argon2id-migration.md` (ADR-003).
const LEGACY_PBKDF2_PREFIX = "$pbkdf2-sha256$";

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
 * Share-link password hasher.
 *
 * `verify` returns `false` for any failure (mismatch, malformed hash,
 * unknown algorithm) and never throws, so callers cannot infer
 * existence from error shape.
 */
export class ScryptPasswordHasher implements PasswordHasher {
  async hash(raw: string): Promise<string> {
    return hashScrypt(raw);
  }

  async verify(raw: string, hash: string): Promise<boolean> {
    if (isScryptEncoded(hash)) {
      return verifyScrypt(raw, hash);
    }
    if (hash.startsWith(LEGACY_PBKDF2_PREFIX)) {
      return legacyVerifyPbkdf2Sha256(raw, hash);
    }
    return false;
  }
}
