import { AdminSettingsService } from "@/core/domain/adminSettings/service";
import { SpeechRecognitionConfig } from "@/core/domain/adminSettings/valueObject";
import type { ServiceArgs } from "../types";
import { assertAdmin } from "./authorization";

/**
 * Optional draft config supplied by the admin form. Mirrors the persisted
 * shape so the page can preview a configuration before committing it.
 */
export type TestSpeechConnectionDraft = Readonly<{
  provider: string;
  model: string;
  apiKeySource: "env" | "db";
  apiKeyCiphertext: string | null;
}>;

export type TestSpeechConnectionInput = {
  actorUserId: string;
  useDraft: boolean;
  draftConfig: TestSpeechConnectionDraft | null;
};

export type TestSpeechConnectionOutput = {
  ok: boolean;
  latencyMs: number;
  error: string | null;
};

/**
 * Pings the upstream speech provider with either the persisted config or
 * the draft preview. Symmetric with {@link testLLMConnection}. The probe is
 * a lightweight model-existence / auth check, NOT a real transcription. The
 * tester contract is "always returns a struct"
 * (no throws), so this usecase folds every outcome into
 * `{ ok, latencyMs, error }`.
 *
 * Api-key resolution preference: env > db. When `adminSpeechEnv.apiKey` is
 * set, the env value wins regardless of the persisted `apiKeySource`.
 */
export async function testSpeechConnection({
  container,
  input,
}: ServiceArgs<TestSpeechConnectionInput>): Promise<TestSpeechConnectionOutput> {
  const cfg = await container.unitOfWorkProvider.run(
    async ({ userRepository, instanceSettingsRepository }) => {
      await assertAdmin(userRepository, input.actorUserId);
      if (input.useDraft) {
        if (input.draftConfig === null) return null;
        return SpeechRecognitionConfig.create({
          provider: input.draftConfig.provider,
          model: input.draftConfig.model,
          apiKeySource: input.draftConfig.apiKeySource,
          apiKeyCiphertext: input.draftConfig.apiKeyCiphertext,
        });
      }
      const { entity } = await instanceSettingsRepository.get();
      return entity.speech;
    },
  );

  if (cfg === null) {
    return {
      ok: false,
      latencyMs: 0,
      error: "Draft configuration is required when useDraft is true",
    };
  }

  const envApiKey = container.adminSpeechEnv.apiKey;
  let resolvedKey: string | null;
  if (envApiKey !== null && envApiKey.length > 0) {
    resolvedKey = envApiKey;
  } else {
    resolvedKey = await AdminSettingsService.decryptSpeechApiKey(
      cfg,
      container.secretBox,
    );
  }

  // Keyless providers (Issue #788, e.g. `deepgram-workers-ai`) have no api key
  // — authentication is the Cloudflare `env.AI` binding. Skip the no-key early
  // return and dispatch to the tester with an empty key so the binding-presence
  // probe (ADR-005) still runs. REST providers keep the strict key requirement.
  const keyless = !SpeechRecognitionConfig.requiresApiKey(cfg.provider);
  if (!keyless && (resolvedKey === null || resolvedKey.trim().length === 0)) {
    return {
      ok: false,
      latencyMs: 0,
      error: "No api key available for the configured speech provider",
    };
  }

  const result = await container.speechConnectionTester.ping(
    cfg,
    resolvedKey ?? "",
  );
  return {
    ok: result.ok,
    latencyMs: result.latencyMs,
    error: result.error ?? null,
  };
}
