import { InstanceSettings } from "@/core/domain/adminSettings/entity";
import { AdminSettingsEvents } from "@/core/domain/adminSettings/events";
import type { ServiceArgs } from "../types";
import { assertAdmin } from "./authorization";

export type ResetAllPromptTemplatesInput = {
  actorUserId: string;
};

export type ResetAllPromptTemplatesOutput = Record<string, never>;

/**
 * Admin-scoped reset of all prompt overrides at once. Clears every per-purpose
 * override so all purposes fall back to their built-in defaults (Issue #218
 * ADR-001). A no-op when no overrides exist.
 */
export async function resetAllPromptTemplates({
  container,
  input,
}: ServiceArgs<ResetAllPromptTemplatesInput>): Promise<ResetAllPromptTemplatesOutput> {
  const now = container.clock.now();

  await container.unitOfWorkProvider.run(
    async ({ userRepository, instanceSettingsRepository, collectEvents }) => {
      const actor = await assertAdmin(userRepository, input.actorUserId);
      const { entity: current, expectedVersion } =
        await instanceSettingsRepository.get();
      const next = InstanceSettings.resetAllPrompts(current, now);
      if (next === current) return;
      await instanceSettingsRepository.save(next, expectedVersion);
      collectEvents([
        AdminSettingsEvents.updated(
          "prompt_template",
          actor.id,
          "すべてのプロンプトをリセット",
          now,
        ),
      ]);
    },
  );

  return {};
}
