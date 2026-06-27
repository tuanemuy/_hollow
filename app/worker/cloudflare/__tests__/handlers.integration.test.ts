import {
  createExecutionContext,
  createMessageBatch,
  env,
  getQueueResult,
} from "cloudflare:test";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { R2TempFileStorage } from "@/core/adapters/cloudflare/r2TempFileStorage";
import { getDatabase } from "@/core/adapters/d1/client";
import { PendingBatch } from "@/core/adapters/d1/pendingBatch";
import { D1ActivityLogRepository } from "@/core/adapters/d1/repositories/activityLogRepository";
import { D1IdempotencyStore } from "@/core/adapters/d1/repositories/idempotencyStore";
import { D1LlmCallLogRecorder } from "@/core/adapters/d1/repositories/llmCallLogRecorder";
import { D1OutboxRepository } from "@/core/adapters/d1/repositories/outboxRepository";
import {
  directories,
  exportJobs,
  indexJobs,
  ingestionJobs,
  llmCallLog,
  notes,
  outboxEvents,
  processedEvents,
  publicationStates,
  searchDocuments,
  tagMergeJobs,
  users,
} from "@/core/adapters/d1/schema";
import { StubLLMProvider } from "@/core/adapters/stub/llmProvider";
import { createWorkerContainer } from "@/core/application/di/serverCloudflare";
import { processIndexJobs } from "@/core/application/workers/processIndexJobs";
import {
  type DomainEvent,
  type EventDraft,
  EventId,
} from "@/core/domain/common/event";
import { UserId } from "@/core/domain/identity/valueObject";
import { LLMRateLimitError } from "@/core/domain/ingestion/ports/llmProvider";
import { NoteEvents } from "@/core/domain/note/events";
import { NoteId } from "@/core/domain/note/valueObject";
import { PublicationEvents } from "@/core/domain/publication/events";
import {
  type ConsumerEnv,
  type DlqEnv,
  handleDlq,
  handleQueue,
  type PrunerEnv,
  type RelayEnv,
  runPruneTick,
  runRelayTick,
} from "../handlers";

// End-to-end integration of the per-Worker handler functions against
// a real D1 binding and a real Miniflare queue. Tests target the pure
// `runRelayTick` / `runPruneTick` / `handleQueue` functions directly
// rather than going through any Worker entry — entries are 1-line
// adapters and have nothing to verify beyond their type signature.
//
// The fetch handler is intentionally not exercised; it lives in the
// main app Worker (`app/worker.ts`) and is gated on TanStack Start's
// build pipeline.

const OWNER_ID = UserId.create("0193e7d0-0001-7000-8000-200000000000");

let counter = 0;
const nextEventId = (): EventId => {
  counter += 1;
  return EventId.create(
    `0193e7d0-${counter.toString(16).padStart(4, "0")}-7000-a000-400000000000`,
  );
};
const nextNoteId = () => {
  counter += 1;
  return NoteId.create(
    `0193e7d0-${counter.toString(16).padStart(4, "0")}-7000-a000-500000000000`,
  );
};
const withId = <TEvent extends DomainEvent>(
  draft: EventDraft<TEvent>,
): TEvent => ({ ...draft, id: nextEventId() }) as TEvent;

function makeTrashedDraft(noteId: NoteId) {
  return NoteEvents.trashed(
    {
      noteId,
      ownerId: OWNER_ID,
      mediaRefs: [],
    },
    new Date(),
  );
}

// IDs must satisfy the UUIDv7 validator used by D1 repositories on
// rehydration (`app/core/application/ports/idGenerator.ts`): the third
// group starts with `7`, the fourth with one of `89ab`.
let userSeq = 0;
function nextOwnerId(): string {
  userSeq += 1;
  return `0193e7d0-${userSeq.toString(16).padStart(4, "0")}-7000-b000-600000000000`;
}

let jobSeq = 0;
function nextIngestionJobId(): string {
  jobSeq += 1;
  return `0193e7d0-${jobSeq.toString(16).padStart(4, "0")}-7000-b000-700000000000`;
}
function nextExportJobId(): string {
  jobSeq += 1;
  return `0193e7d0-${jobSeq.toString(16).padStart(4, "0")}-7000-b000-800000000000`;
}

async function seedOwner(ownerId: string): Promise<void> {
  const db = getDatabase(env.DB);
  const suffix = ownerId.slice(-6);
  await db.insert(users).values({
    id: ownerId,
    name: `user-${suffix}`,
    email: `user-${suffix}@example.test`,
    emailVerified: 1,
    username: `user_${suffix}`,
    role: "member",
    banned: 0,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  });
}

async function seedPendingIngestionJob(params: {
  ownerId: string;
  jobId: string;
  kind: string;
}): Promise<void> {
  const db = getDatabase(env.DB);
  await db.insert(ingestionJobs).values({
    id: params.jobId,
    ownerId: params.ownerId,
    originalFileName: "doc.html",
    mimeType: "text/html",
    byteSize: 16,
    kind: params.kind,
    status: "pending",
    tempStorageKey: `${params.ownerId}/ingestion/${params.jobId}`,
    previewJson: null,
    errorCode: null,
    errorReason: null,
    regenerationCount: 0,
    savedAsNoteId: null,
    version: 0,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  });
}

async function seedPendingExportJob(params: {
  ownerId: string;
  jobId: string;
}): Promise<void> {
  const db = getDatabase(env.DB);
  // `scope = "multiple"` requires `targetNoteIds.length > 0` per the
  // domain invariants (see `assertScopeTargetShape`). The seeded note
  // id need not exist — the dispatch only needs the row to rehydrate
  // and transition to `processing`; `resolveTargetNotes` will then
  // return an empty set and the job moves to `failed`.
  const placeholderNoteId = `0193e7d0-${(jobSeq + 1).toString(16).padStart(4, "0")}-7000-a000-900000000000`;
  await db.insert(exportJobs).values({
    id: params.jobId,
    ownerId: params.ownerId,
    format: "html",
    scope: "multiple",
    targetNoteIdsJson: JSON.stringify([placeholderNoteId]),
    viewQueryJson: null,
    optionsJson: JSON.stringify({
      includeFrontMatter: false,
      embedMedia: false,
      pdfPaperSize: null,
    }),
    status: "pending",
    artifactKey: null,
    artifactSize: null,
    errorCode: null,
    errorReason: null,
    progressProcessed: 0,
    progressTotal: 0,
    failedNoteIdsJson: JSON.stringify([]),
    version: 0,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    completedAt: null,
    expiresAt: null,
  });
}

async function seedLlmCallLog(params: {
  id: string;
  occurredAt: Date;
}): Promise<void> {
  const db = getDatabase(env.DB);
  await db.insert(llmCallLog).values({
    id: params.id,
    ownerId: OWNER_ID,
    provider: "anthropic",
    occurredAt: params.occurredAt.toISOString(),
    createdAt: params.occurredAt,
  });
}

let terminalExportSeq = 0;
async function seedExportJobRow(params: {
  status: string;
  updatedAt: string;
}): Promise<string> {
  terminalExportSeq += 1;
  const db = getDatabase(env.DB);
  const id = `0193e7d0-${terminalExportSeq.toString(16).padStart(4, "0")}-7000-c000-100000000000`;
  await db.insert(exportJobs).values({
    id,
    ownerId: OWNER_ID,
    format: "html",
    scope: "single",
    optionsJson: "{}",
    status: params.status,
    // `completed` carries a live artifact in production; seed one so a
    // regression that prunes `completed` would visibly orphan it.
    artifactKey:
      params.status === "completed" ? `${OWNER_ID}/export/${id}` : null,
    version: 0,
    createdAt: new Date(0).toISOString(),
    updatedAt: params.updatedAt,
    expiresAt: null,
  });
  return id;
}

let terminalMergeSeq = 0;
async function seedTagMergeJobRow(params: {
  status: string;
  updatedAt: string;
}): Promise<string> {
  terminalMergeSeq += 1;
  const db = getDatabase(env.DB);
  const id = `0193e7d0-${terminalMergeSeq.toString(16).padStart(4, "0")}-7000-c000-200000000000`;
  await db.insert(tagMergeJobs).values({
    id,
    ownerId: OWNER_ID,
    sourceTagId: "0193e7d0-0000-7000-c000-300000000001",
    targetTagId: "0193e7d0-0000-7000-c000-300000000002",
    status: params.status,
    version: 0,
    createdAt: new Date(0).toISOString(),
    updatedAt: params.updatedAt,
  });
  return id;
}

async function seedOutbox(events: readonly DomainEvent[]): Promise<void> {
  const db = getDatabase(env.DB);
  const pending = new PendingBatch(db);
  const repo = new D1OutboxRepository(
    db,
    {
      next: () => "unused",
      validate: () => true,
    },
    { now: () => new Date() },
    pending,
  );
  await repo.save(events);
  if (!pending.isEmpty()) {
    await db.batch(pending.build());
  }
}

const relayEnv = (): RelayEnv => env as unknown as RelayEnv;
const prunerEnv = (): PrunerEnv => env as unknown as PrunerEnv;
const consumerEnv = (): ConsumerEnv => env as unknown as ConsumerEnv;
const dlqEnv = (): DlqEnv => env as unknown as DlqEnv;

// `vitest.config.integration.ts` registers `TEMP_FILES` via
// `miniflare.r2Buckets`, so it is always present at runtime. The
// generated `Cloudflare.Env` types it as optional (wrangler treats
// top-level `[[r2_buckets]]` as optional in the worker env shape),
// so this thin accessor narrows the type for tests without leaning
// on a non-null assertion at every call site. Return type is inferred
// from the global `Cloudflare.Env.TEMP_FILES` binding type rather than
// imported from `@cloudflare/workers-types` — the two have a known
// surface-level skew (workerd vs npm types) that breaks assignment.
type TempFilesBucket = NonNullable<typeof env.TEMP_FILES>;
function tempFilesBinding(): TempFilesBucket {
  if (!env.TEMP_FILES) {
    throw new Error(
      "TEMP_FILES binding missing — check vitest.config.integration.ts",
    );
  }
  return env.TEMP_FILES;
}

describe("relay producer Worker — runRelayTick", () => {
  it("claims pending outbox rows, sends them to the queue, and marks processed", async () => {
    const noteId = nextNoteId();
    const event = withId(makeTrashedDraft(noteId));
    await seedOutbox([event]);

    const result = await runRelayTick(relayEnv());
    expect(result.processed).toBe(1);

    const db = getDatabase(env.DB);
    const rows = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, event.id));
    expect(rows[0]?.processedAt).not.toBeNull();
    expect(rows[0]?.attempts).toBe(0);
  });

  it("is a no-op when the outbox has no pending rows", async () => {
    const result = await runRelayTick(relayEnv());
    expect(result.processed).toBe(0);
  });
});

describe("pruner Worker — runPruneTick", () => {
  it("deletes processed rows older than the retention window", async () => {
    const noteId = nextNoteId();
    const event = withId(makeTrashedDraft(noteId));
    await seedOutbox([event]);

    const db = getDatabase(env.DB);
    // Mark processed well before the 7-day retention window.
    const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await db
      .update(outboxEvents)
      .set({ processedAt: longAgo })
      .where(eq(outboxEvents.id, event.id));

    const result = await runPruneTick(prunerEnv());
    expect(result.outboxDeleted).toBe(1);

    const remaining = await db.select().from(outboxEvents);
    expect(remaining).toHaveLength(0);
  });

  it("retains processed rows newer than the retention window", async () => {
    const noteId = nextNoteId();
    const event = withId(makeTrashedDraft(noteId));
    await seedOutbox([event]);

    const db = getDatabase(env.DB);
    const recent = new Date(Date.now() - 60 * 1000); // 1 min ago
    await db
      .update(outboxEvents)
      .set({ processedAt: recent })
      .where(eq(outboxEvents.id, event.id));

    const result = await runPruneTick(prunerEnv());
    expect(result.outboxDeleted).toBe(0);

    const remaining = await db.select().from(outboxEvents);
    expect(remaining).toHaveLength(1);
  });

  it("prunes processed_events records older than the retention window and retains recent ones", async () => {
    const db = getDatabase(env.DB);
    // Default processed-events retention is 14 days; stamp one row well
    // beyond it and one inside it.
    const beyond = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recent = new Date(Date.now() - 60 * 1000); // 1 min ago
    const staleId = EventId.create("0193e7d0-9001-7000-9000-700000000001");
    const freshId = EventId.create("0193e7d0-9002-7000-9000-700000000002");
    await db.insert(processedEvents).values([
      { id: staleId, processedAt: beyond },
      { id: freshId, processedAt: recent },
    ]);

    const result = await runPruneTick(prunerEnv());
    expect(result.processedEventsDeleted).toBe(1);

    const remaining = await db.select().from(processedEvents);
    expect(remaining.map((r) => r.id)).toEqual([freshId]);
  });

  it("sweeps outbox and processed_events in the same tick", async () => {
    const noteId = nextNoteId();
    const event = withId(makeTrashedDraft(noteId));
    await seedOutbox([event]);

    const db = getDatabase(env.DB);
    const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await db
      .update(outboxEvents)
      .set({ processedAt: longAgo })
      .where(eq(outboxEvents.id, event.id));
    await db.insert(processedEvents).values({
      id: EventId.create("0193e7d0-9003-7000-9000-700000000003"),
      processedAt: longAgo,
    });

    const result = await runPruneTick(prunerEnv());
    expect(result).toEqual({ outboxDeleted: 1, processedEventsDeleted: 1 });

    expect(await db.select().from(outboxEvents)).toHaveLength(0);
    expect(await db.select().from(processedEvents)).toHaveLength(0);
  });

  // #748 ADR-005 / arch[S-003]: the activity-log prune and the
  // llm_call_log prune run in independent try/catch blocks inside
  // `runPruneTick`. A failure in one must not block the other, nor the
  // (already-committed) outbox prune. These tests inject a failure into one
  // prune and assert the other still completes its delete.
  it("isolates an activity-log prune failure: llm_call_log prune still runs and outbox count is returned", async () => {
    // Seed an outbox row well past the retention window so the outbox prune
    // (which runs first and is unaffected) has something to delete.
    const noteId = nextNoteId();
    const event = withId(makeTrashedDraft(noteId));
    await seedOutbox([event]);
    const db = getDatabase(env.DB);
    const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await db
      .update(outboxEvents)
      .set({ processedAt: longAgo })
      .where(eq(outboxEvents.id, event.id));

    // Seed an llm_call_log row older than the 48h retention window so the
    // llm prune has a row to delete once it is reached.
    const llmId = "0193e7d0-0fa1-7000-8000-2000000000a1";
    await seedLlmCallLog({
      id: llmId,
      occurredAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
    });

    // Make the activity-log prune throw. The llm prune lives in a separate
    // try/catch, so it must still run to completion.
    const activitySpy = vi
      .spyOn(D1ActivityLogRepository.prototype, "pruneOlderThan")
      .mockRejectedValue(new Error("activity prune boom"));

    const result = await runPruneTick(prunerEnv());

    // Outbox prune (runs first, unaffected) still reports its delete.
    expect(result.outboxDeleted).toBe(1);
    expect(activitySpy).toHaveBeenCalled();

    // The llm_call_log prune ran despite the activity-log failure.
    const llmRemaining = await db
      .select()
      .from(llmCallLog)
      .where(eq(llmCallLog.id, llmId));
    expect(llmRemaining).toHaveLength(0);
  });

  it("isolates an llm_call_log prune failure: activity-log prune still runs and outbox count is returned", async () => {
    const noteId = nextNoteId();
    const event = withId(makeTrashedDraft(noteId));
    await seedOutbox([event]);
    const db = getDatabase(env.DB);
    const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await db
      .update(outboxEvents)
      .set({ processedAt: longAgo })
      .where(eq(outboxEvents.id, event.id));

    // Make the llm_call_log prune throw. The activity-log prune (which runs
    // before it, in its own try/catch) must still complete; assert that via
    // a spy on its delete call rather than a row count, since the activity
    // tables may legitimately be empty here.
    const activitySpy = vi.spyOn(
      D1ActivityLogRepository.prototype,
      "pruneOlderThan",
    );
    const llmSpy = vi
      .spyOn(D1LlmCallLogRecorder.prototype, "pruneOlderThan")
      .mockRejectedValue(new Error("llm prune boom"));

    const result = await runPruneTick(prunerEnv());

    // Outbox prune still reports its delete; tick does not throw.
    expect(result.outboxDeleted).toBe(1);
    // The llm prune was attempted (and swallowed)...
    expect(llmSpy).toHaveBeenCalled();
    // ...and the activity-log prune still ran to its delete call.
    expect(activitySpy).toHaveBeenCalled();
    expect(activitySpy.mock.results[0]?.type).toBe("return");
  });

  // Issue #783: end-to-end proof that `runPruneTick` drives the real
  // `D1JobStatePruner` against real D1 — the `runPruneTick.test.ts` unit
  // mocks the prune usecases wholesale, so the container → adapter → DELETE
  // seam is only covered here. The best-effort try/catch in `runPruneTick`
  // would otherwise let a wiring regression vanish silently.
  it("prunes old terminal export_jobs / tag_merge_jobs rows while keeping completed, non-terminal, and recent rows", async () => {
    await seedOwner(OWNER_ID);
    const db = getDatabase(env.DB);
    // Default retention is 7 days; stamp terminal rows well beyond it and
    // recent rows inside it.
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date(Date.now() - 60 * 1000).toISOString();

    const oldFailedExport = await seedExportJobRow({
      status: "failed",
      updatedAt: old,
    });
    // `completed` is excluded by the predicate however old it is, so its
    // live artifact is never orphaned (ADR-003).
    const oldCompletedExport = await seedExportJobRow({
      status: "completed",
      updatedAt: old,
    });
    const recentFailedExport = await seedExportJobRow({
      status: "failed",
      updatedAt: recent,
    });
    const oldPendingExport = await seedExportJobRow({
      status: "pending",
      updatedAt: old,
    });

    const oldCompletedMerge = await seedTagMergeJobRow({
      status: "completed",
      updatedAt: old,
    });
    const recentCompletedMerge = await seedTagMergeJobRow({
      status: "completed",
      updatedAt: recent,
    });
    const oldProcessingMerge = await seedTagMergeJobRow({
      status: "processing",
      updatedAt: old,
    });

    await runPruneTick(prunerEnv());

    const remainingExports = (
      await db.select({ id: exportJobs.id }).from(exportJobs)
    ).map((r) => r.id);
    expect(remainingExports.sort()).toEqual(
      [oldCompletedExport, recentFailedExport, oldPendingExport].sort(),
    );
    expect(remainingExports).not.toContain(oldFailedExport);

    const remainingMerges = (
      await db.select({ id: tagMergeJobs.id }).from(tagMergeJobs)
    ).map((r) => r.id);
    expect(remainingMerges.sort()).toEqual(
      [recentCompletedMerge, oldProcessingMerge].sort(),
    );
    expect(remainingMerges).not.toContain(oldCompletedMerge);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("consumer Worker — handleQueue", () => {
  it("acks every message in the batch on the happy path", async () => {
    const noteId = nextNoteId();
    const event = withId(makeTrashedDraft(noteId));

    const batch = createMessageBatch<DomainEvent>("hollow-local-events", [
      {
        id: "msg-1",
        timestamp: new Date(),
        body: event,
        attempts: 1,
      },
    ]);
    const ctx = createExecutionContext();
    await handleQueue(batch, consumerEnv(), ctx);
    const result = await getQueueResult(batch, ctx);

    // Default disposition + no explicit retries = every message acked.
    expect(result.retryBatch.retry).toBe(false);

    // The first delivery must have stamped a `processed_events` row so
    // a redelivery is recognised as a duplicate.
    const db = getDatabase(env.DB);
    const rows = await db
      .select()
      .from(processedEvents)
      .where(eq(processedEvents.id, event.id));
    expect(rows).toHaveLength(1);
  });

  it("acks a redelivered message without re-running the handler", async () => {
    const noteId = nextNoteId();
    const event = withId(makeTrashedDraft(noteId));

    // First delivery — stamps `processed_events`.
    const firstBatch = createMessageBatch<DomainEvent>("hollow-local-events", [
      {
        id: "msg-redeliver-1",
        timestamp: new Date(),
        body: event,
        attempts: 1,
      },
    ]);
    const firstCtx = createExecutionContext();
    await handleQueue(firstBatch, consumerEnv(), firstCtx);
    await getQueueResult(firstBatch, firstCtx);

    const db = getDatabase(env.DB);
    const stamped = await db
      .select()
      .from(processedEvents)
      .where(eq(processedEvents.id, event.id));
    expect(stamped).toHaveLength(1);
    const firstStampedAt = stamped[0]?.processedAt;

    // Second delivery (queue redelivery) — must be acked, must not
    // overwrite the original stamp's timestamp.
    const secondBatch = createMessageBatch<DomainEvent>("hollow-local-events", [
      {
        id: "msg-redeliver-2",
        timestamp: new Date(),
        body: event,
        attempts: 2,
      },
    ]);
    const secondCtx = createExecutionContext();
    await handleQueue(secondBatch, consumerEnv(), secondCtx);
    const secondResult = await getQueueResult(secondBatch, secondCtx);

    expect(secondResult.retryBatch.retry).toBe(false);

    const stampedAgain = await db
      .select()
      .from(processedEvents)
      .where(eq(processedEvents.id, event.id));
    expect(stampedAgain).toHaveLength(1);
    expect(stampedAgain[0]?.processedAt?.getTime()).toBe(
      firstStampedAt?.getTime(),
    );
  });
});

// Production DLQ routing is configured on the queue itself (see
// `wrangler.toml [[env.consumer.queues.consumers]] dead_letter_queue`
// and the matching `queueConsumers` block in
// `vitest.config.integration.ts`). What the handler controls is the
// per-message disposition that drives that routing — `retry()` after
// `max_retries` is what causes a message to land on the DLQ. The test
// below verifies that signal at the handler level; the queue-system
// transition from exhausted retries to DLQ is exercised by the config
// parity between the test miniflare setup and wrangler.toml.
describe("consumer Worker — handleQueue retry path", () => {
  it("routes failed messages to retry() so the queue can dead-letter them", async () => {
    const okNote = nextNoteId();
    const okEvent = withId(makeTrashedDraft(okNote));
    const failNote = nextNoteId();
    const failEvent = withId(makeTrashedDraft(failNote));

    const originalMarkProcessed = D1IdempotencyStore.prototype.markProcessed;
    vi.spyOn(D1IdempotencyStore.prototype, "markProcessed").mockImplementation(
      async function (this: D1IdempotencyStore, id) {
        if (id === failEvent.id) {
          throw new Error("simulated subscriber failure");
        }
        return await originalMarkProcessed.call(this, id);
      },
    );

    const batch = createMessageBatch<DomainEvent>("hollow-local-events", [
      {
        id: "msg-ok",
        timestamp: new Date(),
        body: okEvent,
        attempts: 1,
      },
      {
        id: "msg-fail",
        timestamp: new Date(),
        body: failEvent,
        attempts: 1,
      },
    ]);
    const ctx = createExecutionContext();
    await handleQueue(batch, consumerEnv(), ctx);
    const result = await getQueueResult(batch, ctx);

    expect(result.explicitAcks).toContain("msg-ok");
    expect(result.explicitAcks).not.toContain("msg-fail");
    // Per-message `message.retry()` shows up in `retryMessages` (the
    // batch-wide `retryBatch.retry` flag is only set by
    // `batch.retryAll()`). Either path eventually exhausts
    // `max_retries` and routes the message to the DLQ.
    expect(
      result.retryMessages.map((m: { msgId: string }) => m.msgId),
    ).toContain("msg-fail");

    // The successful message must still have been stamped — partial
    // failure inside the batch does not roll back sibling writes.
    const db = getDatabase(env.DB);
    const okRows = await db
      .select()
      .from(processedEvents)
      .where(eq(processedEvents.id, okEvent.id));
    expect(okRows).toHaveLength(1);
  });
});

describe("consumer Worker — handleQueue dispatch", () => {
  it("dispatches ingestion.created to runIngestionJob; job leaves pending and stamp is recorded", async () => {
    const ownerId = nextOwnerId();
    const jobId = nextIngestionJobId();
    await seedOwner(ownerId);
    await seedPendingIngestionJob({ ownerId, jobId, kind: "html" });

    const event: DomainEvent = {
      id: nextEventId(),
      type: "ingestion.created",
      payload: { jobId, kind: "html" },
      occurredAt: new Date(),
      aggregateId: jobId,
    };

    const batch = createMessageBatch<DomainEvent>("hollow-local-events", [
      {
        id: "msg-ingestion-created",
        timestamp: new Date(),
        body: event,
        attempts: 1,
      },
    ]);
    const ctx = createExecutionContext();
    await handleQueue(batch, consumerEnv(), ctx);
    const result = await getQueueResult(batch, ctx);

    expect(result.explicitAcks).toContain("msg-ingestion-created");

    const db = getDatabase(env.DB);
    const jobRows = await db
      .select()
      .from(ingestionJobs)
      .where(eq(ingestionJobs.id, jobId));
    // Dispatch ran: the job moved off `pending` (downstream status may
    // be `failed` because StubLLMProvider rejects `suggestMetadata`,
    // or `previewing` if the pipeline completes — both prove dispatch
    // wiring works).
    expect(jobRows[0]?.status).not.toBe("pending");

    const stamped = await db
      .select()
      .from(processedEvents)
      .where(eq(processedEvents.id, event.id));
    expect(stamped).toHaveLength(1);
  });

  it("dispatches export.job.requested to runExportJob; job leaves pending and stamp is recorded", async () => {
    const ownerId = nextOwnerId();
    const jobId = nextExportJobId();
    await seedOwner(ownerId);
    await seedPendingExportJob({ ownerId, jobId });

    const event: DomainEvent = {
      id: nextEventId(),
      type: "export.job.requested",
      payload: {
        exportJobId: jobId,
        ownerId,
        format: "html",
        scope: "multiple",
      },
      occurredAt: new Date(),
      aggregateId: jobId,
    };

    const batch = createMessageBatch<DomainEvent>("hollow-local-events", [
      {
        id: "msg-export-requested",
        timestamp: new Date(),
        body: event,
        attempts: 1,
      },
    ]);
    const ctx = createExecutionContext();
    await handleQueue(batch, consumerEnv(), ctx);
    const result = await getQueueResult(batch, ctx);

    expect(result.explicitAcks).toContain("msg-export-requested");

    const db = getDatabase(env.DB);
    const jobRows = await db
      .select()
      .from(exportJobs)
      .where(eq(exportJobs.id, jobId));
    // Dispatch ran: with no target notes the job ends in `failed`,
    // but it is no longer `pending` — which proves the dispatch
    // pipeline reached `runExportJob`.
    expect(jobRows[0]?.status).not.toBe("pending");

    const stamped = await db
      .select()
      .from(processedEvents)
      .where(eq(processedEvents.id, event.id));
    expect(stamped).toHaveLength(1);
  });

  it("handles note.trashed dispatch (search delete + publication cascade) — stamp is recorded", async () => {
    const noteId = nextNoteId();
    const event = withId(makeTrashedDraft(noteId));

    const batch = createMessageBatch<DomainEvent>("hollow-local-events", [
      {
        id: "msg-note-trashed",
        timestamp: new Date(),
        body: event,
        attempts: 1,
      },
    ]);
    const ctx = createExecutionContext();
    await handleQueue(batch, consumerEnv(), ctx);
    const result = await getQueueResult(batch, ctx);

    expect(result.explicitAcks).toContain("msg-note-trashed");
    const db = getDatabase(env.DB);
    const stamped = await db
      .select()
      .from(processedEvents)
      .where(eq(processedEvents.id, event.id));
    expect(stamped).toHaveLength(1);
  });

  it("auto-re-drives after LLMRateLimitError: rolls processing → pending, then redelivery reaches previewing (Issue #109)", async () => {
    const ownerId = nextOwnerId();
    const jobId = nextIngestionJobId();
    await seedOwner(ownerId);
    await seedPendingIngestionJob({ ownerId, jobId, kind: "html" });

    // `runIngestionJob` for kind="html" sanitises the body then asks
    // the LLM for metadata; surface a transient rate limit there so
    // the usecase rolls `processing → pending` (Issue #109) and rethrows,
    // and `dispatchDomainEvent` classifies it as `retry`. The stamp must
    // not be recorded — otherwise a queue redelivery would be skipped by
    // `hasProcessed` and the auto-re-drive would never happen (Issue #57
    // ADR-003 stamp ordering).
    //
    // The R2 `TEMP_FILES` binding is wired in the miniflare config
    // (Issue #110), so seed bytes directly via the binding — the
    // dispatcher's `tempFileStorage.get` will read them through
    // `R2TempFileStorage` and the pipeline reaches the metadata step
    // where the rate-limit injection lives. The same bytes are re-read on
    // redelivery from the unchanged `tempStorageKey` (preserved by the
    // rollback transition).
    const tempStorageKey = `${ownerId}/ingestion/${jobId}`;
    await tempFilesBinding().put(
      tempStorageKey,
      new TextEncoder().encode("<p>hello</p>"),
    );
    const suggestMetadataSpy = vi.spyOn(
      StubLLMProvider.prototype,
      "suggestMetadata",
    );
    // First delivery: rate-limited.
    suggestMetadataSpy.mockRejectedValueOnce(
      new LLMRateLimitError("rate limited"),
    );

    const event: DomainEvent = {
      id: nextEventId(),
      type: "ingestion.created",
      payload: { jobId, kind: "html" },
      occurredAt: new Date(),
      aggregateId: jobId,
    };

    const batch = createMessageBatch<DomainEvent>("hollow-local-events", [
      {
        id: "msg-ingestion-retry",
        timestamp: new Date(),
        body: event,
        attempts: 1,
      },
    ]);
    const ctx = createExecutionContext();
    await handleQueue(batch, consumerEnv(), ctx);
    const result = await getQueueResult(batch, ctx);

    expect(result.explicitAcks).not.toContain("msg-ingestion-retry");
    expect(
      result.retryMessages.map((m: { msgId: string }) => m.msgId),
    ).toContain("msg-ingestion-retry");
    expect(suggestMetadataSpy).toHaveBeenCalledTimes(1);

    const db = getDatabase(env.DB);
    const stamped = await db
      .select()
      .from(processedEvents)
      .where(eq(processedEvents.id, event.id));
    expect(stamped).toHaveLength(0);

    // Issue #109: the usecase committed `pending → processing`, then the
    // rate-limit injection triggered the `processing → pending` rollback
    // before rethrowing. The row must now be back in `pending` so the
    // redelivery's `isPending` guard re-drives the pipeline.
    const jobAfterRetry = await db
      .select()
      .from(ingestionJobs)
      .where(eq(ingestionJobs.id, jobId));
    expect(jobAfterRetry[0]?.status).toBe("pending");
    // promote (pending → processing) + rollback (processing → pending)
    // each bump the version, so the rolled-back row outranks the seed.
    const versionAfterRetry = jobAfterRetry[0]?.version ?? 0;
    expect(versionAfterRetry).toBeGreaterThan(0);

    // Redelivery: hasProcessed=false (no stamp), so handleQueue enters
    // dispatch again. The job is `pending`, so `runIngestionJob` re-runs
    // the pipeline. This time the LLM succeeds (metadata returned), so
    // for kind="html" the pipeline only needs `suggestMetadata` (no
    // `structureToHtml`) to reach `previewing`. Stamp + ack.
    suggestMetadataSpy.mockResolvedValueOnce({ tags: [], aliases: [] });
    const redeliverBatch = createMessageBatch<DomainEvent>(
      "hollow-local-events",
      [
        {
          id: "msg-ingestion-retry-2",
          timestamp: new Date(),
          body: event,
          attempts: 2,
        },
      ],
    );
    const redeliverCtx = createExecutionContext();
    await handleQueue(redeliverBatch, consumerEnv(), redeliverCtx);
    const redeliverResult = await getQueueResult(redeliverBatch, redeliverCtx);
    expect(redeliverResult.explicitAcks).toContain("msg-ingestion-retry-2");
    expect(suggestMetadataSpy).toHaveBeenCalledTimes(2);
    const stampedAfterRedeliver = await db
      .select()
      .from(processedEvents)
      .where(eq(processedEvents.id, event.id));
    expect(stampedAfterRedeliver).toHaveLength(1);
    const jobAfterRedeliver = await db
      .select()
      .from(ingestionJobs)
      .where(eq(ingestionJobs.id, jobId));
    expect(jobAfterRedeliver[0]?.status).toBe("previewing");
    // The re-drive (promote + attachPreview) bumps the version further,
    // confirming OCC stays monotonic across the rollback boundary.
    expect(jobAfterRedeliver[0]?.version ?? 0).toBeGreaterThan(
      versionAfterRetry,
    );
  });

  it("skips already-processed events via hasProcessed (no re-dispatch)", async () => {
    const ownerId = nextOwnerId();
    const jobId = nextIngestionJobId();
    await seedOwner(ownerId);
    await seedPendingIngestionJob({ ownerId, jobId, kind: "html" });

    const event: DomainEvent = {
      id: nextEventId(),
      type: "ingestion.created",
      payload: { jobId, kind: "html" },
      occurredAt: new Date(),
      aggregateId: jobId,
    };

    // First delivery — runs dispatch and stamps.
    const firstBatch = createMessageBatch<DomainEvent>("hollow-local-events", [
      {
        id: "msg-dedup-1",
        timestamp: new Date(),
        body: event,
        attempts: 1,
      },
    ]);
    const firstCtx = createExecutionContext();
    await handleQueue(firstBatch, consumerEnv(), firstCtx);
    await getQueueResult(firstBatch, firstCtx);

    const db = getDatabase(env.DB);
    const firstStamp = await db
      .select()
      .from(processedEvents)
      .where(eq(processedEvents.id, event.id));
    expect(firstStamp).toHaveLength(1);
    const firstJobAfter = await db
      .select()
      .from(ingestionJobs)
      .where(eq(ingestionJobs.id, jobId));
    const firstStatus = firstJobAfter[0]?.status;
    const firstUpdatedAt = firstJobAfter[0]?.updatedAt;

    // Second delivery — `hasProcessed` short-circuits dispatch.
    // Spy on `hasProcessed` to prove we actually traverse that branch
    // (the observable behavior of "row unchanged" could also be produced
    // by the dispatch running again and hitting `isPending=false`).
    const hasProcessedSpy = vi.spyOn(
      D1IdempotencyStore.prototype,
      "hasProcessed",
    );
    const markProcessedSpy = vi.spyOn(
      D1IdempotencyStore.prototype,
      "markProcessed",
    );
    const secondBatch = createMessageBatch<DomainEvent>("hollow-local-events", [
      {
        id: "msg-dedup-2",
        timestamp: new Date(),
        body: event,
        attempts: 2,
      },
    ]);
    const secondCtx = createExecutionContext();
    await handleQueue(secondBatch, consumerEnv(), secondCtx);
    const secondResult = await getQueueResult(secondBatch, secondCtx);
    expect(secondResult.explicitAcks).toContain("msg-dedup-2");

    // `hasProcessed` was consulted, dispatch was skipped (no
    // `markProcessed` call) — the row is left untouched.
    expect(hasProcessedSpy).toHaveBeenCalledWith(event.id);
    expect(markProcessedSpy).not.toHaveBeenCalled();

    const secondJobAfter = await db
      .select()
      .from(ingestionJobs)
      .where(eq(ingestionJobs.id, jobId));
    expect(secondJobAfter[0]?.status).toBe(firstStatus);
    expect(secondJobAfter[0]?.updatedAt).toBe(firstUpdatedAt);
  });

  it("reads ingestion bytes via R2 binding (R2TempFileStorage path)", async () => {
    const ownerId = nextOwnerId();
    const jobId = nextIngestionJobId();
    await seedOwner(ownerId);
    await seedPendingIngestionJob({ ownerId, jobId, kind: "html" });

    // Seed bytes into the real R2 binding under the same temp-storage
    // key the seeded job points at. With `[env.consumer]` now binding
    // `TEMP_FILES` (Issue #110) and `vitest.config.integration.ts`
    // exposing an in-memory R2 bucket, `tempFileStorage.get` must
    // route through `R2TempFileStorage` and find these bytes.
    const tempStorageKey = `${ownerId}/ingestion/${jobId}`;
    await tempFilesBinding().put(
      tempStorageKey,
      new TextEncoder().encode("<p>hello R2</p>"),
    );

    // Direct proof: spy on the R2 adapter's `get` and confirm it is
    // invoked with the expected key. Since the production Stub class
    // was removed in Issue #100, the regression check is now phrased
    // positively — "the R2 path was exercised" — rather than the
    // double assertion "R2 invoked AND Stub not invoked".
    const r2GetSpy = vi.spyOn(R2TempFileStorage.prototype, "get");

    const event: DomainEvent = {
      id: nextEventId(),
      type: "ingestion.created",
      payload: { jobId, kind: "html" },
      occurredAt: new Date(),
      aggregateId: jobId,
    };

    const batch = createMessageBatch<DomainEvent>("hollow-local-events", [
      {
        id: "msg-ingestion-r2-smoke",
        timestamp: new Date(),
        body: event,
        attempts: 1,
      },
    ]);
    const ctx = createExecutionContext();
    await handleQueue(batch, consumerEnv(), ctx);
    const result = await getQueueResult(batch, ctx);

    expect(result.explicitAcks).toContain("msg-ingestion-r2-smoke");

    // R2 path was exercised. If the DI had fallen back to the inline
    // unavailable adapter (Issue #100 ADR-001), `R2TempFileStorage.get`
    // would never be reached and `TempFileStorageUnavailableError` would
    // bubble up instead — so a single positive call on this spy
    // indirectly guarantees the real R2 adapter is wired into the
    // consumer container.
    expect(r2GetSpy).toHaveBeenCalledWith(tempStorageKey);
    expect(r2GetSpy).toHaveBeenCalledTimes(1);
    // Also confirm the spy's first call resolved successfully (i.e. the
    // R2 binding returned the seeded bytes), not the unavailable
    // adapter's reject path that would surface as a rejected promise.
    const firstCallResult = r2GetSpy.mock.results[0];
    expect(firstCallResult?.type).toBe("return");
    await expect(firstCallResult?.value).resolves.toBeInstanceOf(ArrayBuffer);

    // Job moved off `pending` — the dispatch reached the downstream
    // LLM step. With `ADMIN_LLM_API_KEY` / `ADMIN_LLM_MODEL` unset,
    // `StubLLMProvider` rejects metadata extraction, so the
    // `markFailedSafely` path lands the job in `failed`. Either way,
    // leaving `pending` proves the R2-backed read succeeded.
    const db = getDatabase(env.DB);
    const jobRows = await db
      .select()
      .from(ingestionJobs)
      .where(eq(ingestionJobs.id, jobId));
    expect(jobRows[0]?.status).not.toBe("pending");
  });
});

describe("consumer Worker — note.* / publication.* dispatch (#145)", () => {
  type SeedResult = Readonly<{
    ownerId: string;
    directoryId: string;
    noteId: NoteId;
  }>;

  // Reuse a deterministic id band for these tests so the rows do not
  // collide with the ones seeded by earlier `describe` blocks in this
  // file (each block uses its own band via `nextOwnerId` / `nextNoteId`).
  let searchSeedSeq = 0;
  const nextSearchId = (suffix: string): string => {
    searchSeedSeq += 1;
    // UUIDv7 shape: third group starts with `7`, fourth group's first
    // nibble in `[89ab]`. Last group is exactly 12 hex chars; we pack
    // the per-call suffix tag (1 char) + sequence + zero-padding.
    const block = searchSeedSeq.toString(16).padStart(4, "0");
    return `0193e7d0-${block}-7000-a000-${suffix}${block}0000000`;
  };

  async function seedActiveNote(params: {
    title?: string;
    visibility?: "private" | "unlisted" | "public";
    status?: "active" | "trashed";
  }): Promise<SeedResult> {
    const db = getDatabase(env.DB);
    const ownerId = nextSearchId("a");
    const directoryId = nextSearchId("b");
    const noteId = NoteId.create(nextSearchId("c"));
    const tz = new Date(0).toISOString();
    const suffix = ownerId.slice(-6);
    await db.insert(users).values({
      id: ownerId,
      name: `note-owner-${suffix}`,
      email: `note-${suffix}@example.test`,
      emailVerified: 1,
      username: `note_${suffix}`,
      role: "member",
      banned: 0,
      createdAt: tz,
      updatedAt: tz,
    });
    await db.insert(directories).values({
      id: directoryId,
      ownerId,
      parentId: null,
      name: "root",
      slug: `dir-${directoryId.slice(9, 13)}`,
      depth: 0,
      version: 0,
      createdAt: tz,
      updatedAt: tz,
    });
    const status = params.status ?? "active";
    await db.insert(notes).values({
      id: noteId as string,
      ownerId,
      directoryId,
      slug: `note-${noteId.slice(9, 13)}`,
      title: params.title ?? "Initial title",
      contentHtml: "<p>body</p>",
      frontMatterJson: "{}",
      status,
      trashedAt: status === "trashed" ? tz : null,
      createdAt: tz,
      updatedAt: tz,
      version: 0,
    });
    await db.insert(publicationStates).values({
      noteId: noteId as string,
      ownerId,
      visibility: params.visibility ?? "private",
      publishedAt: null,
      updatedAt: tz,
      version: 0,
    });
    return { ownerId, directoryId, noteId };
  }

  async function pushEvent(
    msgId: string,
    event: DomainEvent,
  ): Promise<ReturnType<typeof getQueueResult>> {
    const batch = createMessageBatch<DomainEvent>("hollow-local-events", [
      {
        id: msgId,
        timestamp: new Date(),
        body: event,
        attempts: 1,
      },
    ]);
    const ctx = createExecutionContext();
    await handleQueue(batch, consumerEnv(), ctx);
    return getQueueResult(batch, ctx);
  }

  it("note.created → enqueues upsert in index_jobs and reflects to search_documents on drainer tick", async () => {
    const seeded = await seedActiveNote({ title: "Hello 145" });
    const event = withId(
      NoteEvents.created(
        {
          noteId: seeded.noteId,
          ownerId: seeded.ownerId as UserId,
          directoryId: seeded.directoryId as never,
          slug: `note-${seeded.noteId.slice(9, 13)}` as never,
          title: "Hello 145" as never,
          tagIds: [],
          mediaRefs: [],
        },
        new Date(),
      ),
    );
    const result = await pushEvent(`msg-145-created-${seeded.noteId}`, event);
    expect(result.retryBatch.retry).toBe(false);

    const db = getDatabase(env.DB);
    const jobs = await db
      .select()
      .from(indexJobs)
      .where(eq(indexJobs.noteId, seeded.noteId as string));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.op).toBe("upsert");

    // Drain via the application-layer tick and verify SearchIndex applied
    // the upsert.
    const container = createWorkerContainer(consumerEnv());
    await processIndexJobs(container, { batchSize: 10 });

    const docs = await db
      .select()
      .from(searchDocuments)
      .where(eq(searchDocuments.noteId, seeded.noteId as string));
    expect(docs).toHaveLength(1);
    expect(docs[0]?.title).toBe("Hello 145");
  });

  it("note.trashed → enqueues delete and cascades publication visibility to private (fan-out)", async () => {
    const seeded = await seedActiveNote({
      title: "Trash target",
      visibility: "public",
    });
    const event = withId(
      NoteEvents.trashed(
        {
          noteId: seeded.noteId,
          ownerId: seeded.ownerId as UserId,
          mediaRefs: [],
        },
        new Date(),
      ),
    );
    const result = await pushEvent(`msg-145-trashed-${seeded.noteId}`, event);
    expect(result.retryBatch.retry).toBe(false);

    const db = getDatabase(env.DB);
    const jobs = await db
      .select()
      .from(indexJobs)
      .where(eq(indexJobs.noteId, seeded.noteId as string));
    // search-side delete enqueue. publication.handleNoteTrashedEvent
    // does its work inline (no IndexJob enqueue) but mutates
    // publication_states.
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.op).toBe("delete");

    const pubRows = await db
      .select()
      .from(publicationStates)
      .where(eq(publicationStates.noteId, seeded.noteId as string));
    expect(pubRows[0]?.visibility).toBe("private");
  });

  it("note.publish_changed against a trashed note → no IndexJob enqueued (ADR-007 status guard E2E)", async () => {
    const seeded = await seedActiveNote({
      title: "Trashed ghost",
      status: "trashed",
    });
    const event = withId(
      PublicationEvents.notePublishChanged(
        {
          noteId: seeded.noteId,
          ownerId: seeded.ownerId as UserId,
          previous: "private" as never,
          next: "public" as never,
        },
        new Date(),
      ),
    );
    const result = await pushEvent(
      `msg-145-publish-trashed-${seeded.noteId}`,
      event,
    );
    expect(result.retryBatch.retry).toBe(false);

    const db = getDatabase(env.DB);
    const jobs = await db
      .select()
      .from(indexJobs)
      .where(eq(indexJobs.noteId, seeded.noteId as string));
    // The dispatcher's trashed-status guard short-circuits before
    // `handlePublicationChangedEvent` runs, so no row is enqueued.
    expect(jobs).toHaveLength(0);
  });
});

describe("DLQ Worker — handleDlq", () => {
  it("acks every quarantined message so it does not re-enter the DLQ", async () => {
    const noteId = nextNoteId();
    const event = withId(makeTrashedDraft(noteId));

    const batch = createMessageBatch<DomainEvent>("hollow-local-events-dlq", [
      {
        id: "dlq-msg-1",
        timestamp: new Date(),
        body: event,
        attempts: 4,
      },
    ]);
    const ctx = createExecutionContext();
    await handleDlq(batch, dlqEnv(), ctx);
    const result = await getQueueResult(batch, ctx);

    // The DLQ has no further dead-letter target — re-failure would
    // loop, so every message must be acked even on the surfacing path.
    expect(result.retryBatch.retry).toBe(false);
  });
});
