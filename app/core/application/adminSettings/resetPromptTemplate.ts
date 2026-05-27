import { InstanceSettings } from "@/core/domain/adminSettings/entity";
import { PromptPurpose } from "@/core/domain/adminSettings/valueObject";
import type { ServiceArgs } from "../types";
import { assertAdmin } from "./authorization";

export type ResetPromptTemplateInput = {
  actorUserId: string;
  purpose: string;
};

export type ResetPromptTemplateOutput = Record<string, never>;

/**
 * Admin-scoped reset of a single prompt override. Removes the per-purpose
 * override so the purpose falls back to the built-in default (Issue #218
 * ADR-001). A no-op when the purpose currently has no override.
 */
export async function resetPromptTemplate({
  container,
  input,
}: ServiceArgs<ResetPromptTemplateInput>): Promise<ResetPromptTemplateOutput> {
  const now = container.clock.now();
  const purpose = PromptPurpose.create(input.purpose);

  await container.unitOfWorkProvider.run(
    async ({ userRepository, instanceSettingsRepository }) => {
      await assertAdmin(userRepository, input.actorUserId);
      const { entity: current, expectedVersion } =
        await instanceSettingsRepository.get();
      const next = InstanceSettings.resetPrompt(current, purpose, now);
      if (next === current) return;
      await instanceSettingsRepository.save(next, expectedVersion);
    },
  );

  return {};
}
