import { scryptAsync } from "@noble/hashes/scrypt.js";

// OWASP scrypt second-tier profile. The first-tier `N=2^17` (~128 MiB)
// would collide with the Workers 128 MiB heap, so we drop one notch.
// See `spec/adr/012-scrypt-migration.md`.
const SCRYPT_LOG_N = 16;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_DK_LEN = 64;
const SCRYPT_SALT_LENGTH = 16;
const SCRYPT_ASYNC_TICK_MS = 10;

const SCRYPT_PREFIX = "$scrypt$";

// Verify-side caps so a malformed/malicious row can't pin the worker
// on huge scrypt work. `ln <= 17` leaves room for a future bump to the
// first-tier profile without changing this file.
const SCRYPT_VERIFY_MAX_LOG_N = 17;
const SCRYPT_VERIFY_MAX_R = 16;
const SCRYPT_VERIFY_MAX_P = 4;
const SCRYPT_VERIFY_MAX_DK_LEN = 128;

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

export function isScryptEncoded(value: string): boolean {
  return value.startsWith(SCRYPT_PREFIX);
}

function parseScryptParams(
  encoded: string,
): { ln: number; r: number; p: number } | null {
  const parts = encoded.split("$");
  if (parts.length < 5) return null;
  const paramSegment = parts[2];
  if (paramSegment === undefined) return null;
  const params: Record<string, number> = {};
  for (const kv of paramSegment.split(",")) {
    const [k, v] = kv.split("=");
    if (k === undefined || v === undefined) return null;
    const n = Number.parseInt(v, 10);
    if (!Number.isInteger(n) || n < 1) return null;
    params[k] = n;
  }
  const ln = params.ln;
  const r = params.r;
  const p = params.p;
  if (ln === undefined || r === undefined || p === undefined) return null;
  if (ln > SCRYPT_VERIFY_MAX_LOG_N) return null;
  if (r > SCRYPT_VERIFY_MAX_R) return null;
  if (p > SCRYPT_VERIFY_MAX_P) return null;
  return { ln, r, p };
}

export async function hashScrypt(raw: string): Promise<string> {
  const salt = new Uint8Array(SCRYPT_SALT_LENGTH);
  globalThis.crypto.getRandomValues(salt);
  const derived = await scryptAsync(raw, salt, {
    N: 1 << SCRYPT_LOG_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    dkLen: SCRYPT_DK_LEN,
    asyncTick: SCRYPT_ASYNC_TICK_MS,
  });
  return [
    "",
    "scrypt",
    `ln=${SCRYPT_LOG_N},r=${SCRYPT_R},p=${SCRYPT_P}`,
    bytesToBase64(salt),
    bytesToBase64(derived),
  ].join("$");
}

export async function verifyScrypt(
  raw: string,
  encoded: string,
): Promise<boolean> {
  if (!isScryptEncoded(encoded)) return false;
  const params = parseScryptParams(encoded);
  if (params === null) return false;
  const parts = encoded.split("$");
  if (parts.length !== 5) return false;
  const saltB64 = parts[3];
  const hashB64 = parts[4];
  if (saltB64 === undefined || hashB64 === undefined) return false;
  const salt = base64ToBytes(saltB64);
  const expected = base64ToBytes(hashB64);
  if (salt === null || expected === null) return false;
  if (expected.length === 0) return false;
  if (expected.length > SCRYPT_VERIFY_MAX_DK_LEN) return false;
  try {
    const derived = await scryptAsync(raw, salt, {
      N: 1 << params.ln,
      r: params.r,
      p: params.p,
      dkLen: expected.length,
      asyncTick: SCRYPT_ASYNC_TICK_MS,
    });
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
