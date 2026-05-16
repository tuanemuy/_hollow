import type { PromptDTO } from "../dto/adminSettings";
import type { ServiceArgs } from "../types";

export type GetInstancePromptDefaultsOutput = {
  /** Per-purpose instance-default prompt templates. */
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
  for (const [purpose, template] of Object.entries(settings.prompts)) {
    defaults[purpose] = {
      text: template.text,
      expectedVariables: [...template.expectedVariables],
    };
  }
  return { defaults };
}
