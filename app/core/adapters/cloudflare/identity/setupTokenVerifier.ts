import type { SetupTokenVerifier } from "@/core/domain/identity/ports/setupTokenVerifier";

/**
 * Env-backed implementation of `SetupTokenVerifier`. Reads the
 * `ADMIN_SETUP_TOKEN` Cloudflare Worker Secret binding and compares it
 * against a candidate in constant time so a timing oracle cannot leak
 * which prefix matched.
 *
 * Contract notes (echoed from the port JSDoc):
 * - `isEnabled()` returns whether the secret is set. The caller maps
 *   the negative case to a 404 on `/setup` and to
 *   `AuthenticationError('setup_token_disabled')` inside `AdminSignUp`.
 * - `verify(token)` returns `false` for any input shape when the
 *   secret is unset; never throws.
 *
 * The `ADMIN_SETUP_TOKEN` env value is supplied via
 * `wrangler secret put ADMIN_SETUP_TOKEN` per ADR 007. Operators are
 * expected to remove it via `wrangler secret delete` once admin
 * onboarding is complete.
 */
export class EnvSetupTokenVerifier implements SetupTokenVerifier {
  private readonly configured: string | null;

  constructor(env: { ADMIN_SETUP_TOKEN?: string | undefined } | undefined) {
    const raw = env?.ADMIN_SETUP_TOKEN;
    // Empty string is treated as unset — accidental empty secrets must
    // not silently enable an "anyone can be admin" mode.
    this.configured = typeof raw === "string" && raw.length > 0 ? raw : null;
  }

  isEnabled(): boolean {
    return this.configured !== null;
  }

  verify(rawToken: string): boolean {
    if (this.configured === null) return false;
    if (typeof rawToken !== "string") return false;
    return timingSafeStringEqual(rawToken, this.configured);
  }
}

/**
 * Constant-time string equality. The loop always runs through the
 * longer of the two operands so that comparisons of mismatched-length
 * inputs leak no more than a single bit (the length itself). For the
 * length-equal case the loop performs the standard XOR-accumulate.
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  const lenA = a.length;
  const lenB = b.length;
  const max = Math.max(lenA, lenB);
  let diff = lenA ^ lenB;
  for (let i = 0; i < max; i++) {
    const ca = i < lenA ? a.charCodeAt(i) : 0;
    const cb = i < lenB ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}
