import { describe, expect, it, vi } from "vitest";
import { FakeActivityLogRepository } from "@/core/application/__tests__/fakes/fakeActivityLogRepository";
import type { WorkerContainer } from "@/core/application/di/types";
import type { Clock } from "@/core/application/ports/clock";
import { UserId } from "@/core/domain/identity/valueObject";
import { NoteId } from "@/core/domain/note/valueObject";
import { IndexJob, type NoteSnapshot } from "@/core/domain/search/entity";
import type { IndexJobRepository } from "@/core/domain/search/ports/indexJobRepository";
import type { SearchIndex } from "@/core/domain/search/ports/searchIndex";
import {
  SearchIndexUnavailableError,
  SearchTimeoutError,
} from "@/core/domain/search/ports/searchIndex";
import { FakeIdGenerator, FakeLogger } from "../../__tests__/fakes";
import { isSystemError, SystemErrorCode } from "../../errors";
import {
  CONSUME_INDEX_JOB_MAX_ATTEMPTS,
  consumeIndexJob,
} from "../consumeIndexJob";

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
type SearchIndexSpy = SearchIndex & {
  upsert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
  bulkRebuildFromSnapshots: ReturnType<typeof vi.fn>;
};

function makeRepo(): IndexJobRepoSpy {
  return {
    enqueue: vi.fn(async () => {}),
    nextBatch: vi.fn(async () => []),
    complete: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
  };
}

function makeIndex(over: Partial<SearchIndex> = {}): SearchIndexSpy {
  return {
    upsert: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    query: vi.fn(async () => ({ hits: [], nextCursor: null })),
    bulkRebuildFromSnapshots: vi.fn(async () => {}),
    ...over,
  } as SearchIndexSpy;
}

function makeContainer(over: {
  searchIndex?: SearchIndex;
  indexJobRepository?: IndexJobRepository;
  logger?: FakeLogger;
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
    llmCallLogRecorder: {
      recordCall: vi.fn(async () => {}),
      pruneOlderThan: vi.fn(async () => ({ deleted: 0 })),
    },
    clock: over.clock ?? fixedClock(T0),
    idGenerator: new FakeIdGenerator(1),
    logger: over.logger ?? new FakeLogger(),
  };
}

function makeUpsertJob(over: Partial<NoteSnapshot> = {}) {
  const snap = snapshot(over);
  return IndexJob.create(
    { id: "job-upsert", noteId: snap.noteId, op: "upsert", snapshot: snap },
    T0,
  );
}

function makeDeleteJob() {
  return IndexJob.create(
    { id: "job-delete", noteId: noteId(2), op: "delete", snapshot: null },
    T0,
  );
}

describe("consumeIndexJob — happy paths", () => {
  it("upsert: forwards the snapshot to SearchIndex.upsert and marks the job complete", async () => {
    const searchIndex = makeIndex();
    const indexJobRepository = makeRepo();
    const container = makeContainer({
      searchIndex,
      indexJobRepository,
      clock: fixedClock(new Date(42)),
    });
    const job = makeUpsertJob();

    const outcome = await consumeIndexJob({ container, input: { job } });

    expect(outcome).toEqual({ kind: "completed" });
    expect(searchIndex.upsert).toHaveBeenCalledTimes(1);
    const doc = searchIndex.upsert.mock.calls[0]?.[0];
    expect(doc?.indexedAt.getTime()).toBe(42);
    expect(indexJobRepository.complete).toHaveBeenCalledWith(job.id);
    expect(indexJobRepository.fail).not.toHaveBeenCalled();
  });

  it("delete: forwards the noteId to SearchIndex.delete and marks the job complete", async () => {
    const searchIndex = makeIndex();
    const indexJobRepository = makeRepo();
    const container = makeContainer({ searchIndex, indexJobRepository });
    const job = makeDeleteJob();

    const outcome = await consumeIndexJob({ container, input: { job } });

    expect(outcome).toEqual({ kind: "completed" });
    expect(searchIndex.delete).toHaveBeenCalledWith(job.noteId);
    expect(indexJobRepository.complete).toHaveBeenCalledWith(job.id);
  });
});

describe("consumeIndexJob — transient failure", () => {
  it("records the attempt via fail() and returns retry when attempts remain", async () => {
    const searchIndex = makeIndex({
      upsert: vi.fn(async () => {
        throw new SearchIndexUnavailableError("index down");
      }),
    });
    const indexJobRepository = makeRepo();
    const logger = new FakeLogger();
    const container = makeContainer({
      searchIndex,
      indexJobRepository,
      logger,
      clock: fixedClock(new Date(99)),
    });
    const job = makeUpsertJob();

    const outcome = await consumeIndexJob({ container, input: { job } });

    expect(outcome.kind).toBe("retry");
    expect(indexJobRepository.fail).toHaveBeenCalledTimes(1);
    const [failedId, failedMsg, failedAt] =
      indexJobRepository.fail.mock.calls[0] ?? [];
    expect(failedId).toBe(job.id);
    expect(failedMsg).toContain("index down");
    expect((failedAt as Date)?.getTime()).toBe(99);
    expect(indexJobRepository.complete).not.toHaveBeenCalled();
    expect(logger.byLevel("warn").length).toBeGreaterThan(0);
  });

  it("treats SearchTimeoutError as retryable", async () => {
    const searchIndex = makeIndex({
      delete: vi.fn(async () => {
        throw new SearchTimeoutError("timed out");
      }),
    });
    const container = makeContainer({ searchIndex });
    const job = makeDeleteJob();
    const outcome = await consumeIndexJob({ container, input: { job } });
    expect(outcome.kind).toBe("retry");
  });
});

describe("consumeIndexJob — DLQ paths", () => {
  it("routes to DLQ once attempts reach the max (transient failure)", async () => {
    const searchIndex = makeIndex({
      upsert: vi.fn(async () => {
        throw new SearchIndexUnavailableError("still down");
      }),
    });
    const indexJobRepository = makeRepo();
    const logger = new FakeLogger();
    const container = makeContainer({
      searchIndex,
      indexJobRepository,
      logger,
    });

    // Job already at max-1 attempts: this failure pushes it to DLQ.
    const seed = makeUpsertJob();
    const job = IndexJob.recordAttempt(
      IndexJob.recordAttempt(seed, "first", T0),
      "second",
      T0,
    );
    expect(job.attempts as unknown as number).toBe(
      CONSUME_INDEX_JOB_MAX_ATTEMPTS - 1,
    );

    const outcome = await consumeIndexJob({ container, input: { job } });

    expect(outcome.kind).toBe("dlq");
    expect(indexJobRepository.fail).toHaveBeenCalledTimes(1);
    expect(logger.byLevel("error").length).toBeGreaterThan(0);
  });

  it("routes to DLQ immediately when the failure is not retryable", async () => {
    const searchIndex = makeIndex({
      upsert: vi.fn(async () => {
        throw new Error("schema mismatch — not transient");
      }),
    });
    const indexJobRepository = makeRepo();
    const logger = new FakeLogger();
    const container = makeContainer({
      searchIndex,
      indexJobRepository,
      logger,
    });

    const outcome = await consumeIndexJob({
      container,
      input: { job: makeUpsertJob() },
    });

    expect(outcome.kind).toBe("dlq");
    expect(indexJobRepository.fail).toHaveBeenCalledTimes(1);
    expect(logger.byLevel("error").length).toBeGreaterThan(0);
  });
});

describe("consumeIndexJob — data integrity", () => {
  // Reconstructing an upsert job from a corrupted row may yield
  // `snapshot === null`. Treat as data-integrity failure: still go through
  // fail() (so the row is not silently lost), but flag with SystemError
  // so the worker can route to DLQ on first encounter.
  it("treats an upsert job with a missing snapshot as DLQ + DataIntegrityError", async () => {
    const indexJobRepository = makeRepo();
    const logger = new FakeLogger();
    const container = makeContainer({ indexJobRepository, logger });
    // Forge a degenerate aggregate that bypasses the factory invariant.
    const corrupted = {
      ...makeUpsertJob(),
      snapshot: null,
    } as unknown as Parameters<typeof consumeIndexJob>[0]["input"]["job"];

    const outcome = await consumeIndexJob({
      container,
      input: { job: corrupted },
    });

    expect(outcome.kind).toBe("dlq");
    if (outcome.kind === "dlq") {
      expect(outcome.error).toMatch(/snapshot/i);
    }
    expect(indexJobRepository.fail).toHaveBeenCalledTimes(1);
    // The thrown SystemError carries the DataIntegrityError code; we check
    // the wrapped cause indirectly via the recorded log entry.
    const errorEntries = logger.byLevel("error");
    expect(errorEntries.length).toBe(1);
    const cause = errorEntries[0]?.meta?.cause;
    expect(isSystemError(cause)).toBe(true);
    if (isSystemError(cause)) {
      expect(cause.code).toBe(SystemErrorCode.DataIntegrityError);
    }
  });
});
