import { BusinessRuleError } from "@/core/domain/error";
import { AdminSettingsErrorCode } from "./errorCode";
import type { SecretBox } from "./ports/secretBox";
import { LLMConfig } from "./valueObject";

/**
 * Stateless domain operations on `LLMConfig` that need access to the
 * `SecretBox` port. Kept as plain functions so the domain layer stays
 * dependency-free — callers thread the port explicitly.
 */
export const AdminSettingsService = {
  /**
   * Decrypt the api key for the given config:
   * - `apiKeySource === 'env'`: domain returns `null`; the caller is
   *   expected to source the key from `env.apiKey` directly.
   * - `apiKeySource === 'db'`: decrypt the stored ciphertext via
   *   `secrets.decrypt`.
   */
  decryptApiKey: async (
    cfg: LLMConfig,
    secrets: SecretBox,
  ): Promise<string | null> => {
    if (cfg.apiKeySource === "env") return null;
    if (cfg.apiKeyCiphertext === null) return null;
    return await secrets.decrypt(cfg.apiKeyCiphertext);
  },

  encryptApiKey: async (plain: string, secrets: SecretBox): Promise<string> => {
    return await secrets.encrypt(plain);
  },

  /**
   * Force `apiKeySource = 'env'` when an env-provided api key exists, so
   * runtime resolution always prefers the operator-controlled value. When
   * the env is absent, the config is returned unchanged.
   *
   * The reconciled config carries `provider` and `baseURL` over from
   * `cfg` verbatim — this helper never changes the provider identity or
   * the OpenAI-compatible endpoint. Any invariant violation between the
   * two (e.g. non-null `baseURL` on a non-`openai` provider) is the
   * responsibility of {@link LLMConfig.create}, which is called below
   * and will throw `InvalidLLMBaseURL` if the carry-over breaks the VO
   * invariant.
   */
  assertEnvOverride: (
    cfg: LLMConfig,
    env: Readonly<{ apiKey: string | null }>,
  ): LLMConfig => {
    if (env.apiKey === null || env.apiKey.trim().length === 0) {
      if (cfg.apiKeySource === "env") {
        // Caller declared env source but no env key is available.
        throw new BusinessRuleError(
          AdminSettingsErrorCode.EnvOverrideMissingKey,
          "LLM apiKeySource is 'env' but no env-provided api key is available",
        );
      }
      return cfg;
    }
    if (cfg.apiKeySource === "env") return cfg;
    return LLMConfig.create({
      provider: cfg.provider,
      model: cfg.model,
      baseURL: cfg.baseURL,
      apiKeySource: "env",
      apiKeyCiphertext: null,
    });
  },
};
