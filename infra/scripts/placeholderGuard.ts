/**
 * Shipped dev placeholder guard for the SOPS secrets check.
 *
 * Kept in its own side-effect-free module (separate from the imperative
 * `checkSecrets.ts` CLI, which calls `process.exit` at import time) so the
 * pure function below stays unit-testable.
 */

/**
 * Shipped dev placeholder values that must never reach a real stage secret.
 *
 * The `infra` workspace (`@hollow/infra`) is independent and cannot import
 * `app/core/...`, so these values are duplicated here. Keep them in sync
 * with `SHIPPED_DEV_PLACEHOLDER_KEY` in
 * `app/core/adapters/security/secretBox.ts` and with `.dev.vars.example`
 * (the SSOT on the app side). `SECRET_BOX_MASTER_KEY` is base64 of
 * "dev-only-do-not-use-in-prod-do-1".
 */
export const SHIPPED_DEV_PLACEHOLDER_VALUES: Readonly<Record<string, string>> =
  {
    SECRET_BOX_MASTER_KEY: "ZGV2LW9ubHktZG8tbm90LXVzZS1pbi1wcm9kLWRvLTE=",
  };

/**
 * Detect shipped dev placeholder values in the decrypted secrets and return
 * one violation message per offending key (empty array = OK).
 *
 * Documentation-only keys (`^_`) and absent keys are ignored — only real
 * secret keys set to a known placeholder value are flagged (W-003 / #102).
 */
export function assertNoShippedPlaceholders(
  decoded: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  for (const [key, placeholder] of Object.entries(
    SHIPPED_DEV_PLACEHOLDER_VALUES,
  )) {
    if (key.startsWith("_")) continue;
    if (decoded[key] === placeholder) {
      errors.push(
        `shipped dev placeholder detected for ${key} (replace it with a real secret)`,
      );
    }
  }
  return errors;
}
