import { describe, expect, it, vi } from "vitest";
import { SAFE_CHUNK_SIZE, selectInChunks } from "../_chunks";

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
    const out = await selectInChunks(["a", "b", "c"], runner, 10);
    expect(out).toEqual(["r:a", "r:b", "r:c"]);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0][0]).toEqual(["a", "b", "c"]);
  });

  it("invokes the runner exactly once when ids.length === chunkSize", async () => {
    const ids = Array.from({ length: 5 }, (_, i) => `id-${i}`);
    const runner = vi.fn(async (chunk: readonly string[]) => chunk);
    const out = await selectInChunks(ids, runner, 5);
    expect(out).toEqual(ids);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("splits into two chunks when ids.length === chunkSize + 1 and concatenates", async () => {
    const ids = Array.from({ length: 6 }, (_, i) => `id-${i}`);
    const runner = vi.fn(async (chunk: readonly string[]) => chunk);
    const out = await selectInChunks(ids, runner, 5);
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
    const out = await selectInChunks(ids, runner, SAFE_CHUNK_SIZE);
    expect(runner).toHaveBeenCalledTimes(3);
    expect(seenChunks[0]).toHaveLength(90);
    expect(seenChunks[1]).toHaveLength(90);
    expect(seenChunks[2]).toHaveLength(70);
    expect(out).toEqual(ids);
  });

  it("throws when chunkSize <= 0", async () => {
    await expect(selectInChunks(["a"], async (c) => c, 0)).rejects.toThrow(
      /chunkSize/,
    );
    await expect(selectInChunks(["a"], async (c) => c, -1)).rejects.toThrow(
      /chunkSize/,
    );
  });

  // Runs chunks in parallel via `Promise.all`. Asserts that the
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
    const out = await selectInChunks(ids, runner, 3);
    expect(out).toEqual(ids);
    expect(runner).toHaveBeenCalledTimes(3);
  });

  it("rejects with the first runner failure when a chunk throws", async () => {
    const ids = Array.from({ length: 9 }, (_, i) => `id-${i}`);
    const runner = vi.fn(async (chunk: readonly string[]) => {
      if (chunk[0] === "id-3") throw new Error("boom");
      return chunk;
    });
    await expect(selectInChunks(ids, runner, 3)).rejects.toThrow(/boom/);
  });
});
