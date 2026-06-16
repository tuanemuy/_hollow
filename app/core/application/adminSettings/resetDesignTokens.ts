import { InstanceSettings } from "@/core/domain/adminSettings/entity";
import { AdminSettingsEvents } from "@/core/domain/adminSettings/events";
import type { ServiceArgs } from "../types";
import { assertAdmin } from "./authorization";

export type ResetDesignTokensInput = {
  actorUserId: string;
};

export type ResetDesignTokensOutput = Record<string, never>;

/**
 * Restores `DesignTokens` to the empty default (no overrides). The
 * frontend falls back to the built-in CSS variables defined in the
 * stylesheet when the persisted map is empty.
 */
export async function resetDesignTokens({
  container,
  input,
}: ServiceArgs<ResetDesignTokensInput>): Promise<ResetDesignTokensOutput> {
  const now = container.clock.now();

  await container.unitOfWorkProvider.run(
    async ({ userRepository, instanceSettingsRepository, collectEvents }) => {
      await assertAdmin(userRepository, input.actorUserId);
      const { entity: current, expectedVersion } =
        await instanceSettingsRepository.get();
      const next = InstanceSettings.resetDesignTokens(current, now);
      await instanceSettingsRepository.save(next, expectedVersion);
      // Only emit when the reset actually changed something — a reset of an
      // already-empty token set is a logical no-op (`next === current`).
      if (next !== current) {
        collectEvents([
          AdminSettingsEvents.updated(
            "design_tokens",
            input.actorUserId,
            "デザイントークンをリセット",
            now,
          ),
        ]);
      }
    },
  );

  return {};
}
