import { InstanceSettings } from "@/core/domain/adminSettings/entity";
import { AdminSettingsErrorCode } from "@/core/domain/adminSettings/errorCode";
import { AdminSettingsService } from "@/core/domain/adminSettings/service";
import {
  LLMConfig,
  type LLMProvider,
} from "@/core/domain/adminSettings/valueObject";
import { BusinessRuleError } from "@/core/domain/error";
import type { ServiceArgs } from "../types";
import { assertAdmin } from "./authorization";

export type UpdateLLMConfigInput = {
  actorUserId: string;
  /**
   * Target LLM provider. The usecase replaces the persisted provider
   * outright — there is no "preserve previous provider" path. When the
   * provider changes, the previous ciphertext is no longer valid for the
   * new endpoint, so a fresh `apiKeyPlain` is required (see ADR-008).
   */
  provider: LLMProvider;
  model: string;
  /**
   * OpenAI-compatible endpoint base URL. Must be `null` for non-`openai`
   * providers — the value-object enforces this invariant on `create`.
   */
  baseURL: string | null;
  /**
   * Plain-text api key supplied by the operator. When `null` the
   * existing ciphertext (or env source) is preserved — only the model
   * (and provider, if unchanged) is updated. Encryption happens via
   * `SecretBox.encrypt` inside the usecase so the ciphertext never
   * leaks past the application layer.
   *
   * When the request changes `provider`, `apiKeyPlain` MUST be supplied
   * — the previous ciphertext was encrypted for a different provider's
   * endpoint and is rejected with
   * `AdminSettingsErrorCode.ProviderChangedRequiresApiKey` (ADR-008).
   *
   * When the provider is left unchanged AND `apiKeyPlain` is `null` AND
   * the persisted `apiKeySource === 'env'` AND no env-provided api key
   * is available at the moment of save, `AdminSettingsService.assertEnvOverride`
   * throws `AdminSettingsErrorCode.EnvOverrideMissingKey` — the caller
   * has effectively asked to keep the env source without the env actually
   * carrying a value.
   */
  apiKeyPlain: string | null;
};

export type UpdateLLMConfigOutput = Record<string, never>;

/**
 * Persists a new `LLMConfig` after admin authorization.
 *
 * Flow:
 *  1. Verify the actor is an active admin.
 *  2. Load the existing `InstanceSettings` (the singleton aggregate).
 *  3. If `input.provider !== current.llm.provider` and `apiKeyPlain`
 *     is null, reject with `ProviderChangedRequiresApiKey` (ADR-008) —
 *     the previous ciphertext cannot be reused across providers.
 *  4. If `apiKeyPlain` is non-null, encrypt it via `SecretBox` and use
 *     `apiKeySource = 'db'`. Otherwise preserve the previous source +
 *     ciphertext (only reachable when `provider` is unchanged).
 *  5. If an env-provided LLM api key exists, `assertEnvOverride` forces
 *     `apiKeySource = 'env'` and drops the ciphertext — the env value
 *     always wins so operators can rotate without touching the DB.
 *  6. Save the updated aggregate under the captured OCC token.
 *
 * `SecretBox.encrypt` runs outside the UoW (no transactional rollback
 * possible on Web Crypto), and the encryption result is captured before
 * the UoW begins so the transactional read/write window stays short.
 */
export async function updateLLMConfig({
  container,
  input,
}: ServiceArgs<UpdateLLMConfigInput>): Promise<UpdateLLMConfigOutput> {
  const now = container.clock.now();
  const env = container.adminSettingsEnv;

  // Silent-skip targets per Issue #143 ADR-001 / ADR-005: any LLM field
  // backed by an `ADMIN_LLM_*` env override is held at the persisted DB
  // value rather than rewritten with the input. The encrypted apiKey is
  // a separate axis — `AdminSettingsService.assertEnvOverride` drops it
  // downstream when `env.apiKey` is set, so the upstream encrypt → drop
  // is intentional (cheap web-crypto call, simpler code structure).
  const apiKeyCiphertext =
    input.apiKeyPlain === null
      ? null
      : await container.secretBox.encrypt(input.apiKeyPlain);

  await container.unitOfWorkProvider.run(
    async ({ userRepository, instanceSettingsRepository }) => {
      await assertAdmin(userRepository, input.actorUserId);
      const { entity: current, expectedVersion } =
        await instanceSettingsRepository.get();

      // env override → DB-current value (input + env value both discarded).
      const effectiveProvider: LLMProvider =
        env.provider !== null ? current.llm.provider : input.provider;
      const effectiveModel =
        env.model !== null ? current.llm.model : input.model;
      const effectiveBaseURL =
        env.baseURL !== null ? current.llm.baseURL : input.baseURL;

      // `providerChanged` flips to false when env locks the provider —
      // the operator cannot change a provider that env has pinned, so the
      // "must re-enter api key" guard is dead code in that regime.
      const providerChanged =
        env.provider === null && input.provider !== current.llm.provider;
      if (providerChanged && apiKeyCiphertext === null) {
        throw new BusinessRuleError(
          AdminSettingsErrorCode.ProviderChangedRequiresApiKey,
          "Changing the LLM provider requires re-entering the api key " +
            "because the previous ciphertext is bound to a different provider.",
        );
      }

      const draft: LLMConfig =
        apiKeyCiphertext !== null
          ? LLMConfig.create({
              provider: effectiveProvider,
              model: effectiveModel,
              baseURL: effectiveBaseURL,
              apiKeySource: "db",
              apiKeyCiphertext,
            })
          : LLMConfig.create({
              provider: effectiveProvider,
              model: effectiveModel,
              baseURL: effectiveBaseURL,
              apiKeySource: current.llm.apiKeySource,
              apiKeyCiphertext: current.llm.apiKeyCiphertext,
            });

      const reconciled = AdminSettingsService.assertEnvOverride(draft, env);

      const skippedFields: string[] = [];
      if (env.provider !== null) skippedFields.push("provider");
      if (env.model !== null) skippedFields.push("model");
      if (env.baseURL !== null) skippedFields.push("baseURL");
      if (skippedFields.length > 0) {
        container.logger.warn("admin_llm_env_override_skip", {
          event: "admin_llm_env_override_skip",
          fields: skippedFields,
        });
      }

      const next = InstanceSettings.updateLLM(current, reconciled, now);
      await instanceSettingsRepository.save(next, expectedVersion);
    },
  );

  return {};
}
