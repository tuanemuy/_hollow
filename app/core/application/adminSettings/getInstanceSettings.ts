import type { InstanceSettingsDTO } from "../dto/adminSettings";
import type { ServiceArgs } from "../types";
import { assertAdmin } from "./authorization";
import { toInstanceSettingsView } from "./view";

export type GetInstanceSettingsInput = {
  actorUserId: string;
};

export type GetInstanceSettingsOutput = {
  settings: InstanceSettingsDTO;
};

/**
 * Returns the current `InstanceSettings` projection. The raw
 * `apiKeyCiphertext` is never exposed — `toInstanceSettingsView` masks
 * it before crossing the boundary.
 *
 * Read-only and idempotent, so the operation runs inside a UoW only to
 * share the `userRepository` (for the admin check) and
 * `instanceSettingsRepository` reads against the same database snapshot.
 * No events are emitted.
 */
export async function getInstanceSettings({
  container,
  input,
}: ServiceArgs<GetInstanceSettingsInput>): Promise<GetInstanceSettingsOutput> {
  const settings = await container.unitOfWorkProvider.run(
    async ({ userRepository, instanceSettingsRepository }) => {
      await assertAdmin(userRepository, input.actorUserId);
      const { entity } = await instanceSettingsRepository.get();
      return entity;
    },
  );
  return {
    settings: toInstanceSettingsView(
      settings,
      container.adminSettingsEnv,
      container.adminSpeechEnv,
    ),
  };
}
