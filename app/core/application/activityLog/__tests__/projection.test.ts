import { describe, expect, it } from "vitest";
import type { EventId } from "@/core/domain/common/event";
import type { InstanceSettingsUpdatedEvent } from "@/core/domain/adminSettings/events";
import { FakeActivityLogRepository } from "../../__tests__/fakes/fakeActivityLogRepository";
import { FakeIdGenerator } from "../../__tests__/fakes/fakeIdGenerator";
import type { ConsumerContainer } from "../../di/types";
import { handleInstanceSettingsUpdatedEvent } from "../handleInstanceSettingsUpdatedEvent";

/**
 * Unit tests for the activity-log projection (Issue #595, AC-7). Covers the
 * `markProcessed`-before-crash double-defence: even a duplicate dispatch of
 * the same `eventId` produces no second row, because `insertIfAbsent` keys
 * on the natural event id (ADR-001).
 */

const FIXED_NOW = new Date("2026-06-17T12:00:00.000Z");

function makeContainer(activityLogRepository: FakeActivityLogRepository): {
  container: ConsumerContainer;
} {
  // Only the fields the handler touches are real; the rest are unused for
  // the settings projection (it needs no UoW lookup).
  const container = {
    activityLogRepository,
    clock: { now: () => FIXED_NOW },
    idGenerator: new FakeIdGenerator(1),
  } as unknown as ConsumerContainer;
  return { container };
}

function updatedEvent(id: string): InstanceSettingsUpdatedEvent {
  return {
    id: id as EventId,
    type: "instance_settings.updated",
    occurredAt: new Date("2026-06-17T11:59:00.000Z"),
    aggregateId: "singleton",
    payload: {
      settingKind: "registration_policy",
      actorId: "01950000-0000-7000-8000-00000000ad01",
      summary: "登録を停止",
    },
  };
}

describe("handleInstanceSettingsUpdatedEvent", () => {
  it("projects one row carrying the setting label and summary", async () => {
    const repo = new FakeActivityLogRepository();
    const { container } = makeContainer(repo);
    await handleInstanceSettingsUpdatedEvent({
      container,
      input: { event: updatedEvent("evt-1") },
    });

    expect(repo.entries).toHaveLength(1);
    expect(repo.entries[0]?.kind).toBe("settings_changed");
    expect(repo.entries[0]?.target).toBe("登録ポリシー");
    expect(repo.entries[0]?.detail).toBe("登録を停止");
    expect(repo.entries[0]?.occurredAt.toISOString()).toBe(
      "2026-06-17T11:59:00.000Z",
    );
  });

  it("is idempotent — a re-delivered eventId produces no second row (AC-7)", async () => {
    const repo = new FakeActivityLogRepository();
    const { container } = makeContainer(repo);
    const event = updatedEvent("evt-dup");

    await handleInstanceSettingsUpdatedEvent({ container, input: { event } });
    await handleInstanceSettingsUpdatedEvent({ container, input: { event } });

    expect(repo.entries).toHaveLength(1);
  });
});
