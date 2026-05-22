import { InstanceSettings } from "@/core/domain/adminSettings/entity";
import { InstanceLimits } from "@/core/domain/adminSettings/valueObject";
import type { ServiceArgs } from "../types";
import { assertAdmin } from "./authorization";

export type UpdateInstanceLimitsInput = {
  actorUserId: string;
  limits: {
    maxUploadBytesPerDay: number;
    maxIngestionBytes: number;
    maxNoteBytes: number;
    maxExportArtifactBytes: number;
    maxShareLinksPerNote: number;
    editLockTtlSec: number;
    trashRetentionDays: number;
    /** Issue #158: per-note retention ceiling for `NoteRevision` rows. */
    maxNoteRevisionsPerNote: number;
  };
};

export type UpdateInstanceLimitsOutput = Record<string, never>;

/**
 * Replaces the persisted `InstanceLimits`. `InstanceLimits.create`
 * rejects non-positive integers per field with `BusinessRuleError`.
 */
export async function updateInstanceLimits({
  container,
  input,
}: ServiceArgs<UpdateInstanceLimitsInput>): Promise<UpdateInstanceLimitsOutput> {
  const now = container.clock.now();
  const limits = InstanceLimits.create(input.limits);

  await container.unitOfWorkProvider.run(
    async ({ userRepository, instanceSettingsRepository }) => {
      await assertAdmin(userRepository, input.actorUserId);
      const { entity: current, expectedVersion } =
        await instanceSettingsRepository.get();
      const next = InstanceSettings.updateLimits(current, limits, now);
      await instanceSettingsRepository.save(next, expectedVersion);
    },
  );

  return {};
}
