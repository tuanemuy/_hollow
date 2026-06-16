import { InstanceSettings } from "@/core/domain/adminSettings/entity";
import { AdminSettingsEvents } from "@/core/domain/adminSettings/events";
import type { ServiceArgs } from "../types";
import { assertAdmin } from "./authorization";

export type ToggleRegistrationPolicyInput = {
  actorUserId: string;
  open: boolean;
  closedReason: string | null;
};

export type ToggleRegistrationPolicyOutput = Record<string, never>;

/**
 * Flips the public registration switch. When `open === true` the
 * `closedReason` is automatically dropped by `RegistrationPolicy.create`
 * (a reason is meaningless while registration is open), so callers can
 * pass the previous reason verbatim when toggling between states.
 */
export async function toggleRegistrationPolicy({
  container,
  input,
}: ServiceArgs<ToggleRegistrationPolicyInput>): Promise<ToggleRegistrationPolicyOutput> {
  const now = container.clock.now();

  await container.unitOfWorkProvider.run(
    async ({ userRepository, instanceSettingsRepository, collectEvents }) => {
      await assertAdmin(userRepository, input.actorUserId);
      const { entity: current, expectedVersion } =
        await instanceSettingsRepository.get();
      const next = InstanceSettings.setRegistrationOpen(
        current,
        input.open,
        input.closedReason,
        now,
      );
      await instanceSettingsRepository.save(next, expectedVersion);
      collectEvents([
        AdminSettingsEvents.updated(
          "registration_policy",
          input.actorUserId,
          input.open ? "登録を開放" : "登録を停止",
          now,
        ),
      ]);
    },
  );

  return {};
}
