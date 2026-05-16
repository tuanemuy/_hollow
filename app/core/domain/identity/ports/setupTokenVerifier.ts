/**
 * Verifies the `ADMIN_SETUP_TOKEN` env-configured secret used by
 * `AdminSignUp` to authorise the first / additional admin creation.
 *
 * The token's storage (env var, Secrets Manager binding, etc.) is the
 * adapter's concern. The port surface intentionally exposes only a
 * boolean — no error variants, no metadata — so the usecase cannot
 * branch on the *reason* a verification failed and accidentally leak
 * timing or shape information that helps brute-force the secret.
 */
export interface SetupTokenVerifier {
  /**
   * Whether the underlying secret is configured at all. When `false`,
   * the `/setup` admin-bootstrap surface is expected to be 404'd; the
   * usecase translates `false` into
   * `AuthenticationError('setup_token_disabled')`.
   */
  isEnabled(): boolean;

  /**
   * Constant-time comparison of `rawToken` against the configured
   * secret. Returns `false` when the secret is not configured.
   * Implementations must not throw — every input shape is valid for
   * "return false".
   */
  verify(rawToken: string): boolean;
}
