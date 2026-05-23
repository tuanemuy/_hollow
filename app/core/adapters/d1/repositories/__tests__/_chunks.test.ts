import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAX_CONCURRENCY,
  SAFE_CHUNK_SIZE,
  selectInChunks,
} from "../_chunks";

describe("selectInChunks", () => {
  it("returns [] and never calls the runner for an empty input", async () => {
    const runner = vi.fn(async () => [] as const);
    const out = await selectInChunks<string>([], runner);
    expect(out).toEqual([]);
    expect(runner).not.toHaveBeenCalled();
  });

  it("invokes the runner exactly once when ids.length < chunkSize", async () => {
    const runner = vi.fn(async (chunk: readonly string[]) =>
      chunk.map((id) => `r:${id}`),
    );
    const out = await selectInChunks(["a", "b", "c"], runner, {
      chunkSize: 10,
    });
    expect(out).toEqual(["r:a", "r:b", "r:c"]);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0][0]).toEqual(["a", "b", "c"]);
  });

  it("invokes the runner exactly once when ids.length === chunkSize", async () => {
    const ids = Array.from({ length: 5 }, (_, i) => `id-${i}`);
    const runner = vi.fn(async (chunk: readonly string[]) => chunk);
    const out = await selectInChunks(ids, runner, { chunkSize: 5 });
    expect(out).toEqual(ids);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("splits into two chunks when ids.length === chunkSize + 1 and concatenates", async () => {
    const ids = Array.from({ length: 6 }, (_, i) => `id-${i}`);
    const runner = vi.fn(async (chunk: readonly string[]) => chunk);
    const out = await selectInChunks(ids, runner, { chunkSize: 5 });
    expect(out).toEqual(ids);
    expect(runner).toHaveBeenCalledTimes(2);
    expect(runner.mock.calls[0][0]).toEqual(ids.slice(0, 5));
    expect(runner.mock.calls[1][0]).toEqual(ids.slice(5));
  });

  it("splits 250 ids into 3 chunks of 90/90/70 and preserves chunk order", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const seenChunks: string[][] = [];
    const runner = vi.fn(async (chunk: readonly string[]) => {
      seenChunks.push([...chunk]);
      return chunk;
    });
    const out = await selectInChunks(ids, runner, {
      chunkSize: SAFE_CHUNK_SIZE,
    });
    expect(runner).toHaveBeenCalledTimes(3);
    expect(seenChunks[0]).toHaveLength(90);
    expect(seenChunks[1]).toHaveLength(90);
    expect(seenChunks[2]).toHaveLength(70);
    expect(out).toEqual(ids);
  });

  it("throws when chunkSize <= 0", async () => {
    await expect(
      selectInChunks(["a"], async (c) => c, { chunkSize: 0 }),
    ).rejects.toThrow(/chunkSize/);
    await expect(
      selectInChunks(["a"], async (c) => c, { chunkSize: -1 }),
    ).rejects.toThrow(/chunkSize/);
  });

  it("throws when maxConcurrency <= 0", async () => {
    await expect(
      selectInChunks(["a"], async (c) => c, { maxConcurrency: 0 }),
    ).rejects.toThrow(/maxConcurrency/);
    await expect(
      selectInChunks(["a"], async (c) => c, { maxConcurrency: -1 }),
    ).rejects.toThrow(/maxConcurrency/);
  });

  // Runs chunks in parallel via a bounded worker pool. Asserts that the
  // resolved array still tracks chunk (input) order regardless of the
  // order in which the runner promises settle.
  it("preserves input chunk order when chunks resolve out of order", async () => {
    const ids = Array.from({ length: 9 }, (_, i) => `id-${i}`);
    const runner = vi.fn(async (chunk: readonly string[]) => {
      // Earlier chunks resolve slower, so settle order is reversed.
      const idx = Number(chunk[0]?.split("-")[1] ?? "0");
      await new Promise((r) => setTimeout(r, (9 - idx) * 2));
      return chunk;
    });
    const out = await selectInChunks(ids, runner, { chunkSize: 3 });
    expect(out).toEqual(ids);
    expect(runner).toHaveBeenCalledTimes(3);
  });

  it("rejects with the first runner failure when a chunk throws", async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `id-${i}`);
    const maxConcurrency = 3;
    let callCount = 0;
    const runner = vi.fn(async (chunk: readonly string[]) => {
      callCount++;
      if (chunk[0] === "id-0") throw new Error("boom");
      // Hold other workers long enough that the rejection bubbles up
      // before they can claim further chunks.
      await new Promise((r) => setTimeout(r, 20));
      return chunk;
    });
    await expect(
      selectInChunks(ids, runner, { chunkSize: 1, maxConcurrency }),
    ).rejects.toThrow(/boom/);
    // Bounded worker pool: only the workers that were already spun up
    // (<= maxConcurrency) ever invoked the runner. Chunks that no
    // worker had a chance to claim are never started.
    expect(runner.mock.calls.length).toBeLessThanOrEqual(maxConcurrency);
    expect(callCount).toBeLessThanOrEqual(maxConcurrency);
    // 30 chunks were prepared but the runner must not have seen all of
    // them — proves "unclaimed chunks are never started".
    expect(runner.mock.calls.length).toBeLessThan(ids.length);
  });

  it("respects maxConcurrency by capping in-flight runners", async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `id-${i}`);
    const maxConcurrency = 3;
    let inFlight = 0;
    let peak = 0;
    const runner = vi.fn(async (chunk: readonly string[]) => {
      inFlight++;
      if (inFlight > peak) peak = inFlight;
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return chunk;
    });
    const out = await selectInChunks(ids, runner, {
      chunkSize: 1,
      maxConcurrency,
    });
    expect(out).toEqual(ids);
    expect(runner).toHaveBeenCalledTimes(20);
    expect(peak).toBeLessThanOrEqual(maxConcurrency);
    expect(peak).toBeGreaterThan(0);
  });

  it("preserves input chunk order under bounded concurrency", async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `id-${i}`);
    const runner = vi.fn(async (chunk: readonly string[]) => {
      // Random-ish settle delays so chunks finish out of dispatch order.
      const idx = Number(chunk[0]?.split("-")[1] ?? "0");
      await new Promise((r) => setTimeout(r, (idx % 5) * 2));
      return chunk;
    });
    const out = await selectInChunks(ids, runner, {
      chunkSize: 1,
      maxConcurrency: 3,
    });
    expect(out).toEqual(ids);
  });

  it("defaults to DEFAULT_MAX_CONCURRENCY when not specified", async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `id-${i}`);
    let inFlight = 0;
    let peak = 0;
    const runner = vi.fn(async (chunk: readonly string[]) => {
      inFlight++;
      if (inFlight > peak) peak = inFlight;
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return chunk;
    });
    const out = await selectInChunks(ids, runner, { chunkSize: 1 });
    expect(out).toEqual(ids);
    expect(runner).toHaveBeenCalledTimes(200);
    expect(peak).toBeLessThanOrEqual(DEFAULT_MAX_CONCURRENCY);
    expect(peak).toBeGreaterThan(0);
  });
});
