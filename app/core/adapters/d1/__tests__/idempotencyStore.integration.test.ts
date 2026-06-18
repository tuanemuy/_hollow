import { describe, expect, it } from "vitest";
import { EventId } from "@/core/domain/common/event";
import { processedEvents } from "../schema";
import { createTestContainer } from "./helpers";

let counter = 0;
const nextEventId = (): EventId => {
  counter += 1;
  return EventId.create(
    `0193e7d0-${counter.toString(16).padStart(4, "0")}-7000-9000-700000000000`,
  );
};

describe("D1IdempotencyStore", () => {
  it("returns alreadyProcessed=false on first claim and true on subsequent claims", async () => {
    const container = createTestContainer();
    const id = nextEventId();

    const first = await container.idempotencyStore.markProcessed(id);
    expect(first.alreadyProcessed).toBe(false);

    const second = await container.idempotencyStore.markProcessed(id);
    expect(second.alreadyProcessed).toBe(true);

    const third = await container.idempotencyStore.markProcessed(id);
    expect(third.alreadyProcessed).toBe(true);
  });

  it("treats different event ids independently", async () => {
    const container = createTestContainer();
    const a = nextEventId();
    const b = nextEventId();

    expect(
      (await container.idempotencyStore.markProcessed(a)).alreadyProcessed,
    ).toBe(false);
    expect(
      (await container.idempotencyStore.markProcessed(b)).alreadyProcessed,
    ).toBe(false);
    expect(
      (await container.idempotencyStore.markProcessed(a)).alreadyProcessed,
    ).toBe(true);
    expect(
      (await container.idempotencyStore.markProcessed(b)).alreadyProcessed,
    ).toBe(true);
  });

  it("serialises concurrent claims on the same id — exactly one wins", async () => {
    const container = createTestContainer();
    const id = nextEventId();

    const results = await Promise.all([
      container.idempotencyStore.markProcessed(id),
      container.idempotencyStore.markProcessed(id),
      container.idempotencyStore.markProcessed(id),
    ]);
    const winners = results.filter((r) => !r.alreadyProcessed);
    expect(winners).toHaveLength(1);
  });

  it("hasProcessed returns false before markProcessed and true after", async () => {
    const container = createTestContainer();
    const id = nextEventId();

    expect(await container.idempotencyStore.hasProcessed(id)).toBe(false);

    const claim = await container.idempotencyStore.markProcessed(id);
    expect(claim.alreadyProcessed).toBe(false);

    expect(await container.idempotencyStore.hasProcessed(id)).toBe(true);
  });

  it("hasProcessed is a side-effect-free snapshot — concurrent dedup still requires markProcessed atomicity", async () => {
    const container = createTestContainer();
    const id = nextEventId();

    // Two callers can both observe `hasProcessed === false` before
    // either runs `markProcessed`; the atomic claim still serialises
    // a single winner. This documents that `hasProcessed` is the
    // pre-dispatch read used by the queue consumer, not a substitute
    // for the atomic claim that follows.
    expect(await container.idempotencyStore.hasProcessed(id)).toBe(false);
    expect(await container.idempotencyStore.hasProcessed(id)).toBe(false);

    const first = await container.idempotencyStore.markProcessed(id);
    const second = await container.idempotencyStore.markProcessed(id);
    expect(first.alreadyProcessed).toBe(false);
    expect(second.alreadyProcessed).toBe(true);
    expect(await container.idempotencyStore.hasProcessed(id)).toBe(true);
  });
});

describe("D1IdempotencyStore.pruneProcessed (integration)", () => {
  it("deletes only records stamped strictly before the cutoff", async () => {
    const container = createTestContainer();
    const old = nextEventId();
    const onCutoff = nextEventId();
    const fresh = nextEventId();

    await container.db.insert(processedEvents).values([
      { id: old, processedAt: new Date(1_000) },
      { id: onCutoff, processedAt: new Date(50_000) },
      { id: fresh, processedAt: new Date(100_000) },
    ]);

    const result = await container.idempotencyStore.pruneProcessed(
      new Date(50_000),
    );
    // Strictly-before: the row stamped exactly at the cutoff is retained.
    expect(result.deleted).toBe(1);

    const remaining = await container.db.select().from(processedEvents);
    const remainingIds = remaining.map((r) => r.id).sort();
    expect(remainingIds).toEqual([onCutoff, fresh].sort());
  });

  it("returns deleted=0 when nothing predates the cutoff", async () => {
    const container = createTestContainer();
    const id = nextEventId();
    await container.db
      .insert(processedEvents)
      .values({ id, processedAt: new Date(100_000) });

    const result = await container.idempotencyStore.pruneProcessed(
      new Date(50_000),
    );
    expect(result.deleted).toBe(0);

    const remaining = await container.db.select().from(processedEvents);
    expect(remaining).toHaveLength(1);
  });
});
