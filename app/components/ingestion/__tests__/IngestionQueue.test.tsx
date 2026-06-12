// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";
import { AppServerError } from "@/core/presentation/errorResponse";
import type { IngestionJobWire } from "../actions";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const fetchJobsMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter([[fetchJobsMock, fetchJobsMock]], vi.fn()),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

vi.mock("../actions", () => ({
  getIngestionJobsFn: fetchJobsMock,
}));

// ADR-001: the queue's own polling control is the unit under test; the child
// row's render/server-fn dependencies are irrelevant here, so stub it down to
// a marker carrying `job.id`.
vi.mock("../IngestionJobRow", () => ({
  IngestionJobRow: ({ job }: { job: IngestionJobWire }) => (
    <div data-job-id={job.id} />
  ),
}));

const { IngestionQueue } = await import("../IngestionQueue");

// Mirrors the constants in IngestionQueue.tsx.
const POLL_INTERVAL_MS = 4000;
const POLL_BACKOFF_MS = 12000;
const POLL_IDLE_MS = 16000;

const baseJob: IngestionJobWire = {
  id: "job-1",
  ownerId: "owner-1",
  originalFileName: "doc.md",
  mimeType: "text/markdown",
  byteSize: 1024,
  kind: "markdown",
  status: "previewing",
  preview: {
    title: "Suggested Title",
    contentHtml: "<p>body</p>",
    suggestedDirectoryId: "dir-1",
    suggestedDirectoryName: null,
    frontMatterJson: "{}",
    suggestedTagNames: [],
    internalLinkRefs: [],
    mediaRefs: [],
  },
  errorCode: null,
  regenerationCount: 0,
  savedAsNoteId: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

const activeJob: IngestionJobWire = { ...baseJob, status: "processing" };
const idleJob: IngestionJobWire = { ...baseJob, status: "previewing" };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  fetchJobsMock.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  setVisibility("visible");
  vi.useRealTimers();
  fetchJobsMock.mockReset();
});

// Advance fake timers and flush the timer→async-fetch→setState→re-schedule
// chain. The extra microtask spins land the `await fetchJobs(...)` resolution
// and React state commits before assertions run.
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

async function dispatchVisibility(state: "visible" | "hidden") {
  setVisibility(state);
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

describe("IngestionQueue polling", () => {
  // Scenario 1a: an active queue keeps polling on the short (4s) cadence.
  it("polls on the active (4s) interval while jobs are active", async () => {
    fetchJobsMock.mockResolvedValue({ jobs: [activeJob] });

    act(() => {
      root.render(
        <IngestionQueue initialJobs={[activeJob]} includeDiscarded={false} />,
      );
    });

    // First schedule is always POLL_INTERVAL_MS regardless of active/idle.
    expect(fetchJobsMock).not.toHaveBeenCalled();
    await advance(POLL_INTERVAL_MS);
    expect(fetchJobsMock).toHaveBeenCalledTimes(1);

    // Active result → re-scheduled again at ~4000ms, repeatedly.
    await advance(POLL_INTERVAL_MS);
    expect(fetchJobsMock).toHaveBeenCalledTimes(2);
    await advance(POLL_INTERVAL_MS);
    expect(fetchJobsMock).toHaveBeenCalledTimes(3);
  });

  // Scenario 1b: an idle queue defers each tick to the long (16s) cadence. The
  // first schedule is still POLL_INTERVAL_MS; the idle interval only governs
  // the *next* tick once an idle result has landed.
  it("polls on the idle (16s) interval once the queue is idle", async () => {
    fetchJobsMock.mockResolvedValue({ jobs: [idleJob] });

    act(() => {
      root.render(
        <IngestionQueue initialJobs={[idleJob]} includeDiscarded={false} />,
      );
    });

    // First tick fires at POLL_INTERVAL_MS (fixed), returning idle jobs.
    await advance(POLL_INTERVAL_MS);
    expect(fetchJobsMock).toHaveBeenCalledTimes(1);

    // Another 4000ms: not due yet — the next tick was scheduled at 16000ms.
    await advance(POLL_INTERVAL_MS);
    expect(fetchJobsMock).toHaveBeenCalledTimes(1);

    // Remaining time to the 16000ms idle window → second tick fires.
    await advance(POLL_IDLE_MS - POLL_INTERVAL_MS);
    expect(fetchJobsMock).toHaveBeenCalledTimes(2);
  });

  // Scenario 2: returning the tab to visible schedules an immediate tick.
  it("fires an immediate tick on visibilitychange hidden→visible", async () => {
    fetchJobsMock.mockResolvedValue({ jobs: [idleJob] });

    act(() => {
      root.render(
        <IngestionQueue initialJobs={[idleJob]} includeDiscarded={false} />,
      );
    });

    // Hidden: the scheduled tick re-defers without fetching.
    await dispatchVisibility("hidden");
    await advance(POLL_INTERVAL_MS);
    expect(fetchJobsMock).not.toHaveBeenCalled();

    // Visible again → schedule(0) → fetch fires immediately on the next tick.
    await dispatchVisibility("visible");
    await advance(0);
    expect(fetchJobsMock).toHaveBeenCalledTimes(1);
  });

  // Scenario 3: a fatal kind (`unauthorized`) stops polling permanently — even
  // a re-render (effect re-run) must not revive it.
  it("stops polling permanently after an unauthorized error", async () => {
    fetchJobsMock.mockRejectedValue(
      new AppServerError({
        kind: "unauthorized",
        code: "unauthorized",
        message: "unauthorized",
      }),
    );

    act(() => {
      root.render(
        <IngestionQueue initialJobs={[activeJob]} includeDiscarded={false} />,
      );
    });

    await advance(POLL_INTERVAL_MS);
    expect(fetchJobsMock).toHaveBeenCalledTimes(1);
    // RetryableError surfaces the displayed error; unauthorized is fatal so no
    // retry button (「今すぐ再取得」) is offered.
    expect(document.body.textContent ?? "").toContain("認証が必要です");
    expect(document.body.textContent ?? "").not.toContain("今すぐ再取得");

    // No further ticks no matter how far the clock advances.
    await advance(POLL_IDLE_MS * 3);
    expect(fetchJobsMock).toHaveBeenCalledTimes(1);

    // A re-render re-runs the effect; fatalRef must keep polling dead.
    act(() => {
      root.render(
        <IngestionQueue initialJobs={[activeJob]} includeDiscarded={false} />,
      );
    });
    await advance(POLL_IDLE_MS * 3);
    expect(fetchJobsMock).toHaveBeenCalledTimes(1);
  });

  // Scenario 4: `notFound` is non-fatal — it accrues on the failures counter
  // and only surfaces the poll-error notice after 3 consecutive failures.
  it("treats notFound as non-fatal and surfaces after 3 failures", async () => {
    fetchJobsMock.mockRejectedValue(
      new AppServerError({
        kind: "notFound",
        code: "not_found",
        message: "not found",
      }),
    );

    act(() => {
      root.render(
        <IngestionQueue initialJobs={[activeJob]} includeDiscarded={false} />,
      );
    });

    // 1st failure: first schedule is POLL_INTERVAL_MS; no notice yet.
    await advance(POLL_INTERVAL_MS);
    expect(fetchJobsMock).toHaveBeenCalledTimes(1);
    expect(document.body.textContent ?? "").not.toContain(
      "対象が見つかりません",
    );

    // 2nd failure: after one failure the active interval backs off to 12000ms.
    await advance(POLL_BACKOFF_MS);
    expect(fetchJobsMock).toHaveBeenCalledTimes(2);
    expect(document.body.textContent ?? "").not.toContain(
      "対象が見つかりません",
    );

    // 3rd failure → notice appears; polling has NOT stopped (non-fatal), so the
    // RetryableError offers a「今すぐ再取得」manual retry.
    await advance(POLL_BACKOFF_MS);
    expect(fetchJobsMock).toHaveBeenCalledTimes(3);
    expect(document.body.textContent ?? "").toContain("対象が見つかりません");
    expect(document.body.textContent ?? "").toContain("今すぐ再取得");

    // Polling continues past the fatal-style stop.
    await advance(POLL_BACKOFF_MS);
    expect(fetchJobsMock).toHaveBeenCalledTimes(4);
  });

  // Scenario 5: while a tick is in flight, a `schedule(0)` from visibilitychange
  // must NOT launch a concurrent fetch (inflightRef guard).
  it("suppresses a concurrent tick while a fetch is in flight", async () => {
    let resolveFetch: ((value: { jobs: IngestionJobWire[] }) => void) | null =
      null;
    fetchJobsMock.mockImplementation(
      () =>
        new Promise<{ jobs: IngestionJobWire[] }>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    act(() => {
      root.render(
        <IngestionQueue initialJobs={[activeJob]} includeDiscarded={false} />,
      );
    });

    // Launch the first (now-pending) fetch.
    await advance(POLL_INTERVAL_MS);
    expect(fetchJobsMock).toHaveBeenCalledTimes(1);

    // In-flight: a visible visibilitychange tries schedule(0), but the guard
    // drops the second tick entirely.
    await dispatchVisibility("visible");
    await advance(0);
    expect(fetchJobsMock).toHaveBeenCalledTimes(1);

    // Resolve the in-flight fetch → it re-schedules itself; no double fetch.
    await act(async () => {
      resolveFetch?.({ jobs: [activeJob] });
    });
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(fetchJobsMock).toHaveBeenCalledTimes(1);

    // The `finally` block must clear inflightRef so the re-scheduled tick can
    // fire: advancing one active interval lands exactly one more fetch.
    await advance(POLL_INTERVAL_MS);
    expect(fetchJobsMock).toHaveBeenCalledTimes(2);
  });

  // Scenario 6: unmount clears the pending timer so no tick fires afterwards.
  it("clears the timer on unmount", async () => {
    fetchJobsMock.mockResolvedValue({ jobs: [activeJob] });

    act(() => {
      root.render(
        <IngestionQueue initialJobs={[activeJob]} includeDiscarded={false} />,
      );
    });

    act(() => {
      root.unmount();
    });

    await advance(POLL_IDLE_MS * 3);
    expect(fetchJobsMock).not.toHaveBeenCalled();
  });
});
