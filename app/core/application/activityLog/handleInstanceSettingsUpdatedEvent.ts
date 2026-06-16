import type { InstanceSettingsUpdatedEvent } from "@/core/domain/adminSettings/events";
import type { ConsumerContainer } from "../di/types";

export type HandleInstanceSettingsUpdatedEventInput = Readonly<{
  event: InstanceSettingsUpdatedEvent;
}>;

/** Human label for each setting slice, used in the "対象" column. */
const SETTING_KIND_LABEL: Record<
  InstanceSettingsUpdatedEvent["payload"]["settingKind"],
  string
> = {
  registration_policy: "登録ポリシー",
  llm_config: "LLM 設定",
  speech_config: "文字起こし設定",
  prompt_template: "プロンプト",
  instance_limits: "インスタンス制限",
  design_tokens: "デザイントークン",
};

/**
 * Project an `instance_settings.updated` event into the activity log
 * (Issue #595, AC-6). The payload already carries `settingKind`, `actorId`
 * and a `summary`, so no lookup is needed — the row is written directly,
 * keyed on `eventId` for idempotency (ADR-001).
 */
export async function handleInstanceSettingsUpdatedEvent({
  container,
  input,
}: {
  container: ConsumerContainer;
  input: HandleInstanceSettingsUpdatedEventInput;
}): Promise<void> {
  const { event } = input;
  const now = container.clock.now();

  await container.activityLogRepository.insertIfAbsent({
    id: container.idGenerator.next(),
    eventId: event.id,
    kind: "settings_changed",
    actorId: event.payload.actorId,
    target: SETTING_KIND_LABEL[event.payload.settingKind],
    detail: event.payload.summary,
    severity: "info",
    occurredAt: event.occurredAt,
    createdAt: now,
  });
}
