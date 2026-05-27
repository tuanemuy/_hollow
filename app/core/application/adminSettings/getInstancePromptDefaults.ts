import { BUILTIN_PROMPT_DEFAULTS } from "@/core/domain/adminSettings/defaults";
import { PromptPurpose } from "@/core/domain/adminSettings/valueObject";
import type { PromptDTO } from "../dto/adminSettings";
import type { ServiceArgs } from "../types";

export type GetInstancePromptDefaultsOutput = {
  /**
   * Per-purpose instance-default prompt templates. The map is always
   * keyed by every `PromptPurpose`: when the instance has no override
   * the entry surfaces the built-in default (`isOverridden: false`) so
   * the per-user prompt-override settings page (P23) can render the
   * "inheriting from instance" state without special-casing missing
   * keys. This API contract is preserved as part of Issue #218 — the
   * underlying aggregate moved to a `Partial<Record<>>` model but the
   * DTO stays full-keyed.
   */
  defaults: Readonly<Record<string, PromptDTO>>;
};

/**
 * Read-only projection of the instance-default prompt templates.
 *
 * Unlike {@link getInstanceSettings} this usecase has no admin gate:
 * regular users need access to the instance defaults to render the
 * "inheriting from instance" state on the per-user prompt-override
 * settings page. Only the prompts portion is exposed — secrets
 * (`llm.apiKey*`, `designTokens`, `registration` policy) remain
 * admin-only.
 */
export async function getInstancePromptDefaults({
  container,
}: ServiceArgs<
  Record<string, never>
>): Promise<GetInstancePromptDefaultsOutput> {
  const settings = await container.unitOfWorkProvider.run(
    async ({ instanceSettingsRepository }) => {
      const { entity } = await instanceSettingsRepository.get();
      return entity;
    },
  );
  const defaults: Record<string, PromptDTO> = {};
  for (const purpose of PromptPurpose.values) {
    const override = settings.prompts[purpose];
    if (override !== undefined) {
      defaults[purpose] = {
        text: override.text,
        expectedVariables: [...override.expectedVariables],
        isOverridden: true,
      };
    } else {
      const builtin = BUILTIN_PROMPT_DEFAULTS[purpose];
      defaults[purpose] = {
        text: builtin.text,
        expectedVariables: [...builtin.expectedVariables],
        isOverridden: false,
      };
    }
  }
  return { defaults };
}
