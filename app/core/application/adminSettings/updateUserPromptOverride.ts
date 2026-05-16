import { UserPromptOverride } from "@/core/domain/adminSettings/entity";
import {
  PromptPurpose,
  PromptTemplate,
  UserId,
} from "@/core/domain/adminSettings/valueObject";
import type { ServiceArgs } from "../types";

export type UpdateUserPromptOverrideInput = {
  actorUserId: string;
  purpose: string;
  template: {
    text: string;
    expectedVariables: readonly string[];
  } | null;
};

export type UpdateUserPromptOverrideOutput = Record<string, never>;

/**
 * Per-user prompt override. Members manage their own overrides — no
 * admin check here; the actor is the owner. The actor's `UserId` is
 * trusted (verified upstream at authentication); the VO factory
 * validates the string shape.
 *
 * Semantics:
 *  - `template !== null` → upsert the per-purpose override. If no row
 *    exists yet, create one.
 *  - `template === null` → clear the override for `purpose`. When the
 *    row exists but already lacks the override, the operation becomes
 *    a no-op (no version bump). When the row does not exist at all,
 *    there is nothing to clear — also a no-op.
 *  - After `clearPrompt`, if the override has no prompts left, the row
 *    is deleted so an empty override does not linger.
 */
export async function updateUserPromptOverride({
  container,
  input,
}: ServiceArgs<UpdateUserPromptOverrideInput>): Promise<UpdateUserPromptOverrideOutput> {
  const now = container.clock.now();
  const ownerId = UserId.create(input.actorUserId);
  const purpose = PromptPurpose.create(input.purpose);
  const template =
    input.template === null
      ? null
      : PromptTemplate.create({
          text: input.template.text,
          expectedVariables: input.template.expectedVariables,
        });

  await container.unitOfWorkProvider.run(
    async ({ userPromptOverrideRepository }) => {
      const existing = await userPromptOverrideRepository.findByOwner(ownerId);

      if (template === null) {
        if (existing === null) return;
        const cleared = UserPromptOverride.clearPrompt(
          existing.entity,
          purpose,
          now,
        );
        if (cleared === existing.entity) return;
        if (Object.keys(cleared.prompts).length === 0) {
          await userPromptOverrideRepository.delete(
            ownerId,
            existing.expectedVersion,
          );
          return;
        }
        await userPromptOverrideRepository.save(
          cleared,
          existing.expectedVersion,
        );
        return;
      }

      if (existing === null) {
        const fresh = UserPromptOverride.create(
          { ownerId: input.actorUserId },
          now,
        );
        const populated = UserPromptOverride.setPrompt(
          fresh,
          purpose,
          template,
          now,
        );
        await userPromptOverrideRepository.insert(populated);
        return;
      }

      const next = UserPromptOverride.setPrompt(
        existing.entity,
        purpose,
        template,
        now,
      );
      await userPromptOverrideRepository.save(next, existing.expectedVersion);
    },
  );

  return {};
}
