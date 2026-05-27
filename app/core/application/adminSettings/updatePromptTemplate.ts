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
 *
 * Issue #218 ADR-006: when `input.template.text` is empty the user intent is
 * "reset to default", not "save an empty override". We route to
 * `InstanceSettings.resetPrompt` so the domain operation name (`updatePrompt`)
 * always means "install a non-empty override" — illegal states made
 * unrepresentable by routing at the usecase boundary.
 */
export async function updatePromptTemplate({
  container,
  input,
}: ServiceArgs<UpdatePromptTemplateInput>): Promise<UpdatePromptTemplateOutput> {
  const now = container.clock.now();
  const purpose = PromptPurpose.create(input.purpose);
  const isEmpty = input.template.text.length === 0;

  await container.unitOfWorkProvider.run(
    async ({ userRepository, instanceSettingsRepository }) => {
      await assertAdmin(userRepository, input.actorUserId);
      const { entity: current, expectedVersion } =
        await instanceSettingsRepository.get();
      let next: InstanceSettings;
      if (isEmpty) {
        next = InstanceSettings.resetPrompt(current, purpose, now);
      } else {
        const template = PromptTemplate.create({
          text: input.template.text,
          expectedVariables: input.template.expectedVariables,
        });
        next = InstanceSettings.updatePrompt(current, purpose, template, now);
      }
      if (next === current) return;
      await instanceSettingsRepository.save(next, expectedVersion);
    },
  );

  return {};
}
