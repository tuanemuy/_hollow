import { InstanceSettings } from "@/core/domain/adminSettings/entity";
import {
  PromptPurpose,
  PromptTemplate,
} from "@/core/domain/adminSettings/valueObject";
import type { ServiceArgs } from "../types";
import { assertAdmin } from "./authorization";

export type UpdatePromptTemplateInput = {
  actorUserId: string;
  purpose: string;
  template: {
    text: string;
    expectedVariables: readonly string[];
  };
};

export type UpdatePromptTemplateOutput = Record<string, never>;

/**
 * Admin-scoped prompt template update. VO factories
 * (`PromptPurpose.create`, `PromptTemplate.create`) enforce input
 * invariants: invalid purpose / oversize text / placeholder ↔ expected
 * mismatch all surface as `BusinessRuleError`. Errors flow through the
 * usecase unchanged (CLAUDE.md cross-layer catch policy).
 */
export async function updatePromptTemplate({
  container,
  input,
}: ServiceArgs<UpdatePromptTemplateInput>): Promise<UpdatePromptTemplateOutput> {
  const now = container.clock.now();
  const purpose = PromptPurpose.create(input.purpose);
  const template = PromptTemplate.create({
    text: input.template.text,
    expectedVariables: input.template.expectedVariables,
  });

  await container.unitOfWorkProvider.run(
    async ({ userRepository, instanceSettingsRepository }) => {
      await assertAdmin(userRepository, input.actorUserId);
      const { entity: current, expectedVersion } =
        await instanceSettingsRepository.get();
      const next = InstanceSettings.updatePrompt(
        current,
        purpose,
        template,
        now,
      );
      await instanceSettingsRepository.save(next, expectedVersion);
    },
  );

  return {};
}
