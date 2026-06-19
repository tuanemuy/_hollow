import { describe, expect, it } from "vitest";
import { D1LlmCallLogRecorder } from "../repositories/llmCallLogRecorder";
import * as schema from "../schema";
import { createTestContainer, type TestContainer } from "./helpers";

/**
 * Integration tests for `D1LlmCallLogRecorder` (#748): plain insert (no
 * idempotency key, ADR-008) and retention pruning by `occurred_at`.
 */

let counter = 0;
const nextId = (): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  return `0193e8f1-${block}-7000-8000-000000000003`;
};

async function countRows(container: TestContainer): Promise<number> {
  const rows = await container.db.select().from(schema.llmCallLog);
  return rows.length;
}

describe("D1LlmCallLogRecorder (integration)", () => {
  it("recordCall inserts one row per call (no conflict handling — ADR-008)", async () => {
    const container = createTestContainer();
    const recorder = new D1LlmCallLogRecorder(container.db);
    const owner = "0193e8f1-0001-7000-8000-000000000001";

    await recorder.recordCall({
      id: nextId(),
      ownerId: owner,
      provider: "anthropic",
      occurredAt: new Date("2026-06-10T10:00:00.000Z"),
    });
    await recorder.recordCall({
      id: nextId(),
      ownerId: owner,
      provider: "anthropic",
      occurredAt: new Date("2026-06-10T10:05:00.000Z"),
    });

    expect(await countRows(container)).toBe(2);
    const rows = await container.db.select().from(schema.llmCallLog);
    expect(rows[0]?.occurredAt).toBe("2026-06-10T10:00:00.000Z");
  });

  it("pruneOlderThan deletes only rows strictly before the cutoff", async () => {
    const container = createTestContainer();
    const recorder = new D1LlmCallLogRecorder(container.db);
    const owner = "0193e8f1-0002-7000-8000-000000000001";

    // Two old rows, one at the cutoff boundary, one after.
    await recorder.recordCall({
      id: nextId(),
      ownerId: owner,
      provider: "anthropic",
      occurredAt: new Date("2026-06-08T00:00:00.000Z"),
    });
    await recorder.recordCall({
      id: nextId(),
      ownerId: owner,
      provider: "anthropic",
      occurredAt: new Date("2026-06-08T11:59:59.000Z"),
    });
    // Exactly at cutoff — NOT deleted (predicate is strictly `<`).
    await recorder.recordCall({
      id: nextId(),
      ownerId: owner,
      provider: "anthropic",
      occurredAt: new Date("2026-06-08T12:00:00.000Z"),
    });
    await recorder.recordCall({
      id: nextId(),
      ownerId: owner,
      provider: "anthropic",
      occurredAt: new Date("2026-06-09T00:00:00.000Z"),
    });

    const { deleted } = await recorder.pruneOlderThan(
      new Date("2026-06-08T12:00:00.000Z"),
    );
    expect(deleted).toBe(2);
    expect(await countRows(container)).toBe(2);
  });
});
