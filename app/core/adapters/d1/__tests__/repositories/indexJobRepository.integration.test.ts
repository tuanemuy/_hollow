import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../../schema";
import { createTestContainer, type TestContainer } from "../helpers";

/**
 * D1 integration tests for `D1IndexJobRepository.nextBatch` — guards the
 * SQL-level `attempts < maxAttempts` filter that powers the DLQ
 * threshold (Issue #145). The fake `IndexJobRepository` used by
 * application-layer tests cannot observe whether the adapter's inner
 * SELECT / outer UPDATE WHERE actually exclude DLQ rows, nor whether
 * the `attempts++` claim is committed against the right rows.
 *
 * `index_jobs` carries no FK to `notes` / `users`, so the harness can
 * seed rows directly via `db.insert(schema.indexJobs)` without dragging
 * along the `users → directories → notes` chain that other integration
 * tests require.
 */

const NOW = new Date("2026-05-23T00:00:00.000Z");
const TZ = NOW.toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const prefHex = prefix.toString(16).padStart(2, "0");
  return `0193e7d0-${block}-7000-8000-0000000000${prefHex}`;
};

type SeedJob = Readonly<{
  id: string;
  noteId: string;
  attempts: number;
  processedAt?: string | null;
  enqueuedAt?: string;
  op?: "upsert" | "delete";
}>;

async function seedJob(
  container: TestContainer,
  job: SeedJob,
): Promise<string> {
  await container.db.insert(schema.indexJobs).values({
    id: job.id,
    noteId: job.noteId,
    op: job.op ?? "delete",
    payloadJson: null,
    attempts: job.attempts,
    lastError: null,
    enqueuedAt: job.enqueuedAt ?? TZ,
    processedAt: job.processedAt ?? null,
  });
  return job.id;
}

async function readAttempts(
  container: TestContainer,
  id: string,
): Promise<number | undefined> {
  const rows = await container.db
    .select({ attempts: schema.indexJobs.attempts })
    .from(schema.indexJobs)
    .where(eq(schema.indexJobs.id, id));
  return rows[0]?.attempts;
}

describe("D1IndexJobRepository.nextBatch (integration)", () => {
  it("picks rows with attempts < maxAttempts and increments their attempts", async () => {
    const container = createTestContainer();
    const id = await seedJob(container, {
      id: nextId(0x10),
      noteId: nextId(0x11),
      attempts: 0,
    });

    const picked = await container.indexJobRepository.nextBatch(10, NOW, 3);

    expect(picked).toHaveLength(1);
    expect(picked[0]?.id).toBe(id);
    // RETURNING reflects the post-update value: the inner SELECT picked
    // a row with attempts=0, then the outer UPDATE bumped it to 1.
    expect(picked[0]?.attempts).toBe(1);
    // Independent SELECT confirms the increment was actually committed
    // (not just an in-memory projection).
    expect(await readAttempts(container, id)).toBe(1);
  });

  it("excludes rows with attempts >= maxAttempts while keeping eligible siblings", async () => {
    const container = createTestContainer();
    const dlqId = await seedJob(container, {
      id: nextId(0x20),
      noteId: nextId(0x21),
      attempts: 3,
    });
    const pendingId = await seedJob(container, {
      id: nextId(0x22),
      noteId: nextId(0x23),
      attempts: 2,
    });

    const picked = await container.indexJobRepository.nextBatch(10, NOW, 3);

    expect(picked.map((j) => j.id)).toEqual([pendingId]);
    // DLQ row's attempts must remain untouched — the outer UPDATE WHERE
    // is what guards this, and we want a regression alarm if the guard
    // is ever dropped.
    expect(await readAttempts(container, dlqId)).toBe(3);
    expect(await readAttempts(container, pendingId)).toBe(3);
  });

  it("crosses the DLQ threshold on the claim and excludes the row on the next tick", async () => {
    const container = createTestContainer();
    const id = await seedJob(container, {
      id: nextId(0x30),
      noteId: nextId(0x31),
      attempts: 2,
    });

    // First claim: attempts goes 2 → 3 (== maxAttempts). The row is
    // still returned on this tick because the inner SELECT saw the
    // pre-increment value.
    const first = await container.indexJobRepository.nextBatch(10, NOW, 3);
    expect(first.map((j) => j.id)).toEqual([id]);
    expect(await readAttempts(container, id)).toBe(3);

    // Second claim: attempts is now 3, which fails the `attempts <
    // maxAttempts` filter at both the inner SELECT and the outer UPDATE
    // WHERE — the row must drop out of the batch.
    const second = await container.indexJobRepository.nextBatch(10, NOW, 3);
    expect(second).toEqual([]);
    // And its attempts must stay at exactly 3 — no spurious increment
    // from the excluded path.
    expect(await readAttempts(container, id)).toBe(3);
  });

  it("returns [] for non-positive or non-integer maxAttempts without touching rows", async () => {
    const container = createTestContainer();
    const id = await seedJob(container, {
      id: nextId(0x40),
      noteId: nextId(0x41),
      attempts: 0,
    });

    // The adapter guards with `Number.isInteger(maxAttempts) &&
    // maxAttempts > 0` — every form below must short-circuit before any
    // SQL runs (so attempts must remain 0 across all three calls).
    expect(await container.indexJobRepository.nextBatch(10, NOW, 0)).toEqual(
      [],
    );
    expect(await container.indexJobRepository.nextBatch(10, NOW, -1)).toEqual(
      [],
    );
    expect(await container.indexJobRepository.nextBatch(10, NOW, 1.5)).toEqual(
      [],
    );

    expect(await readAttempts(container, id)).toBe(0);

    // Sanity: with a valid maxAttempts the same row is pickable —
    // proves the [] results above were caused by the guard, not by the
    // row being structurally unfetchable.
    const ok = await container.indexJobRepository.nextBatch(10, NOW, 3);
    expect(ok.map((j) => j.id)).toEqual([id]);
  });

  it("excludes rows with non-null processed_at (regression guard)", async () => {
    // Existing behaviour predating the maxAttempts filter: `processed_at
    // IS NULL` is the primary pending predicate. A row that has been
    // completed but not yet pruned must never come back into a batch,
    // even when attempts < maxAttempts.
    const container = createTestContainer();
    const processedId = await seedJob(container, {
      id: nextId(0x50),
      noteId: nextId(0x51),
      attempts: 0,
      processedAt: TZ,
    });
    const pendingId = await seedJob(container, {
      id: nextId(0x52),
      noteId: nextId(0x53),
      attempts: 0,
    });

    const picked = await container.indexJobRepository.nextBatch(10, NOW, 3);

    expect(picked.map((j) => j.id)).toEqual([pendingId]);
    // The already-completed row's attempts must not be bumped — the
    // `processed_at IS NULL` filter must hold on the outer UPDATE WHERE
    // as well, not only the inner SELECT.
    expect(await readAttempts(container, processedId)).toBe(0);
  });
});
