import { InstanceSettings } from "@/core/domain/adminSettings/entity";
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
 */
export async function updateDesignTokens({
  container,
  input,
}: ServiceArgs<UpdateDesignTokensInput>): Promise<UpdateDesignTokensOutput> {
  const now = container.clock.now();
  const tokens = DesignTokens.create({ tokens: input.tokens });

  await container.unitOfWorkProvider.run(
    async ({ userRepository, instanceSettingsRepository }) => {
      await assertAdmin(userRepository, input.actorUserId);
      const { entity: current, expectedVersion } =
        await instanceSettingsRepository.get();
      const next = InstanceSettings.updateDesignTokens(current, tokens, now);
      if (next === current) return;
      await instanceSettingsRepository.save(next, expectedVersion);
    },
  );

  return {};
}
