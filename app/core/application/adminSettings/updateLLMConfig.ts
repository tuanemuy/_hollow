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

  const apiKeyCiphertext =
    input.apiKeyPlain === null
      ? null
      : await container.secretBox.encrypt(input.apiKeyPlain);

  await container.unitOfWorkProvider.run(
    async ({ userRepository, instanceSettingsRepository }) => {
      await assertAdmin(userRepository, input.actorUserId);
      const { entity: current, expectedVersion } =
        await instanceSettingsRepository.get();

      const providerChanged = input.provider !== current.llm.provider;
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
              provider: input.provider,
              model: input.model,
              baseURL: input.baseURL,
              apiKeySource: "db",
              apiKeyCiphertext,
            })
          : LLMConfig.create({
              provider: input.provider,
              model: input.model,
              baseURL: input.baseURL,
              apiKeySource: current.llm.apiKeySource,
              apiKeyCiphertext: current.llm.apiKeyCiphertext,
            });

      const reconciled = AdminSettingsService.assertEnvOverride(
        draft,
        container.adminSettingsEnv,
      );

      const next = InstanceSettings.updateLLM(current, reconciled, now);
      await instanceSettingsRepository.save(next, expectedVersion);
    },
  );

  return {};
}
