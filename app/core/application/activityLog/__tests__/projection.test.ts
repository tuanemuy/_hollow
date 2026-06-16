import { describe, expect, it } from "vitest";
import type { InstanceSettingsUpdatedEvent } from "@/core/domain/adminSettings/events";
import type { EventId } from "@/core/domain/common/event";
import type { ExportJobCompletedEvent } from "@/core/domain/export/events";
import type { ExportJobId } from "@/core/domain/export/valueObject";
import type { UserCreatedEvent } from "@/core/domain/identity/events";
import type { UserId } from "@/core/domain/identity/valueObject";
import type {
  IngestionJobCreatedEvent,
  IngestionJobFailedEvent,
} from "@/core/domain/ingestion/events";
import type { IngestionJobId } from "@/core/domain/ingestion/valueObject";
import { FakeActivityLogRepository } from "../../__tests__/fakes/fakeActivityLogRepository";
import { FakeIdGenerator } from "../../__tests__/fakes/fakeIdGenerator";
import type { ConsumerContainer } from "../../di/types";
import { handleExportJobCompletedEvent } from "../handleExportJobCompletedEvent";
import { handleIngestionCreatedEvent } from "../handleIngestionCreatedEvent";
import { handleIngestionFailedEvent } from "../handleIngestionFailedEvent";
import { handleInstanceSettingsUpdatedEvent } from "../handleInstanceSettingsUpdatedEvent";
import { handleUserCreatedEvent } from "../handleUserCreatedEvent";

/**
 * Unit tests for the activity-log projection. Covers the
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
      actorId: "01950000-0000-7000-8000-00000000ad01" as UserId,
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

function ingestionCreatedEvent(id: string): IngestionJobCreatedEvent {
  return {
    id: id as EventId,
    type: "ingestion.created",
    occurredAt: new Date("2026-06-17T11:59:00.000Z"),
    aggregateId: "01950000-0000-7000-8000-0000000000j1",
    payload: {
      jobId: "01950000-0000-7000-8000-0000000000j1" as IngestionJobId,
      kind: "plain",
    },
  } as IngestionJobCreatedEvent;
}

describe("handleIngestionCreatedEvent owner resolution", () => {
  it("skips (records no burst) when the job row is gone and owner cannot be resolved (N-004)", async () => {
    const repo = new FakeActivityLogRepository();
    // UoW lookup returns null — the job has been purged, so there is no
    // owner to attribute the burst to. The handler must early-return without
    // recording a burst (an ownerless burst cannot feed per-owner
    // aggregation).
    const container = {
      activityLogRepository: repo,
      idGenerator: new FakeIdGenerator(1),
      unitOfWorkProvider: {
        run: async <T>(
          fn: (ctx: {
            ingestionJobRepository: { findById: () => Promise<null> };
          }) => Promise<T>,
        ): Promise<T> =>
          fn({ ingestionJobRepository: { findById: async () => null } }),
      },
    } as unknown as ConsumerContainer;

    await handleIngestionCreatedEvent({
      container,
      input: { event: ingestionCreatedEvent("evt-burst-skip") },
    });

    expect(repo.bursts).toHaveLength(0);
  });

  it("records a burst keyed on eventId when the owner resolves", async () => {
    const repo = new FakeActivityLogRepository();
    const container = {
      activityLogRepository: repo,
      idGenerator: new FakeIdGenerator(1),
      unitOfWorkProvider: {
        run: async <T>(
          fn: (ctx: {
            ingestionJobRepository: {
              findById: () => Promise<{ entity: { ownerId: string } }>;
            };
          }) => Promise<T>,
        ): Promise<T> =>
          fn({
            ingestionJobRepository: {
              findById: async () => ({ entity: { ownerId: "owner-1" } }),
            },
          }),
      },
    } as unknown as ConsumerContainer;

    const event = ingestionCreatedEvent("evt-burst-1");
    await handleIngestionCreatedEvent({ container, input: { event } });
    // Re-delivery of the same eventId is a no-op (ADR-005 natural-key insert).
    await handleIngestionCreatedEvent({ container, input: { event } });

    expect(repo.bursts).toHaveLength(1);
    expect(repo.bursts[0]?.ownerId).toBe("owner-1");
    expect(repo.bursts[0]?.eventId).toBe("evt-burst-1");
  });
});

/**
 * Fallback coverage for the three handlers whose `target` / `detail`
 * resolution is otherwise only exercised indirectly via `dispatchDomainEvent`
 * (where they are `vi.mock`ed out). Each asserts both the resolved-entity path
 * (human target) and the entity-absent fallback (raw id target, non-empty
 * detail) so the `||` / `??` selection and label assembly can't regress to an
 * empty string or a formal-only id.
 */

function lookupContainer(repo: FakeActivityLogRepository, entity: unknown) {
  return {
    activityLogRepository: repo,
    clock: { now: () => FIXED_NOW },
    idGenerator: new FakeIdGenerator(1),
    unitOfWorkProvider: {
      run: async <T>(fn: (ctx: never) => Promise<T>): Promise<T> => {
        const findById = async () => (entity === null ? null : { entity });
        return fn({
          ingestionJobRepository: { findById },
          userRepository: { findById },
          exportJobRepository: { findById },
        } as never);
      },
    },
  } as unknown as ConsumerContainer;
}

function failedEvent(id: string): IngestionJobFailedEvent {
  return {
    id: id as EventId,
    type: "ingestion.failed",
    occurredAt: new Date("2026-06-17T11:59:00.000Z"),
    aggregateId: "01950000-0000-7000-8000-0000000000j1",
    payload: {
      jobId: "01950000-0000-7000-8000-0000000000j1" as IngestionJobId,
      errorCode: "decode_error",
      errorReason: "",
    },
  } as IngestionJobFailedEvent;
}

describe("handleIngestionFailedEvent (AC-5 fallback)", () => {
  it("uses the job file name as target and errorReason as detail when resolved", async () => {
    const repo = new FakeActivityLogRepository();
    const container = lookupContainer(repo, {
      ownerId: "owner-1",
      originalFileName: "memo.pdf",
    });
    await handleIngestionFailedEvent({
      container,
      input: {
        event: {
          ...failedEvent("evt-failed-1"),
          payload: {
            jobId: "01950000-0000-7000-8000-0000000000j1" as IngestionJobId,
            errorCode: "decode_error",
            errorReason: "ファイルが壊れています",
          },
        },
      },
    });

    expect(repo.entries[0]?.target).toBe("memo.pdf");
    expect(repo.entries[0]?.detail).toBe("ファイルが壊れています");
    expect(repo.entries[0]?.actorId).toBe("owner-1");
  });

  it("falls back to the raw jobId target and errorCode detail when the job is gone", async () => {
    const repo = new FakeActivityLogRepository();
    const container = lookupContainer(repo, null);
    await handleIngestionFailedEvent({
      container,
      input: { event: failedEvent("evt-failed-2") },
    });

    // errorReason is "" so the `||` selects errorCode (must not be empty).
    expect(repo.entries[0]?.target).toBe(
      "01950000-0000-7000-8000-0000000000j1",
    );
    expect(repo.entries[0]?.detail).toBe("decode_error");
    expect(repo.entries[0]?.actorId).toBeNull();
  });
});

function userCreatedEvent(id: string): UserCreatedEvent {
  return {
    id: id as EventId,
    type: "user.created",
    occurredAt: new Date("2026-06-17T11:59:00.000Z"),
    aggregateId: "01950000-0000-7000-8000-00000000ad01",
    payload: { userId: "01950000-0000-7000-8000-00000000ad01" as UserId },
  } as UserCreatedEvent;
}

describe("handleUserCreatedEvent (AC-5 fallback)", () => {
  it("uses the resolved username as target", async () => {
    const repo = new FakeActivityLogRepository();
    const container = lookupContainer(repo, { username: "alice" });
    await handleUserCreatedEvent({
      container,
      input: { event: userCreatedEvent("evt-user-1") },
    });

    expect(repo.entries[0]?.target).toBe("alice");
    expect(repo.entries[0]?.detail).toBe("新規ユーザーが登録しました");
  });

  it("falls back to the raw userId target when the user is gone", async () => {
    const repo = new FakeActivityLogRepository();
    const container = lookupContainer(repo, null);
    await handleUserCreatedEvent({
      container,
      input: { event: userCreatedEvent("evt-user-2") },
    });

    expect(repo.entries[0]?.target).toBe(
      "01950000-0000-7000-8000-00000000ad01",
    );
  });
});

function exportCompletedEvent(id: string): ExportJobCompletedEvent {
  return {
    id: id as EventId,
    type: "export.job.completed",
    occurredAt: new Date("2026-06-17T11:59:00.000Z"),
    aggregateId: "01950000-0000-7000-8000-0000000000e1",
    payload: {
      exportJobId: "01950000-0000-7000-8000-0000000000e1" as ExportJobId,
      artifactKey: "exports/e1.zip",
      artifactSize: 1024,
    },
  } as ExportJobCompletedEvent;
}

describe("handleExportJobCompletedEvent (AC-5 fallback)", () => {
  it("builds a '<format> エクスポート' target label when resolved", async () => {
    const repo = new FakeActivityLogRepository();
    const container = lookupContainer(repo, {
      ownerId: "owner-1",
      format: "markdown",
    });
    await handleExportJobCompletedEvent({
      container,
      input: { event: exportCompletedEvent("evt-export-1") },
    });

    expect(repo.entries[0]?.target).toBe("markdown エクスポート");
    expect(repo.entries[0]?.detail).toBe("エクスポート完了");
    expect(repo.entries[0]?.actorId).toBe("owner-1");
  });

  it("falls back to the raw exportJobId target when the job is gone", async () => {
    const repo = new FakeActivityLogRepository();
    const container = lookupContainer(repo, null);
    await handleExportJobCompletedEvent({
      container,
      input: { event: exportCompletedEvent("evt-export-2") },
    });

    expect(repo.entries[0]?.target).toBe(
      "01950000-0000-7000-8000-0000000000e1",
    );
    expect(repo.entries[0]?.actorId).toBeNull();
  });
});
