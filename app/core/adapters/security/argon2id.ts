import { argon2id, argon2Verify } from "hash-wasm";

// OWASP Password Storage Cheat Sheet (2024) first-recommended Argon2id
// profile. Tuned to Cloudflare Workers Paid plan (30s CPU limit / 128 MiB
// heap); m=19 MiB stays well inside the heap and t=2 keeps a single
// invocation in the 50–150 ms range. The encoded PHC output records all
// parameters, so future tuning does not break existing rows.
//
// Source: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#argon2id
const ARGON2ID_MEMORY_KIB = 19_456; // 19 MiB
const ARGON2ID_ITERATIONS = 2;
const ARGON2ID_PARALLELISM = 1;
const ARGON2ID_HASH_LENGTH = 32;
const ARGON2ID_SALT_LENGTH = 16;

const ARGON2ID_PREFIX = "$argon2id$";

// Defense-in-depth caps for parameters carried in a PHC-encoded hash.
// `hash-wasm` does not enforce upper bounds on m/t/p, so a malformed or
// malicious row (e.g. `$argon2id$v=19$m=999999999,t=999,p=1$...`) would
// otherwise allocate enormous WASM linear memory before failing. We
// allow up to 2× the production memory size and small upper bounds on
// the time / parallelism cost so an attacker who can write to the
// password column cannot turn a verify into a CPU/OOM DoS. These are
// permissive enough that any reasonable future parameter tuning still
// reads back without changing this file.
const ARGON2ID_VERIFY_MAX_MEMORY_KIB = ARGON2ID_MEMORY_KIB * 2;
const ARGON2ID_VERIFY_MAX_ITERATIONS = 16;
const ARGON2ID_VERIFY_MAX_PARALLELISM = 4;

export function isArgon2idEncoded(value: string): boolean {
  return value.startsWith(ARGON2ID_PREFIX);
}

// PHC encoded form for Argon2: `$argon2id$v=19$m=<int>,t=<int>,p=<int>$<salt>$<hash>`.
// Returns `null` if the parameter segment is malformed or any value is
// outside its sane upper bound.
function parseArgon2idParams(
  encoded: string,
): { m: number; t: number; p: number } | null {
  const parts = encoded.split("$");
  if (parts.length < 5) return null;
  const paramSegment = parts[3];
  if (paramSegment === undefined) return null;
  const params: Record<string, number> = {};
  for (const kv of paramSegment.split(",")) {
    const [k, v] = kv.split("=");
    if (k === undefined || v === undefined) return null;
    const n = Number.parseInt(v, 10);
    if (!Number.isInteger(n) || n < 1) return null;
    params[k] = n;
  }
  const m = params.m;
  const t = params.t;
  const p = params.p;
  if (m === undefined || t === undefined || p === undefined) return null;
  if (m > ARGON2ID_VERIFY_MAX_MEMORY_KIB) return null;
  if (t > ARGON2ID_VERIFY_MAX_ITERATIONS) return null;
  if (p > ARGON2ID_VERIFY_MAX_PARALLELISM) return null;
  return { m, t, p };
}

// `hash-wasm` calls `WebAssembly.compile(<base64-decoded module>)`
// lazily at first use. Cloudflare Workers (production) allows that.
// The `vitest-pool-workers` test harness runs workerd with V8's
// `disallow-code-generation-from-strings` extended to WebAssembly, so
// the same call throws `CompileError: Wasm code generation disallowed
// by embedder`. We treat that specific error as "WASM is not
// available in this environment" so callers can decide to fall back.
// See `spec/adr/011-argon2id-migration.md` (ADR-005).
//
// Detection relies on workerd's exact error message — if workerd ever
// changes the wording, real CompileErrors could be misclassified as
// `WasmUnavailableError`, silently downgrading production hashes to
// the PBKDF2 fallback. To make that drift loud rather than silent we
// `console.warn` whenever this branch fires; in production logs that
// warning should never appear, so its presence is a tripwire.
export class WasmUnavailableError extends Error {
  readonly cause: unknown;
  constructor(cause: unknown) {
    super("WebAssembly dynamic code generation is disallowed by the embedder");
    this.name = "WasmUnavailableError";
    this.cause = cause;
  }
}

function isWasmDisallowedError(err: unknown): boolean {
  if (err instanceof Error) {
    const name = err.name;
    const message = err.message;
    if (
      name === "CompileError" &&
      /code generation disallowed by embedder/i.test(message)
    ) {
      console.warn(
        "[argon2id] WebAssembly compile rejected by the embedder — falling back to PBKDF2. This should only fire in vitest-pool-workers, not production.",
      );
      return true;
    }
  }
  return false;
}

export async function hashArgon2id(raw: string): Promise<string> {
  const salt = new Uint8Array(ARGON2ID_SALT_LENGTH);
  globalThis.crypto.getRandomValues(salt);
  try {
    return await argon2id({
      password: raw,
      salt,
      parallelism: ARGON2ID_PARALLELISM,
      iterations: ARGON2ID_ITERATIONS,
      memorySize: ARGON2ID_MEMORY_KIB,
      hashLength: ARGON2ID_HASH_LENGTH,
      outputType: "encoded",
    });
  } catch (err) {
    if (isWasmDisallowedError(err)) {
      throw new WasmUnavailableError(err);
    }
    throw err;
  }
}

export async function verifyArgon2id(
  raw: string,
  encoded: string,
): Promise<boolean> {
  if (!isArgon2idEncoded(encoded)) return false;
  if (parseArgon2idParams(encoded) === null) return false;
  try {
    return await argon2Verify({ password: raw, hash: encoded });
  } catch (err) {
    if (isWasmDisallowedError(err)) {
      throw new WasmUnavailableError(err);
    }
    return false;
  }
}
