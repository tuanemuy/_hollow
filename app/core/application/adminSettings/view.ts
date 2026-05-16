import type { InstanceSettings } from "@/core/domain/adminSettings/entity";
import type { LLMConfig } from "@/core/domain/adminSettings/valueObject";
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
 *   is normally rejected by `LLMConfig.create` but the function tolerates
 *   it defensively.
 */
export function maskApiKey(cfg: LLMConfig): string | null {
  if (cfg.apiKeySource === "env") return null;
  const cipher = cfg.apiKeyCiphertext;
  if (cipher === null) return null;
  const trimmed = cipher.trim();
  if (trimmed.length === 0) return null;
  const tail = trimmed.length >= 4 ? trimmed.slice(-4) : trimmed;
  return `••••${tail}`;
}

export function toInstanceSettingsView(
  settings: InstanceSettings,
): InstanceSettingsDTO {
  return toInstanceSettingsDTO(settings, maskApiKey(settings.llm));
}
