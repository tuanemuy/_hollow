import { AdminSettingsService } from "@/core/domain/adminSettings/service";
import { LLMConfig } from "@/core/domain/adminSettings/valueObject";
import type { ServiceArgs } from "../types";
import { assertAdmin } from "./authorization";

/**
 * Optional draft config supplied by the admin form. Mirrors the
 * persisted shape so the page can preview a configuration before
 * committing it to storage.
 */
export type TestLLMConnectionDraft = Readonly<{
  provider: string;
  model: string;
  /**
   * OpenAI-compatible endpoint base URL. Always `null` for non-`openai`
   * providers (the value-object enforces the invariant on `create`).
   * Carried through `LLMConfig.create` so the draft preview hits the
   * same endpoint the persisted config would.
   */
  baseURL: string | null;
  apiKeySource: "env" | "db";
  apiKeyCiphertext: string | null;
}>;

export type TestLLMConnectionInput = {
  actorUserId: string;
  useDraft: boolean;
  /**
   * When `useDraft === true`, supply a `draftConfig`. The usecase
   * accepts a `null` draft (treated as a no-op preview that surfaces
   * `ok: false` with an explanatory message) so the wire schema can
   * carry it as a single optional field rather than splitting the
   * input shape into two variants.
   */
  draftConfig: TestLLMConnectionDraft | null;
};

export type TestLLMConnectionOutput = {
  ok: boolean;
  latencyMs: number;
  error: string | null;
};

/**
 * Pings the upstream LLM provider with either the persisted config or
 * the draft preview. The tester contract is "always returns a struct"
 * (no throws), so this usecase folds every outcome — including missing
 * api key — into the `{ ok, latencyMs, error }` triple. The admin UI
 * renders the struct uniformly without an error boundary.
 *
 * Api-key resolution preference:
 *   env > db. When `adminSettingsEnv.apiKey` is set, the env value
 *   wins regardless of the persisted `apiKeySource`. Otherwise the
 *   stored ciphertext is decrypted via `SecretBox.decrypt`.
 */
export async function testLLMConnection({
  container,
  input,
}: ServiceArgs<TestLLMConnectionInput>): Promise<TestLLMConnectionOutput> {
  const cfg = await container.unitOfWorkProvider.run(
    async ({ userRepository, instanceSettingsRepository }) => {
      await assertAdmin(userRepository, input.actorUserId);
      if (input.useDraft) {
        if (input.draftConfig === null) return null;
        return LLMConfig.create({
          provider: input.draftConfig.provider,
          model: input.draftConfig.model,
          baseURL: input.draftConfig.baseURL,
          apiKeySource: input.draftConfig.apiKeySource,
          apiKeyCiphertext: input.draftConfig.apiKeyCiphertext,
        });
      }
      const { entity } = await instanceSettingsRepository.get();
      return entity.llm;
    },
  );

  if (cfg === null) {
    return {
      ok: false,
      latencyMs: 0,
      error: "Draft configuration is required when useDraft is true",
    };
  }

  const envApiKey = container.adminSettingsEnv.apiKey;
  let resolvedKey: string | null;
  if (envApiKey !== null && envApiKey.length > 0) {
    resolvedKey = envApiKey;
  } else {
    resolvedKey = await AdminSettingsService.decryptApiKey(
      cfg,
      container.secretBox,
    );
  }

  if (resolvedKey === null || resolvedKey.trim().length === 0) {
    return {
      ok: false,
      latencyMs: 0,
      error: "No api key available for the configured LLM provider",
    };
  }

  const result = await container.llmConnectionTester.ping(cfg, resolvedKey);
  return {
    ok: result.ok,
    latencyMs: result.latencyMs,
    error: result.error ?? null,
  };
}
