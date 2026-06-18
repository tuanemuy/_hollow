import { describe, expect, it, vi } from "vitest";
import { FakeActivityLogRepository } from "@/core/application/__tests__/fakes/fakeActivityLogRepository";
import type { WorkerContainer } from "@/core/application/di/types";
import type { Clock } from "@/core/application/ports/clock";
import { UserId } from "@/core/domain/identity/valueObject";
import { NoteId } from "@/core/domain/note/valueObject";
import type { IndexJob, NoteSnapshot } from "@/core/domain/search/entity";
import type { IndexJobRepository } from "@/core/domain/search/ports/indexJobRepository";
import { FakeIdGenerator, FakeLogger } from "../../__tests__/fakes";
import { handleNoteSavedEvent } from "../handleNoteSavedEvent";
import { handleNoteTrashedEvent } from "../handleNoteTrashedEvent";
import { handlePublicationChangedEvent } from "../handlePublicationChangedEvent";

const T0 = new Date(0);

const noteId = (n: number): NoteId =>
  NoteId.create(`00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`);
const userId = (n: number): UserId =>
  UserId.create(`00000000-0000-7000-9000-${n.toString(16).padStart(12, "0")}`);

function snapshot(over: Partial<NoteSnapshot> = {}): NoteSnapshot {
  return {
    noteId: noteId(1),
    ownerId: userId(1),
    visibility: "public",
    title: "Title",
    plainBody: "body",
    tagNames: ["t"],
    directoryPath: "/",
    frontMatterDate: null,
    updatedAt: T0,
    ...over,
  };
}

const fixedClock = (at: Date): Clock => ({ now: () => at });

type IndexJobRepoSpy = IndexJobRepository & {
  enqueue: ReturnType<typeof vi.fn>;
  nextBatch: ReturnType<typeof vi.fn>;
  complete: ReturnType<typeof vi.fn>;
  fail: ReturnType<typeof vi.fn>;
};

function makeIndexJobRepository(): IndexJobRepoSpy {
  return {
    enqueue: vi.fn(async () => {}),
    nextBatch: vi.fn(async () => []),
    complete: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
  };
}

function makeContainer(
  over: {
    indexJobRepository?: IndexJobRepository;
    clock?: Clock;
    idGenerator?: ReturnType<typeof makeIdGen>;
  } = {},
): WorkerContainer {
  return {
    outboxRepository: {
      save: vi.fn(async () => {}),
      claimPending: vi.fn(async () => []),
      finalize: vi.fn(async () => {}),
      pruneProcessed: vi.fn(async () => ({ deleted: 0 })),
    },
    idempotencyStore: {
      hasProcessed: vi.fn(async () => false),
      markProcessed: vi.fn(async () => ({ alreadyProcessed: false })),
    },
    searchIndex: {
      upsert: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      query: vi.fn(async () => ({ hits: [], nextCursor: null })),
      bulkRebuildFromSnapshots: vi.fn(async () => {}),
      countByDateRanges: vi.fn(async () => []),
    },
    indexJobRepository: over.indexJobRepository ?? makeIndexJobRepository(),
    activityLogRepository: new FakeActivityLogRepository(),
    llmCallLogRecorder: {
      recordCall: vi.fn(async () => {}),
      pruneOlderThan: vi.fn(async () => ({ deleted: 0 })),
    },
    clock: over.clock ?? fixedClock(T0),
    idGenerator: over.idGenerator ?? new FakeIdGenerator(1),
    logger: new FakeLogger(),
  };
}

function makeIdGen(start = 1) {
  return new FakeIdGenerator(start);
}

describe("handleNoteSavedEvent", () => {
  it("enqueues an upsert IndexJob carrying the inbound snapshot", async () => {
    const indexJobRepository = makeIndexJobRepository();
    const container = makeContainer({
      indexJobRepository,
      clock: fixedClock(new Date(42)),
      idGenerator: makeIdGen(10),
    });
    const snap = snapshot({ noteId: noteId(7) });

    await handleNoteSavedEvent({ container, input: { snapshot: snap } });

    expect(indexJobRepository.enqueue).toHaveBeenCalledTimes(1);
    const job = indexJobRepository.enqueue.mock.calls[0]?.[0] as
      | IndexJob
      | undefined;
    expect(job).toBeDefined();
    if (!job) return;
    expect(job.op).toBe("upsert");
    expect(job.noteId).toBe(snap.noteId);
    expect(job.snapshot).toBe(snap);
    expect(job.attempts as unknown as number).toBe(0);
    expect(job.enqueuedAt.getTime()).toBe(42);
  });
});

describe("handleNoteTrashedEvent", () => {
  it("enqueues a delete IndexJob with snapshot=null", async () => {
    const indexJobRepository = makeIndexJobRepository();
    const container = makeContainer({ indexJobRepository });
    const id = noteId(3);

    await handleNoteTrashedEvent({ container, input: { noteId: id } });

    expect(indexJobRepository.enqueue).toHaveBeenCalledTimes(1);
    const job = indexJobRepository.enqueue.mock.calls[0]?.[0] as
      | IndexJob
      | undefined;
    expect(job).toBeDefined();
    if (!job) return;
    expect(job.op).toBe("delete");
    expect(job.snapshot).toBeNull();
    expect(job.noteId).toBe(id);
  });
});

describe("handlePublicationChangedEvent", () => {
  it("enqueues an upsert IndexJob with the new-visibility snapshot", async () => {
    const indexJobRepository = makeIndexJobRepository();
    const container = makeContainer({ indexJobRepository });
    const snap = snapshot({ visibility: "unlisted" });

    await handlePublicationChangedEvent({
      container,
      input: { snapshot: snap },
    });

    const job = indexJobRepository.enqueue.mock.calls[0]?.[0] as
      | IndexJob
      | undefined;
    expect(job).toBeDefined();
    if (!job) return;
    expect(job.op).toBe("upsert");
    expect(job.snapshot?.visibility).toBe("unlisted");
  });
});

describe("duplicate-delivery shape", () => {
  // Documents the "二重配信" contract: handlers do not deduplicate; both
  // calls enqueue a job. Idempotency is the consumer's responsibility
  // (SearchIndex.upsert is keyed on noteId, SearchIndex.delete is a no-op
  // for missing rows), so duplicate dispatch converges to the same state.
  it("enqueues a second job when the same event is delivered twice (consumer is idempotent)", async () => {
    const indexJobRepository = makeIndexJobRepository();
    const container = makeContainer({ indexJobRepository });
    const snap = snapshot();

    await handleNoteSavedEvent({ container, input: { snapshot: snap } });
    await handleNoteSavedEvent({ container, input: { snapshot: snap } });

    expect(indexJobRepository.enqueue).toHaveBeenCalledTimes(2);
    const j1 = indexJobRepository.enqueue.mock.calls[0]?.[0] as IndexJob;
    const j2 = indexJobRepository.enqueue.mock.calls[1]?.[0] as IndexJob;
    // FakeIdGenerator returns a fresh id per call, so the two jobs are
    // distinguishable but carry the same payload.
    expect(j1.id).not.toBe(j2.id);
    expect(j1.snapshot).toBe(snap);
    expect(j2.snapshot).toBe(snap);
  });
});
