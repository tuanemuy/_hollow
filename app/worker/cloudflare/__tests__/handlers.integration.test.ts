import {
  createExecutionContext,
  createMessageBatch,
  env,
  getQueueResult,
} from "cloudflare:test";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  R2TempFileStorage,
  StubTempFileStorage,
} from "@/core/adapters/cloudflare/r2TempFileStorage";
import { getDatabase } from "@/core/adapters/d1/client";
import { PendingBatch } from "@/core/adapters/d1/pendingBatch";
import { D1IdempotencyStore } from "@/core/adapters/d1/repositories/idempotencyStore";
import { D1OutboxRepository } from "@/core/adapters/d1/repositories/outboxRepository";
import {
  exportJobs,
  ingestionJobs,
  outboxEvents,
  processedEvents,
  users,
} from "@/core/adapters/d1/schema";
import { StubLLMProvider } from "@/core/adapters/llm/llmProvider";
import {
  type DomainEvent,
  type EventDraft,
  EventId,
} from "@/core/domain/common/event";
import { UserId } from "@/core/domain/identity/valueObject";
import { LLMRateLimitError } from "@/core/domain/ingestion/ports/llmProvider";
import { NoteEvents } from "@/core/domain/note/events";
import { NoteId } from "@/core/domain/note/valueObject";
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
    expect(result.deleted).toBe(1);

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
    expect(result.deleted).toBe(0);

    const remaining = await db.select().from(outboxEvents);
    expect(remaining).toHaveLength(1);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("consumer Worker — handleQueue", () => {
  it("acks every message in the batch on the happy path", async () => {
    const noteId = nextNoteId();
    const event = withId(makeTrashedDraft(noteId));

    const batch = createMessageBatch<DomainEvent>(
      "tanstack-start-template-events",
      [
        {
          id: "msg-1",
          timestamp: new Date(),
          body: event,
          attempts: 1,
        },
      ],
    );
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
    const firstBatch = createMessageBatch<DomainEvent>(
      "tanstack-start-template-events",
      [
        {
          id: "msg-redeliver-1",
          timestamp: new Date(),
          body: event,
          attempts: 1,
        },
      ],
    );
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
    const secondBatch = createMessageBatch<DomainEvent>(
      "tanstack-start-template-events",
      [
        {
          id: "msg-redeliver-2",
          timestamp: new Date(),
          body: event,
          attempts: 2,
        },
      ],
    );
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

    const batch = createMessageBatch<DomainEvent>(
      "tanstack-start-template-events",
      [
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
      ],
    );
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

    const batch = createMessageBatch<DomainEvent>(
      "tanstack-start-template-events",
      [
        {
          id: "msg-ingestion-created",
          timestamp: new Date(),
          body: event,
          attempts: 1,
        },
      ],
    );
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

    const batch = createMessageBatch<DomainEvent>(
      "tanstack-start-template-events",
      [
        {
          id: "msg-export-requested",
          timestamp: new Date(),
          body: event,
          attempts: 1,
        },
      ],
    );
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

  it("skips note.trashed dispatch (regression guard) — stamp is still recorded", async () => {
    const noteId = nextNoteId();
    const event = withId(makeTrashedDraft(noteId));

    const batch = createMessageBatch<DomainEvent>(
      "tanstack-start-template-events",
      [
        {
          id: "msg-note-trashed",
          timestamp: new Date(),
          body: event,
          attempts: 1,
        },
      ],
    );
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

  it("does NOT stamp when runIngestionJob throws LLMRateLimitError; redelivery re-enters dispatch but no-ops via isPending guard (ADR-003 既知の限界)", async () => {
    const ownerId = nextOwnerId();
    const jobId = nextIngestionJobId();
    await seedOwner(ownerId);
    await seedPendingIngestionJob({ ownerId, jobId, kind: "html" });

    // `runIngestionJob` for kind="html" sanitises the body then asks
    // the LLM for metadata; surface a transient rate limit there so
    // the usecase rethrows and `dispatchDomainEvent` classifies it
    // as `retry`. The stamp must not be recorded — otherwise a queue
    // redelivery would be skipped by `hasProcessed` and the retry
    // would be silently dropped (ADR-003).
    //
    // The R2 `TEMP_FILES` binding is wired in the miniflare config
    // (Issue #110), so seed bytes directly via the binding — the
    // dispatcher's `tempFileStorage.get` will read them through
    // `R2TempFileStorage` and the pipeline reaches the metadata step
    // where the rate-limit injection lives.
    const tempStorageKey = `${ownerId}/ingestion/${jobId}`;
    await tempFilesBinding().put(
      tempStorageKey,
      new TextEncoder().encode("<p>hello</p>"),
    );
    const suggestMetadataSpy = vi.spyOn(
      StubLLMProvider.prototype,
      "suggestMetadata",
    );
    suggestMetadataSpy.mockRejectedValue(new LLMRateLimitError("rate limited"));

    const event: DomainEvent = {
      id: nextEventId(),
      type: "ingestion.created",
      payload: { jobId, kind: "html" },
      occurredAt: new Date(),
      aggregateId: jobId,
    };

    const batch = createMessageBatch<DomainEvent>(
      "tanstack-start-template-events",
      [
        {
          id: "msg-ingestion-retry",
          timestamp: new Date(),
          body: event,
          attempts: 1,
        },
      ],
    );
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

    // The usecase committed `pending → processing` before the LLM call
    // rethrew. ADR-003 "既知の限界": the row is now in `processing`,
    // and the next redelivery will hit `runIngestionJob`'s `isPending`
    // guard and no-op. The queue retry path is intentionally documented
    // here so a future change to `runIngestionJob`'s entry guard
    // (re-entry from `processing`) would fail this assertion.
    const jobAfterRetry = await db
      .select()
      .from(ingestionJobs)
      .where(eq(ingestionJobs.id, jobId));
    expect(jobAfterRetry[0]?.status).toBe("processing");

    // Redelivery: hasProcessed=false (no stamp), so handleQueue enters
    // dispatch again. runIngestionJob's `isPending` guard short-circuits
    // (job is `processing` now), so the LLM is NOT called a second
    // time. Stamp + ack regardless — the message is finally drained.
    suggestMetadataSpy.mockClear();
    const redeliverBatch = createMessageBatch<DomainEvent>(
      "tanstack-start-template-events",
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
    expect(suggestMetadataSpy).not.toHaveBeenCalled();
    const stampedAfterRedeliver = await db
      .select()
      .from(processedEvents)
      .where(eq(processedEvents.id, event.id));
    expect(stampedAfterRedeliver).toHaveLength(1);
    const jobAfterRedeliver = await db
      .select()
      .from(ingestionJobs)
      .where(eq(ingestionJobs.id, jobId));
    expect(jobAfterRedeliver[0]?.status).toBe("processing");
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
    const firstBatch = createMessageBatch<DomainEvent>(
      "tanstack-start-template-events",
      [
        {
          id: "msg-dedup-1",
          timestamp: new Date(),
          body: event,
          attempts: 1,
        },
      ],
    );
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
    const secondBatch = createMessageBatch<DomainEvent>(
      "tanstack-start-template-events",
      [
        {
          id: "msg-dedup-2",
          timestamp: new Date(),
          body: event,
          attempts: 2,
        },
      ],
    );
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

  it("reads ingestion bytes via R2 binding (R2TempFileStorage path) — Stub spy is never invoked", async () => {
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

    // Direct proof: spy on both adapters' `get` and confirm only the
    // R2-backed one is invoked. The Stub spy MUST stay clean — its
    // invocation would mean DI is still wiring `StubTempFileStorage`
    // despite the R2 binding being present (regression on Step 7).
    const r2GetSpy = vi.spyOn(R2TempFileStorage.prototype, "get");
    const stubGetSpy = vi.spyOn(StubTempFileStorage.prototype, "get");

    const event: DomainEvent = {
      id: nextEventId(),
      type: "ingestion.created",
      payload: { jobId, kind: "html" },
      occurredAt: new Date(),
      aggregateId: jobId,
    };

    const batch = createMessageBatch<DomainEvent>(
      "tanstack-start-template-events",
      [
        {
          id: "msg-ingestion-r2-smoke",
          timestamp: new Date(),
          body: event,
          attempts: 1,
        },
      ],
    );
    const ctx = createExecutionContext();
    await handleQueue(batch, consumerEnv(), ctx);
    const result = await getQueueResult(batch, ctx);

    expect(result.explicitAcks).toContain("msg-ingestion-r2-smoke");

    // R2 path was exercised; Stub path was not.
    expect(r2GetSpy).toHaveBeenCalledWith(tempStorageKey);
    expect(stubGetSpy).not.toHaveBeenCalled();

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

describe("DLQ Worker — handleDlq", () => {
  it("acks every quarantined message so it does not re-enter the DLQ", async () => {
    const noteId = nextNoteId();
    const event = withId(makeTrashedDraft(noteId));

    const batch = createMessageBatch<DomainEvent>(
      "tanstack-start-template-events-dlq",
      [
        {
          id: "dlq-msg-1",
          timestamp: new Date(),
          body: event,
          attempts: 4,
        },
      ],
    );
    const ctx = createExecutionContext();
    await handleDlq(batch, dlqEnv(), ctx);
    const result = await getQueueResult(batch, ctx);

    // The DLQ has no further dead-letter target — re-failure would
    // loop, so every message must be acked even on the surfacing path.
    expect(result.retryBatch.retry).toBe(false);
  });
});
