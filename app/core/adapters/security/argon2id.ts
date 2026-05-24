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

export function isArgon2idEncoded(value: string): boolean {
  return value.startsWith(ARGON2ID_PREFIX);
}

// `hash-wasm` calls `WebAssembly.compile(<base64-decoded module>)`
// lazily at first use. Cloudflare Workers (production) allows that.
// The `vitest-pool-workers` test harness runs workerd with V8's
// `disallow-code-generation-from-strings` extended to WebAssembly, so
// the same call throws `CompileError: Wasm code generation disallowed
// by embedder`. We treat that specific error as "WASM is not
// available in this environment" so callers can decide to fall back.
// See `spec/adr/011-argon2id-migration.md` (ADR-005).
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
    return (
      name === "CompileError" &&
      /code generation disallowed by embedder/i.test(message)
    );
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
  try {
    return await argon2Verify({ password: raw, hash: encoded });
  } catch (err) {
    if (isWasmDisallowedError(err)) {
      throw new WasmUnavailableError(err);
    }
    return false;
  }
}
