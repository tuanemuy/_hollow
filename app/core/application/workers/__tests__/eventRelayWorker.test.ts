import { describe, expect, it, vi } from "vitest";
import type { WorkerContainer } from "../../di/types";
import { SystemClock } from "../../ports/clock";
import { ConsoleLogger } from "../../ports/logger";
import type {
  ClaimPendingArgs,
  OutboxRepository,
} from "../../ports/outboxRepository";
import { FakeIdGenerator } from "../../__tests__/fakes";
import { type EventDispatcher, processOutboxEvents } from "../eventRelayWorker";

// Pure unit tests for the `workerId` resolution path inside
// `processOutboxBatch`. The integration suite covers the dispatch /
// finalize round-trip; this file pins down the contract:
//
//   - When `options.workerId` is omitted, the worker mints one per tick
//     via `container.idGenerator.next()`. This is the regression guard
//     for Issue #188 — the previous implementation used a module-top-
//     level `crypto.randomUUID()` which Cloudflare Workers' global-
//     scope validation (10021) rejects at deploy time.
//   - When `options.workerId` is supplied, the explicit value wins and
//     the container's `IdGenerator` is not consulted.
function buildContainerStub(
  idGenerator: FakeIdGenerator,
  outboxRepository: OutboxRepository,
): WorkerContainer {
  return {
    clock: SystemClock,
    idGenerator,
    logger: ConsoleLogger,
    outboxRepository,
  } as unknown as WorkerContainer;
}

function buildNoopRepo(): OutboxRepository & {
  claimPending: ReturnType<typeof vi.fn>;
  finalize: ReturnType<typeof vi.fn>;
} {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    claimPending: vi.fn().mockResolvedValue([]),
    finalize: vi.fn().mockResolvedValue(undefined),
    pruneProcessed: vi.fn().mockResolvedValue({ deleted: 0 }),
  };
}

const noopDispatch: EventDispatcher = async () => [];

describe("processOutboxEvents — workerId resolution", () => {
  it("mints workerId via container.idGenerator when options.workerId is omitted", async () => {
    const idGenerator = new FakeIdGenerator();
    const idSpy = vi.spyOn(idGenerator, "next");
    const repo = buildNoopRepo();
    const container = buildContainerStub(idGenerator, repo);

    await processOutboxEvents(container, noopDispatch);

    expect(repo.claimPending).toHaveBeenCalledTimes(1);
    const args = repo.claimPending.mock.calls[0]?.[0] as ClaimPendingArgs;
    expect(args.workerId).toBe("ffffffff-ffff-7fff-8fff-000000000001");
    expect(idSpy).toHaveBeenCalledTimes(1);
  });

  it("prefers options.workerId over the container.idGenerator fallback", async () => {
    const idGenerator = new FakeIdGenerator();
    const idSpy = vi.spyOn(idGenerator, "next");
    const repo = buildNoopRepo();
    const container = buildContainerStub(idGenerator, repo);

    await processOutboxEvents(container, noopDispatch, {
      workerId: "explicit-caller-id",
    });

    expect(repo.claimPending).toHaveBeenCalledTimes(1);
    const args = repo.claimPending.mock.calls[0]?.[0] as ClaimPendingArgs;
    expect(args.workerId).toBe("explicit-caller-id");
    expect(idSpy).not.toHaveBeenCalled();
  });
});
