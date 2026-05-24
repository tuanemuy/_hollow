/**
 * Hashing primitive used by share-link password verification.
 *
 * Unlike `CredentialStore` (identity), this port has no notion of
 * "current user" — share-link passwords are stored on the link row
 * directly, so the domain just needs a stateless hash / verify pair.
 *
 * `hash` is expected to produce a self-describing string that includes
 * algorithm parameters (e.g. scrypt with `$scrypt$ln=...,r=...,p=...$`
 * prefix) so `verify` can re-derive the cost factors. Adapters are
 * free to use any algorithm that satisfies that contract.
 */
export interface PasswordHasher {
  hash(raw: string): Promise<string>;
  /**
   * Returns `false` for any failure (mismatch, malformed hash,
   * unsupported algorithm) — never throws — so callers cannot leak
   * existence via error-shape differences.
   */
  verify(raw: string, hash: string): Promise<boolean>;
}
