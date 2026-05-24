import { scryptAsync } from "@noble/hashes/scrypt.js";

// OWASP Password Storage Cheat Sheet (2024) scrypt profile, sized for
// Cloudflare Workers Paid plan (30s CPU limit / 128 MiB heap). The
// strict OWASP first recommendation is `N=2^17, r=8, p=1` (~128 MiB),
// which sits exactly on the Workers heap ceiling alongside JS/WASM
// allocations. We back off one notch to `N=2^16` (~64 MiB) so peak
// memory stays well clear; OWASP lists this as the second acceptable
// profile.
//
// `@noble/hashes` is a pure-JS implementation, so this runs without
// the dynamic-WASM-compile restriction that broke the original
// Argon2id (hash-wasm) plan — see Issue #211 / ADR-006.
//
// Source: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt
const SCRYPT_LOG_N = 16;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_DK_LEN = 64;
const SCRYPT_SALT_LENGTH = 16;
// `scryptAsync` yields to the event loop every `asyncTick` ms so long
// hashes do not monopolise the isolate. 10ms is the library default.
const SCRYPT_ASYNC_TICK_MS = 10;

const SCRYPT_PREFIX = "$scrypt$";

// Defense-in-depth caps for parameters carried in a PHC-encoded hash.
// A malformed or malicious row otherwise lets a single verify request
// pin the worker on huge scrypt work. `ln <= 17` allows future tuning
// up to the OWASP first profile without changing this file; `r` and
// `p` are bounded a few notches above the production values.
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

// Constant-time byte comparison. Required so verification timing does
// not leak information about which prefix of the hash matched.
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

// PHC-style encoded form for scrypt:
// `$scrypt$ln=<int>,r=<int>,p=<int>$<salt-b64>$<hash-b64>`.
// scrypt has no IETF-blessed PHC string, so we follow the common
// "$scrypt$ln=,r=,p=" convention used by several PHC implementations.
// Returns `null` if the parameter segment is malformed or any value
// is outside its sane upper bound.
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
