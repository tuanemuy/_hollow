import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeActivityLogRepository } from "@/core/application/__tests__/fakes/fakeActivityLogRepository";
import type { WorkerContainer } from "@/core/application/di/types";
import type { Clock } from "@/core/application/ports/clock";
import { UserId } from "@/core/domain/identity/valueObject";
import { NoteId } from "@/core/domain/note/valueObject";
import { IndexJob, type NoteSnapshot } from "@/core/domain/search/entity";
import type { IndexJobRepository } from "@/core/domain/search/ports/indexJobRepository";
import {
  type SearchIndex,
  SearchIndexUnavailableError,
} from "@/core/domain/search/ports/searchIndex";
import { FakeIdGenerator, FakeLogger } from "../../__tests__/fakes";
import {
  CONSUME_INDEX_JOB_MAX_ATTEMPTS,
  consumeIndexJob,
} from "../../search/consumeIndexJob";
import { processIndexJobs } from "../processIndexJobs";

vi.mock("../../search/consumeIndexJob", async () => {
  const actual = await vi.importActual<
    typeof import("../../search/consumeIndexJob")
  >("../../search/consumeIndexJob");
  return {
    ...actual,
    consumeIndexJob: vi.fn(actual.consumeIndexJob),
  };
});

const T0 = new Date(0);

const noteId = (n: number): NoteId =>
  NoteId.create(`00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`);
const userId = (n: number): UserId =>
  UserId.create(`00000000-0000-7000-9000-${n.toString(16).padStart(12, "0")}`);

function snapshot(over: Partial<NoteSnapshot> = {}): NoteSnapshot {
  return {
    noteId: noteId(1),
    ownerId: userId(1),
    visibility: "private",
    title: "T",
    plainBody: "B",
    tagNames: [],
    directoryPath: "/",
    frontMatterDate: null,
    updatedAt: T0,
    ...over,
  };
}

function fixedClock(at: Date): Clock {
  return { now: () => at };
}

type IndexJobRepoSpy = IndexJobRepository & {
  enqueue: ReturnType<typeof vi.fn>;
  nextBatch: ReturnType<typeof vi.fn>;
  complete: ReturnType<typeof vi.fn>;
  fail: ReturnType<typeof vi.fn>;
};

function makeRepo(): IndexJobRepoSpy {
  return {
    enqueue: vi.fn(async () => {}),
    nextBatch: vi.fn(async () => []),
    complete: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
  };
}

function makeIndex(over: Partial<SearchIndex> = {}): SearchIndex {
  return {
    upsert: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    query: vi.fn(async () => ({ hits: [], nextCursor: null })),
    bulkRebuildFromSnapshots: vi.fn(async () => {}),
    ...over,
  } as SearchIndex;
}

function makeContainer(over: {
  searchIndex?: SearchIndex;
  indexJobRepository?: IndexJobRepository;
  clock?: Clock;
}): WorkerContainer {
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
    searchIndex: over.searchIndex ?? makeIndex(),
    indexJobRepository: over.indexJobRepository ?? makeRepo(),
    activityLogRepository: new FakeActivityLogRepository(),
    clock: over.clock ?? fixedClock(T0),
    idGenerator: new FakeIdGenerator(1),
    logger: new FakeLogger(),
  };
}

function makeUpsertJob(id: string, snapNoteId: NoteId = noteId(1)): IndexJob {
  return IndexJob.create(
    {
      id,
      noteId: snapNoteId,
      op: "upsert",
      snapshot: snapshot({ noteId: snapNoteId }),
    },
    T0,
  );
}

function makeDeleteJob(id: string, snapNoteId: NoteId = noteId(2)): IndexJob {
  return IndexJob.create(
    { id, noteId: snapNoteId, op: "delete", snapshot: null },
    T0,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("processIndexJobs — drain loop", () => {
  it("returns zero counters when the queue is empty", async () => {
    const repo = makeRepo();
    const container = makeContainer({ indexJobRepository: repo });

    const result = await processIndexJobs(container, { batchSize: 10 });
    expect(result).toEqual({
      completed: 0,
      retried: 0,
      dlq: 0,
      unexpectedFailures: 0,
    });
    expect(repo.nextBatch).toHaveBeenCalledTimes(1);
    expect(repo.nextBatch).toHaveBeenCalledWith(
      10,
      expect.any(Date),
      CONSUME_INDEX_JOB_MAX_ATTEMPTS,
    );
  });

  it("processes one batch and stops when the next batch is empty", async () => {
    const repo = makeRepo();
    repo.nextBatch
      .mockResolvedValueOnce([makeUpsertJob("j1"), makeDeleteJob("j2")])
      .mockResolvedValueOnce([]);
    const container = makeContainer({ indexJobRepository: repo });

    const result = await processIndexJobs(container, { batchSize: 10 });
    expect(result.completed).toBe(2);
    expect(result.retried).toBe(0);
    expect(result.dlq).toBe(0);
    // batch size 10 but only 2 returned → loop short-circuits without a
    // follow-up `nextBatch` call.
    expect(repo.nextBatch).toHaveBeenCalledTimes(1);
    expect(repo.complete).toHaveBeenCalledTimes(2);
  });

  it("loops across multiple full batches until queue is drained", async () => {
    const repo = makeRepo();
    repo.nextBatch
      .mockResolvedValueOnce([makeUpsertJob("j1"), makeUpsertJob("j2")])
      .mockResolvedValueOnce([makeUpsertJob("j3"), makeUpsertJob("j4")])
      .mockResolvedValueOnce([]);
    const container = makeContainer({ indexJobRepository: repo });

    const result = await processIndexJobs(container, { batchSize: 2 });
    expect(result.completed).toBe(4);
    // Full batch (length === batchSize) triggers another `nextBatch`
    // call; empty batch ends the loop. So 3 calls total.
    expect(repo.nextBatch).toHaveBeenCalledTimes(3);
  });

  it("stops at maxBatches even when more work is available", async () => {
    const repo = makeRepo();
    repo.nextBatch.mockResolvedValue([makeUpsertJob("jX")]);
    const container = makeContainer({ indexJobRepository: repo });

    const result = await processIndexJobs(container, {
      batchSize: 1,
      maxBatches: 3,
    });
    expect(result.completed).toBe(3);
    expect(repo.nextBatch).toHaveBeenCalledTimes(3);
  });

  it("returns retry / completed split when transient SearchIndex error happens mid-batch", async () => {
    const repo = makeRepo();
    repo.nextBatch
      .mockResolvedValueOnce([makeUpsertJob("ok"), makeUpsertJob("ng")])
      .mockResolvedValueOnce([]);
    const flakyIndex = makeIndex({
      upsert: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new SearchIndexUnavailableError("down")),
    });
    const container = makeContainer({
      indexJobRepository: repo,
      searchIndex: flakyIndex,
    });

    const result = await processIndexJobs(container, { batchSize: 10 });
    expect(result.completed).toBe(1);
    expect(result.retried).toBe(1);
    expect(result.dlq).toBe(0);
  });

  it("returns 0 when batchSize is non-positive (no-op without throwing)", async () => {
    const repo = makeRepo();
    const container = makeContainer({ indexJobRepository: repo });

    const result = await processIndexJobs(container, { batchSize: 0 });
    expect(result).toEqual({
      completed: 0,
      retried: 0,
      dlq: 0,
      unexpectedFailures: 0,
    });
    expect(repo.nextBatch).not.toHaveBeenCalled();
  });

  it("counts dlq when consumeIndexJob returns { kind: 'dlq' } on a non-retryable error", async () => {
    const repo = makeRepo();
    // attempts = max - 1 means `consumeIndexJob` sees nextAttempts === max
    // even for a retryable failure → falls into the dlq branch.
    const exhaustedJob = IndexJob.reconstruct({
      id: "dlq-job",
      noteId: noteId(3),
      op: "upsert",
      snapshot: snapshot({ noteId: noteId(3) }),
      attempts: CONSUME_INDEX_JOB_MAX_ATTEMPTS - 1,
      lastError: "previously failed",
      enqueuedAt: T0,
    });
    repo.nextBatch
      .mockResolvedValueOnce([exhaustedJob])
      .mockResolvedValueOnce([]);
    const flakyIndex = makeIndex({
      upsert: vi
        .fn()
        .mockRejectedValueOnce(new SearchIndexUnavailableError("down")),
    });
    const container = makeContainer({
      indexJobRepository: repo,
      searchIndex: flakyIndex,
    });

    const result = await processIndexJobs(container, { batchSize: 10 });
    expect(result.completed).toBe(0);
    expect(result.retried).toBe(0);
    expect(result.dlq).toBe(1);
    expect(result.unexpectedFailures).toBe(0);
    expect(repo.fail).toHaveBeenCalledTimes(1);
  });

  it("isolates one failing row in a batch when consumeIndexJob throws unexpectedly, continues draining, and counts unexpectedFailures", async () => {
    const repo = makeRepo();
    const j1 = makeUpsertJob("boom");
    const j2 = makeUpsertJob("ok");
    repo.nextBatch.mockResolvedValueOnce([j1, j2]).mockResolvedValueOnce([]);
    const container = makeContainer({ indexJobRepository: repo });

    const mocked = vi.mocked(consumeIndexJob);
    mocked.mockImplementationOnce(async () => {
      throw new Error("unexpected");
    });
    mocked.mockImplementationOnce(async () => ({ kind: "completed" }));

    const result = await processIndexJobs(container, { batchSize: 10 });
    expect(result.completed).toBe(1);
    expect(result.retried).toBe(0);
    expect(result.dlq).toBe(0);
    expect(result.unexpectedFailures).toBe(1);

    const logger = container.logger as FakeLogger;
    const errors = logger.byLevel("error");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain(j1.id);
    expect(errors[0]?.meta).toMatchObject({
      jobId: j1.id,
      outcome: "unexpected",
    });
  });
});
