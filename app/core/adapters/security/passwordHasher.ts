import type { PasswordHasher } from "@/core/domain/publication/ports/passwordHasher";

// ---------------------------------------------------------------------------
// Password hashing — share-link verification
// ---------------------------------------------------------------------------
//
// The port's contract requires a self-describing hash string that records
// the algorithm and its cost factors so `verify` can re-derive them. The
// chosen target is Argon2id (memory-hard, recommended for password storage),
// but the Cloudflare Workers runtime has no first-party Argon2 binding and
// the project does not currently depend on a Workers-compatible WASM build
// of it (e.g. `hash-wasm`). To keep the adapter shippable today, the
// implementation uses PBKDF2-HMAC-SHA256 via the standard Web Crypto API,
// which is universally available on Workers, Node and browsers.
//
// The serialised format is intentionally PHC-style so the future swap to
// Argon2id is a drop-in (a new prefix added to `verify`, with PBKDF2
// records still verifying for legacy rows):
//
//   $pbkdf2-sha256$i=<iterations>$<saltB64>$<hashB64>
//
// Parameter choices:
//   - iterations: 600_000  (OWASP 2025 recommendation for PBKDF2-SHA256)
//   - salt length: 16 bytes (random per hash)
//   - derived key length: 32 bytes (256 bits)
//
// NOTE (future): replace PBKDF2 with Argon2id once a Workers-compatible
// dependency (e.g. `hash-wasm`) is acceptable. Keep verifying PBKDF2
// records during transition so existing share-link passwords keep working
// until they are rotated.

const PBKDF2_PREFIX = "$pbkdf2-sha256$";
const DEFAULT_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const HASH_BITS = KEY_BYTES * 8;

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      "Web Crypto SubtleCrypto is unavailable; PasswordHasher requires a runtime with globalThis.crypto.subtle",
    );
  }
  return subtle;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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

async function deriveBits(
  subtle: SubtleCrypto,
  raw: string,
  salt: Uint8Array,
  iterations: number,
  bits: number,
): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(raw);
  // Copy into a freshly-allocated ArrayBuffer so the typing is narrowed to
  // `ArrayBuffer` (not `ArrayBufferLike`) — `SubtleCrypto` parameters in
  // the strict `@cloudflare/workers-types` lib reject `SharedArrayBuffer`.
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
    bits,
  );
  return new Uint8Array(derived);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Stateless password hasher used by share-link verification.
 *
 * Named for the target algorithm (Argon2id) even though the current
 * implementation falls back to PBKDF2-HMAC-SHA256 via Web Crypto. The
 * stored format is self-describing (`$pbkdf2-sha256$i=…$salt$hash`), so a
 * later swap to Argon2id can add a new prefix without invalidating any
 * existing rows: `verify` simply branches on the prefix.
 *
 * `verify` never throws; any malformed input (wrong prefix, bad base64,
 * non-numeric iterations) returns `false` so the caller cannot infer
 * existence from error shape.
 */
export class Argon2idPasswordHasher implements PasswordHasher {
  constructor(
    private readonly iterations: number = DEFAULT_ITERATIONS,
    private readonly subtle: SubtleCrypto = getSubtle(),
  ) {
    if (
      !Number.isInteger(iterations) ||
      iterations < 1 ||
      iterations > 10_000_000
    ) {
      throw new Error(`Invalid PBKDF2 iteration count: ${iterations}`);
    }
  }

  async hash(raw: string): Promise<string> {
    const salt = new Uint8Array(SALT_BYTES);
    globalThis.crypto.getRandomValues(salt);
    const derived = await deriveBits(
      this.subtle,
      raw,
      salt,
      this.iterations,
      HASH_BITS,
    );
    return `${PBKDF2_PREFIX}i=${this.iterations}$${toBase64(salt)}$${toBase64(derived)}`;
  }

  async verify(raw: string, hash: string): Promise<boolean> {
    if (!hash.startsWith(PBKDF2_PREFIX)) {
      return false;
    }
    const body = hash.slice(PBKDF2_PREFIX.length);
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
      const derived = await deriveBits(
        this.subtle,
        raw,
        salt,
        iterations,
        expected.length * 8,
      );
      return timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }
}
