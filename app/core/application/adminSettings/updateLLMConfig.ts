import { InstanceSettings } from "@/core/domain/adminSettings/entity";
import { AdminSettingsService } from "@/core/domain/adminSettings/service";
import { LLMConfig } from "@/core/domain/adminSettings/valueObject";
import type { ServiceArgs } from "../types";
import { assertAdmin } from "./authorization";

export type UpdateLLMConfigInput = {
  actorUserId: string;
  model: string;
  /**
   * Plain-text api key supplied by the operator. When `null` the
   * existing ciphertext (or env source) is preserved — only the model
   * is updated. Encryption happens via `SecretBox.encrypt` inside the
   * usecase so the ciphertext never leaks past the application layer.
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
 *  3. If `apiKeyPlain` is non-null, encrypt it via `SecretBox` and use
 *     `apiKeySource = 'db'`. Otherwise preserve the previous source +
 *     ciphertext.
 *  4. If an env-provided LLM api key exists, `assertEnvOverride` forces
 *     `apiKeySource = 'env'` and drops the ciphertext — the env value
 *     always wins so operators can rotate without touching the DB.
 *  5. Save the updated aggregate under the captured OCC token.
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

      const draft: LLMConfig =
        apiKeyCiphertext !== null
          ? LLMConfig.create({
              provider: current.llm.provider,
              model: input.model,
              apiKeySource: "db",
              apiKeyCiphertext,
            })
          : LLMConfig.create({
              provider: current.llm.provider,
              model: input.model,
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
