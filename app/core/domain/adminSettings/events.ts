import type { DomainEventBase, EventDraft } from "@/core/domain/common/event";
import { INSTANCE_SETTINGS_ID } from "./entity";

/**
 * Discriminator for which slice of the instance settings changed. A single
 * `instance_settings.updated` event carries this so the activity-log
 * projection can render a concrete "対象" without one event type per setting
 * (ADR-003). The union mirrors the inventory of emitting adminSettings
 * usecases (see adr.md B-6).
 */
export type InstanceSettingKind =
  | "registration_policy"
  | "llm_config"
  | "speech_config"
  | "prompt_template"
  | "instance_limits"
  | "design_tokens";

export type InstanceSettingsUpdatedEvent = DomainEventBase<
  "instance_settings.updated",
  Readonly<{
    settingKind: InstanceSettingKind;
    /** User id of the admin who performed the change (the "対象"/actor). */
    actorId: string;
    /** Short human summary for the "詳細" column. */
    summary: string;
  }>
>;

export type AdminSettingsEvent = InstanceSettingsUpdatedEvent;

/**
 * Identity-less draft factory. `EventId` is attached by the application
 * layer's `collectEvents` path inside the UoW, so the domain stays free of
 * `IdGenerator` concerns. The `InstanceSettings` aggregate itself does not
 * emit these — they are pure change-notification events collected at the
 * usecase boundary (ADR-006), so the factory takes the primitives the
 * usecases already hold.
 */
export const AdminSettingsEvents = {
  updated: (
    settingKind: InstanceSettingKind,
    actorId: string,
    summary: string,
    occurredAt: Date,
  ): EventDraft<InstanceSettingsUpdatedEvent> => ({
    type: "instance_settings.updated",
    payload: { settingKind, actorId, summary },
    occurredAt,
    aggregateId: INSTANCE_SETTINGS_ID,
  }),
};
