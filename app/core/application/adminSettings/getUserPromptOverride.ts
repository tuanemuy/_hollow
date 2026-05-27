import { UserId } from "@/core/domain/adminSettings/valueObject";
import type { PromptDTO } from "../dto/adminSettings";
import type { ServiceArgs } from "../types";

export type GetUserPromptOverrideInput = {
  actorUserId: string;
};

export type GetUserPromptOverrideOutput = {
  /**
   * Per-purpose override map. Missing keys mean the user has not set
   * an override for that purpose and the instance-default prompt
   * (configured by admins) is in effect.
   */
  prompts: Readonly<Record<string, PromptDTO>>;
};

/**
 * Read the actor's per-user prompt overrides. Returns an empty map
 * when no override row exists yet, so the caller can render the
 * "inherits from instance defaults" state uniformly.
 *
 * No admin check: members manage their own overrides.
 */
export async function getUserPromptOverride({
  container,
  input,
}: ServiceArgs<GetUserPromptOverrideInput>): Promise<GetUserPromptOverrideOutput> {
  const ownerId = UserId.create(input.actorUserId);

  const prompts = await container.unitOfWorkProvider.run(
    async ({ userPromptOverrideRepository }) => {
      const existing = await userPromptOverrideRepository.findByOwner(ownerId);
      if (existing === null) return {} as Record<string, PromptDTO>;
      const out: Record<string, PromptDTO> = {};
      for (const [purpose, template] of Object.entries(
        existing.entity.prompts,
      )) {
        if (template === undefined) continue;
        out[purpose] = {
          text: template.text,
          expectedVariables: [...template.expectedVariables],
          isOverridden: true,
        };
      }
      return out;
    },
  );

  return { prompts };
}
