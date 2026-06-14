import type { InstanceSettings } from "@/core/domain/adminSettings/entity";
import type { AdminSettingsEnv, AdminSpeechEnv } from "../di/types";
import {
  type InstanceSettingsDTO,
  toInstanceSettingsDTO,
} from "../dto/adminSettings";

/**
 * Render a stable masked representation of an `LLMConfig` for the admin
 * UI. The raw ciphertext (when `apiKeySource === 'db'`) never leaves the
 * application layer — the mask is a digest-shaped placeholder that hints
 * "a key is stored" without revealing the entropy.
 *
 * - `apiKeySource === 'env'`: returns `null`. The env value is opaque to
 *   the admin page; the page renders "environment" instead of any mask.
 * - `apiKeySource === 'db'`: returns `"••••" + last4(ciphertext)` when
 *   the ciphertext is long enough, else `"••••"`. The last 4 base64
 *   chars are stable across reads but carry negligible entropy.
 * - `apiKeySource === 'db'` but `apiKeyCiphertext === null`: returns
 *   `null` so the UI does not falsely suggest a stored key. This shape
 *   is normally rejected by `*Config.create` but the function tolerates
 *   it defensively.
 *
 * Accepts the structural `{ apiKeySource, apiKeyCiphertext }` shape rather
 * than a concrete VO so both `LLMConfig` and `SpeechRecognitionConfig`
 * masking flow through one helper (Issue #701 ADR-003).
 */
export function maskApiKey(
  cfg: Readonly<{
    apiKeySource: "env" | "db";
    apiKeyCiphertext: string | null;
  }>,
): string | null {
  if (cfg.apiKeySource === "env") return null;
  const cipher = cfg.apiKeyCiphertext;
  if (cipher === null) return null;
  const trimmed = cipher.trim();
  if (trimmed.length === 0) return null;
  const tail = trimmed.length >= 4 ? trimmed.slice(-4) : trimmed;
  return `••••${tail}`;
}

/**
 * Project an `InstanceSettings` aggregate into the admin-UI DTO,
 * overlaying `AdminSettingsEnv` so env-locked fields surface their
 * runtime-effective value and the per-field `envOverrides` flags.
 *
 * `env` is optional so callers without a container (legacy fixtures,
 * domain-layer tests) keep working — `null` means "no env overrides
 * known", and the DTO falls back to the DB values verbatim.
 */
export function toInstanceSettingsView(
  settings: InstanceSettings,
  env: AdminSettingsEnv | null = null,
  speechEnv: AdminSpeechEnv | null = null,
): InstanceSettingsDTO {
  // Defense-in-depth: when env.apiKey is set, the env value wins at runtime
  // and the persisted ciphertext is irrelevant to the UI. Skip masking
  // entirely so a stale DB cipher never makes the round-trip into the DTO
  // (`toInstanceSettingsDTO` also nulls `apiKeyMasked` when envOverrides.apiKey,
  // this is the upstream belt to that suspenders).
  const apiKeyMasked = env?.apiKey ? null : maskApiKey(settings.llm);
  const speechApiKeyMasked = speechEnv?.apiKey
    ? null
    : maskApiKey(settings.speech);
  return toInstanceSettingsDTO(
    settings,
    apiKeyMasked,
    env,
    speechApiKeyMasked,
    speechEnv,
  );
}
