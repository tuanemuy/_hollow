import { asc, isNull } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import type { DomainEvent } from "@/core/domain/common/event";
import { UserId } from "@/core/domain/identity/valueObject";
import { NoteEvents } from "@/core/domain/note/events";
import { NoteId } from "@/core/domain/note/valueObject";
import { FakeIdGenerator, FakeLogger } from "../../__tests__/fakes";
import { setupTestContainer } from "../../__tests__/helpers";
import { type EventDispatcher, processOutboxEvents } from "../eventRelayWorker";

const T0 = new Date(0);

const OWNER_ID = UserId.create("0193e7d0-0001-7000-8000-200000000000");

// A `FakeIdGenerator` shared across the file feeds deterministic `NoteId`s.
// Outbox event ids are minted by the container's UoW when drafts are
// buffered — tests no longer thread `EventId` through manually.
const ids = new FakeIdGenerator();
const nextNoteId = (): NoteId => NoteId.create(ids.next());

const makeAllSucceed = (): EventDispatcher =>
  vi.fn(async (events: readonly DomainEvent[]) =>
    events.map((event) => ({ kind: "success" as const, id: event.id })),
  );

const makeAllFail = (error: Error): EventDispatcher =>
  vi.fn(async (events: readonly DomainEvent[]) =>
    events.map((event) => ({
      kind: "failure" as const,
      id: event.id,
      error,
    })),
  );

// Build a simple note.trashed event draft (no FK dependencies in the payload).
function makeTrashedDraft(noteId: NoteId) {
  return NoteEvents.trashed(
    {
      noteId,
      ownerId: OWNER_ID,
      mediaRefs: [],
    },
    T0,
  );
}

describe("processOutboxEvents", () => {
  const getContainer = setupTestContainer();

  it("dispatches decoded events with branded payloads and marks rows processed", async () => {
    const container = getContainer();

    const noteIdA = nextNoteId();
    const noteIdB = nextNoteId();
    const noteIdC = nextNoteId();
    await container.unitOfWorkProvider.run(async ({ collectEvents }) => {
      collectEvents([
        makeTrashedDraft(noteIdA),
        makeTrashedDraft(noteIdB),
        makeTrashedDraft(noteIdC),
      ]);
    });

    const beforeRows = await container.db
      .select()
      .from(schema.outboxEvents)
      .orderBy(asc(schema.outboxEvents.createdAt));
    expect(beforeRows).toHaveLength(3);
    expect(beforeRows.every((r) => r.processedAt === null)).toBe(true);

    const dispatch = makeAllSucceed();
    const { processed } = await processOutboxEvents(container, dispatch);

    expect(processed).toBe(3);
    expect(dispatch).toHaveBeenCalledTimes(1);

    const calls = (
      dispatch as unknown as {
        mock: { calls: ReadonlyArray<readonly unknown[]> };
      }
    ).mock.calls;
    const events = calls[0]?.[0] as ReadonlyArray<{
      type: string;
      payload: unknown;
    }>;
    expect(events.map((e) => e.type)).toEqual([
      "note.trashed",
      "note.trashed",
      "note.trashed",
    ]);

    const afterRows = await container.db.select().from(schema.outboxEvents);
    expect(afterRows.every((r) => r.processedAt !== null)).toBe(true);
  });

  it("returns 0 and does not call the dispatcher when there is nothing to do", async () => {
    const container = getContainer();
    const dispatch = makeAllSucceed();
    const { processed } = await processOutboxEvents(container, dispatch);
    expect(processed).toBe(0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("respects the batchSize option", async () => {
    const container = getContainer();
    const noteId = nextNoteId();
    await container.unitOfWorkProvider.run(async ({ collectEvents }) => {
      collectEvents([
        makeTrashedDraft(noteId),
        makeTrashedDraft(nextNoteId()),
        makeTrashedDraft(nextNoteId()),
      ]);
    });

    const dispatch = makeAllSucceed();
    // `maxIterations: 1` pins single-batch semantics — without it the
    // tick-internal drain loop would pick up the third row in a follow-up
    // batch, hiding the `batchSize` cap this test is exercising.
    const { processed } = await processOutboxEvents(container, dispatch, {
      batchSize: 2,
      maxIterations: 1,
    });

    expect(processed).toBe(2);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const calls = (
      dispatch as unknown as {
        mock: { calls: ReadonlyArray<readonly unknown[]> };
      }
    ).mock.calls;
    expect((calls[0]?.[0] as readonly unknown[]).length).toBe(2);
    const pending = await container.db
      .select({ id: schema.outboxEvents.id })
      .from(schema.outboxEvents)
      .where(isNull(schema.outboxEvents.processedAt));
    expect(pending).toHaveLength(1);
  });

  it("skips events whose type has no registered decoder, keeps batch moving", async () => {
    const container = getContainer();

    await container.db.insert(schema.outboxEvents).values({
      id: "01950000-0000-7000-8000-000000000001",
      eventType: "mystery.happened",
      aggregateId: "01950000-0000-7000-8000-000000000001",
      payload: {},
      occurredAt: new Date(),
      createdAt: new Date(),
    });

    const dispatch = makeAllSucceed();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { processed } = await processOutboxEvents(container, dispatch);
    errorSpy.mockRestore();

    expect(processed).toBe(0);
    expect(dispatch).not.toHaveBeenCalled();

    const rows = await container.db.select().from(schema.outboxEvents);
    expect(rows[0]?.processedAt).toBeNull();
  });

  it("emits a structured error log via the injected Logger on decode failure", async () => {
    const container = getContainer();
    const logger = new FakeLogger();
    const containerWithLogger = { ...container, logger };

    await container.db.insert(schema.outboxEvents).values({
      id: "01950000-0000-7000-8000-000000000099",
      eventType: "mystery.happened",
      aggregateId: "01950000-0000-7000-8000-000000000099",
      payload: {},
      occurredAt: new Date(),
      createdAt: new Date(),
    });

    const dispatch = makeAllSucceed();
    const { processed } = await processOutboxEvents(
      containerWithLogger,
      dispatch,
    );

    expect(processed).toBe(0);
    expect(dispatch).not.toHaveBeenCalled();

    const errors = logger.byLevel("error");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/decode failed/);
    expect(errors[0]?.meta?.eventId).toBe(
      "01950000-0000-7000-8000-000000000099",
    );
    expect(errors[0]?.meta?.eventType).toBe("mystery.happened");
    expect(errors[0]?.meta?.cause).toBeDefined();
  });

  it("skips malformed payloads rather than aborting the batch", async () => {
    const container = getContainer();

    const badId = "01950000-0000-7000-8000-000000000002";
    const goodNoteId = nextNoteId();
    // A malformed payload here violates a still-load-bearing invariant:
    // `noteId` must be non-empty.
    await container.db.insert(schema.outboxEvents).values({
      id: badId,
      eventType: "note.trashed",
      aggregateId: badId,
      payload: { noteId: "", ownerId: OWNER_ID, mediaRefs: [] },
      occurredAt: new Date(0),
      createdAt: new Date(0),
    });
    await container.unitOfWorkProvider.run(async ({ collectEvents }) => {
      collectEvents([makeTrashedDraft(goodNoteId)]);
    });

    const dispatch = makeAllSucceed();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { processed } = await processOutboxEvents(container, dispatch);
    errorSpy.mockRestore();

    expect(processed).toBe(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const calls = (
      dispatch as unknown as {
        mock: { calls: ReadonlyArray<readonly unknown[]> };
      }
    ).mock.calls;
    expect((calls[0]?.[0] as readonly unknown[]).length).toBe(1);

    const rows = await container.db
      .select()
      .from(schema.outboxEvents)
      .orderBy(asc(schema.outboxEvents.createdAt));
    expect(rows[0]?.id).toBe(badId);
    expect(rows[0]?.processedAt).toBeNull();
    expect(rows[1]?.processedAt).not.toBeNull();
  });

  it("tolerates dispatcher failure on one row without dropping the rest of the batch", async () => {
    const container = getContainer();

    const idA = nextNoteId();
    const idB = nextNoteId();
    await container.unitOfWorkProvider.run(async ({ collectEvents }) => {
      collectEvents([makeTrashedDraft(idA), makeTrashedDraft(idB)]);
    });

    const dispatch: EventDispatcher = vi.fn(
      async (events: readonly DomainEvent[]) =>
        events.map((event, index) =>
          index === 0
            ? {
                kind: "failure" as const,
                id: event.id,
                error: new Error("consumer is angry"),
              }
            : { kind: "success" as const, id: event.id },
        ),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { processed } = await processOutboxEvents(container, dispatch);
    errorSpy.mockRestore();

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(processed).toBe(1);

    const rows = await container.db.select().from(schema.outboxEvents);
    const processedRows = rows.filter((r) => r.processedAt !== null);
    const pendingRows = rows.filter((r) => r.processedAt === null);
    expect(processedRows).toHaveLength(1);
    expect(pendingRows).toHaveLength(1);
  });

  it("leaves rows unprocessed when every dispatch fails", async () => {
    const container = getContainer();

    const id = nextNoteId();
    await container.unitOfWorkProvider.run(async ({ collectEvents }) => {
      collectEvents([makeTrashedDraft(id)]);
    });

    const dispatch = makeAllFail(new Error("consumer is always angry"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { processed } = await processOutboxEvents(container, dispatch);
    errorSpy.mockRestore();

    expect(processed).toBe(0);

    const rows = await container.db.select().from(schema.outboxEvents);
    expect(rows[0]?.processedAt).toBeNull();
  });

  it("accepts a caller-supplied decoder registry", async () => {
    const container = getContainer();

    const id = nextNoteId();
    await container.unitOfWorkProvider.run(async ({ collectEvents }) => {
      collectEvents([makeTrashedDraft(id)]);
    });

    const dispatch = makeAllSucceed();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { processed } = await processOutboxEvents(container, dispatch, {
      decoderRegistry: {},
    });
    errorSpy.mockRestore();
    expect(processed).toBe(0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("schedules a backed-off retry after a dispatch failure", async () => {
    const container = getContainer();
    const id = nextNoteId();
    await container.unitOfWorkProvider.run(async ({ collectEvents }) => {
      collectEvents([makeTrashedDraft(id)]);
    });

    const dispatch = makeAllFail(new Error("transient downstream blip"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await processOutboxEvents(container, dispatch, {
      backoffMs: () => 60_000,
    });
    errorSpy.mockRestore();

    const rows = await container.db.select().from(schema.outboxEvents);
    const row = rows[0];
    if (!row) return;
    expect(row.attempts).toBe(1);
    expect(row.processedAt).toBeNull();
    expect(row.failedAt).toBeNull();
    expect(row.lastError).toMatch(/transient downstream blip/);
    expect(row.nextAttemptAt).toBeInstanceOf(Date);
  });

  it("caps a runaway error message before persisting it to last_error", async () => {
    const container = getContainer();
    const id = nextNoteId();
    await container.unitOfWorkProvider.run(async ({ collectEvents }) => {
      collectEvents([makeTrashedDraft(id)]);
    });

    const huge = "x".repeat(20_000);
    const dispatch = makeAllFail(new Error(huge));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await processOutboxEvents(container, dispatch, {
      backoffMs: () => 60_000,
    });
    errorSpy.mockRestore();

    const rows = await container.db.select().from(schema.outboxEvents);
    const row = rows[0];
    if (!row) return;
    expect(row.lastError).not.toBeNull();
    expect(row.lastError?.length ?? 0).toBeLessThanOrEqual(4096);
    expect(row.lastError).toMatch(/…\(truncated\)$/);
  });

  it("excludes rows whose nextAttemptAt is still in the future from claimPending", async () => {
    const container = getContainer();
    const id = nextNoteId();
    await container.unitOfWorkProvider.run(async ({ collectEvents }) => {
      collectEvents([makeTrashedDraft(id)]);
    });

    const failing = makeAllFail(new Error("first failure"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await processOutboxEvents(container, failing, {
      backoffMs: () => 60_000,
    });

    // Second tick immediately after: row is still cooling off, so the
    // worker should skip it without ever calling dispatch again.
    const followUp = makeAllSucceed();
    const { processed } = await processOutboxEvents(container, followUp, {
      backoffMs: () => 60_000,
    });
    errorSpy.mockRestore();

    expect(processed).toBe(0);
    expect(followUp).not.toHaveBeenCalled();
  });

  it("quarantines a row once it crosses the maxAttempts threshold", async () => {
    const container = getContainer();
    const logger = new FakeLogger();
    const containerWithLogger = { ...container, logger };
    const id = nextNoteId();
    await container.unitOfWorkProvider.run(async ({ collectEvents }) => {
      collectEvents([makeTrashedDraft(id)]);
    });

    // Pre-bump the row to one attempt below the cap so a single failing
    // tick is enough to trip the quarantine branch.
    await container.db.update(schema.outboxEvents).set({ attempts: 1 });

    const dispatch = makeAllFail(new Error("still angry"));
    await processOutboxEvents(containerWithLogger, dispatch, {
      maxAttempts: 2,
      backoffMs: () => 60_000,
    });

    const rows = await container.db.select().from(schema.outboxEvents);
    const row = rows[0];
    if (!row) return;
    expect(row.attempts).toBe(2);
    expect(row.failedAt).toBeInstanceOf(Date);
    expect(row.nextAttemptAt).toBeNull();
    expect(row.processedAt).toBeNull();

    const errors = logger.byLevel("error");
    expect(errors.some((e) => /quarantining/.test(e.message))).toBe(true);

    // A subsequent tick must NOT re-pick a quarantined row.
    const followUp = makeAllSucceed();
    const { processed } = await processOutboxEvents(
      containerWithLogger,
      followUp,
    );
    expect(processed).toBe(0);
    expect(followUp).not.toHaveBeenCalled();
  });

  it("quarantines a poison decoder row after the configured attempts", async () => {
    const container = getContainer();
    const poisonId = "01950000-0000-7000-8000-000000000abc";
    await container.db.insert(schema.outboxEvents).values({
      id: poisonId,
      eventType: "mystery.happened",
      aggregateId: poisonId,
      payload: {},
      occurredAt: new Date(0),
      createdAt: new Date(0),
    });

    const dispatch = makeAllSucceed();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // First tick: bumps attempts to 1, schedules retry.
    await processOutboxEvents(container, dispatch, {
      maxAttempts: 2,
      backoffMs: () => 0,
    });
    // Second tick: bumps to 2 → quarantine.
    await processOutboxEvents(container, dispatch, {
      maxAttempts: 2,
      backoffMs: () => 0,
    });
    errorSpy.mockRestore();

    const rows = await container.db.select().from(schema.outboxEvents);
    const row = rows[0];
    if (!row) return;
    expect(row.attempts).toBe(2);
    expect(row.failedAt).toBeInstanceOf(Date);
    expect(row.lastError).toMatch(/No decoder registered/);
  });

  it("hands the whole decoded batch to the dispatcher in a single call", async () => {
    const container = getContainer();
    await container.unitOfWorkProvider.run(async ({ collectEvents }) => {
      collectEvents(
        Array.from({ length: 10 }, () => makeTrashedDraft(nextNoteId())),
      );
    });

    const dispatch = makeAllSucceed();
    const { processed } = await processOutboxEvents(container, dispatch);

    expect(processed).toBe(10);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const calls = (
      dispatch as unknown as {
        mock: { calls: ReadonlyArray<readonly unknown[]> };
      }
    ).mock.calls;
    expect((calls[0]?.[0] as readonly unknown[]).length).toBe(10);
  });

  it("treats a thrown dispatcher as a batch-wide failure", async () => {
    const container = getContainer();
    await container.unitOfWorkProvider.run(async ({ collectEvents }) => {
      collectEvents([
        makeTrashedDraft(nextNoteId()),
        makeTrashedDraft(nextNoteId()),
      ]);
    });

    const dispatch: EventDispatcher = vi.fn(async () => {
      throw new Error("sendBatch refused the whole batch");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { processed } = await processOutboxEvents(container, dispatch, {
      backoffMs: () => 60_000,
    });
    errorSpy.mockRestore();

    expect(processed).toBe(0);
    const rows = await container.db.select().from(schema.outboxEvents);
    expect(rows.every((r) => r.processedAt === null)).toBe(true);
    expect(rows.every((r) => r.attempts === 1)).toBe(true);
    expect(rows.every((r) => r.lastError?.includes("sendBatch refused"))).toBe(
      true,
    );
  });

  it("treats events missing from the dispatcher's outcomes as failures", async () => {
    const container = getContainer();
    await container.unitOfWorkProvider.run(async ({ collectEvents }) => {
      collectEvents([
        makeTrashedDraft(nextNoteId()),
        makeTrashedDraft(nextNoteId()),
      ]);
    });

    const dispatch: EventDispatcher = vi.fn(
      async (events: readonly DomainEvent[]) => {
        const first = events[0];
        if (!first) return [];
        return [{ kind: "success" as const, id: first.id }];
      },
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { processed } = await processOutboxEvents(container, dispatch, {
      backoffMs: () => 60_000,
    });
    errorSpy.mockRestore();

    expect(processed).toBe(1);
    const rows = await container.db
      .select()
      .from(schema.outboxEvents)
      .orderBy(asc(schema.outboxEvents.createdAt));
    expect(rows[0]?.processedAt).not.toBeNull();
    expect(rows[1]?.processedAt).toBeNull();
    expect(rows[1]?.attempts).toBe(1);
    expect(rows[1]?.lastError).toMatch(/no outcome/);
  });
});
