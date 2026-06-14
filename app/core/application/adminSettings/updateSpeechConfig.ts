import { InstanceSettings } from "@/core/domain/adminSettings/entity";
import { AdminSettingsErrorCode } from "@/core/domain/adminSettings/errorCode";
import { AdminSettingsService } from "@/core/domain/adminSettings/service";
import {
  type SpeechProvider,
  SpeechRecognitionConfig,
} from "@/core/domain/adminSettings/valueObject";
import { BusinessRuleError } from "@/core/domain/error";
import type { ServiceArgs } from "../types";
import { assertAdmin } from "./authorization";

export type UpdateSpeechConfigInput = {
  actorUserId: string;
  /**
   * Target speech provider. The usecase replaces the persisted provider
   * outright. When the provider changes, the previous ciphertext is no
   * longer valid, so a fresh `apiKeyPlain` is required (symmetric with
   * `updateLLMConfig`).
   */
  provider: SpeechProvider;
  model: string;
  /**
   * Plain-text api key supplied by the operator. When `null` the existing
   * ciphertext (or env source) is preserved. When the request changes
   * `provider`, `apiKeyPlain` MUST be supplied. Encryption happens via
   * `SecretBox.encrypt` inside the usecase.
   */
  apiKeyPlain: string | null;
};

export type UpdateSpeechConfigOutput = Record<string, never>;

/**
 * Persists a new `SpeechRecognitionConfig` after admin authorization.
 * Symmetric with {@link updateLLMConfig} (no `baseURL` axis).
 */
export async function updateSpeechConfig({
  container,
  input,
}: ServiceArgs<UpdateSpeechConfigInput>): Promise<UpdateSpeechConfigOutput> {
  const now = container.clock.now();
  const env = container.adminSpeechEnv;

  // Silent-skip + assertSpeechEnvOverride drop the ciphertext downstream
  // when `env.apiKey` is set, so the upstream encrypt → drop is intentional
  // (admin-gated, cheap web-crypto call, simpler control flow).
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
      const effectiveProvider: SpeechProvider =
        env.provider !== null ? current.speech.provider : input.provider;
      const effectiveModel =
        env.model !== null ? current.speech.model : input.model;

      // `providerChanged` flips to false when env locks the provider.
      const providerChanged =
        env.provider === null && input.provider !== current.speech.provider;
      if (providerChanged && apiKeyCiphertext === null) {
        throw new BusinessRuleError(
          AdminSettingsErrorCode.SpeechProviderChangedRequiresApiKey,
          "Changing the speech provider requires re-entering the api key " +
            "because the previous ciphertext is bound to a different provider.",
        );
      }

      const draft: SpeechRecognitionConfig =
        apiKeyCiphertext !== null
          ? SpeechRecognitionConfig.create({
              provider: effectiveProvider,
              model: effectiveModel,
              apiKeySource: "db",
              apiKeyCiphertext,
            })
          : SpeechRecognitionConfig.create({
              provider: effectiveProvider,
              model: effectiveModel,
              apiKeySource: current.speech.apiKeySource,
              apiKeyCiphertext: current.speech.apiKeyCiphertext,
            });

      const reconciled = AdminSettingsService.assertSpeechEnvOverride(
        draft,
        env,
      );

      const skippedFields: string[] = [];
      if (env.provider !== null) skippedFields.push("provider");
      if (env.model !== null) skippedFields.push("model");
      if (skippedFields.length > 0) {
        // payload は field 名のみ（env 値 / input 値 / ciphertext を含めない）。
        container.logger.warn("admin_speech_env_override_skip", {
          fields: skippedFields,
        });
      }

      const next = InstanceSettings.updateSpeech(current, reconciled, now);
      await instanceSettingsRepository.save(next, expectedVersion);
    },
  );

  return {};
}
