import { BUILTIN_DESIGN_TOKENS } from "@/core/domain/adminSettings/defaults";
import { InstanceSettings } from "@/core/domain/adminSettings/entity";
import { AdminSettingsEvents } from "@/core/domain/adminSettings/events";
import { DesignTokens } from "@/core/domain/adminSettings/valueObject";
import type { ServiceArgs } from "../types";
import { assertAdmin } from "./authorization";

export type UpdateDesignTokensInput = {
  actorUserId: string;
  tokens: Record<string, string>;
};

export type UpdateDesignTokensOutput = Record<string, never>;

/**
 * Replaces the persisted design tokens wholesale (the VO has no
 * "merge" semantic). Validation lives in `DesignTokens.create`:
 * malformed keys / values surface as `BusinessRuleError`.
 *
 * Entries equal to the built-in default are dropped before persistence so
 * the stored override set only ever holds genuine deviations (Issue #397
 * ADR-003). The `DesignTokens` VO stays unaware of defaults — that knowledge
 * is localised here in the application layer.
 */
export async function updateDesignTokens({
  container,
  input,
}: ServiceArgs<UpdateDesignTokensInput>): Promise<UpdateDesignTokensOutput> {
  const now = container.clock.now();
  const overrides: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.tokens)) {
    if (BUILTIN_DESIGN_TOKENS[key] === value) continue;
    overrides[key] = value;
  }
  const tokens = DesignTokens.create({ tokens: overrides });

  await container.unitOfWorkProvider.run(
    async ({ userRepository, instanceSettingsRepository, collectEvents }) => {
      await assertAdmin(userRepository, input.actorUserId);
      const { entity: current, expectedVersion } =
        await instanceSettingsRepository.get();
      const next = InstanceSettings.updateDesignTokens(current, tokens, now);
      if (next === current) return;
      await instanceSettingsRepository.save(next, expectedVersion);
      collectEvents([
        AdminSettingsEvents.updated(
          "design_tokens",
          input.actorUserId,
          "デザイントークンを更新",
          now,
        ),
      ]);
    },
  );

  return {};
}
