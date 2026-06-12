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

// Per-server-fn mocks. Each call to `useServerFn(<fn>)` resolves to one of
// these depending on the fn identity. The dialog uses 4 server fns
// (`uploadFileFn`, `getIngestionJobFn`, `discardIngestionPreviewFn`,
// `getDirectoryTreeFn`). We dispatch via a router keyed on the fn passed in.
const uploadMock = vi.fn();
const getJobMock = vi.fn();
const discardMock = vi.fn();
const getTreeMock = vi.fn();
const regenerateMock = vi.fn();
const ownerRetryMock = vi.fn();
const commitMock = vi.fn();
const getEffectivePromptsMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  // Identity dispatch via the imported references below. The module
  // mock for `./actions` returns those same references, so the
  // strict-equality compare inside `useServerFnRouter` is stable.
  useServerFn: useServerFnRouter(
    [
      [uploadMock, uploadMock],
      [getJobMock, getJobMock],
      [discardMock, discardMock],
      [getTreeMock, getTreeMock],
      [regenerateMock, regenerateMock],
      [ownerRetryMock, ownerRetryMock],
      [commitMock, commitMock],
      [getEffectivePromptsMock, getEffectivePromptsMock],
    ],
    vi.fn(),
  ),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

vi.mock("../actions", () => ({
  uploadFileFn: uploadMock,
  getIngestionJobFn: getJobMock,
  discardIngestionPreviewFn: discardMock,
  commitIngestionPreviewFn: commitMock,
  regenerateIngestionPreviewFn: regenerateMock,
  ownerRetryIngestionJobFn: ownerRetryMock,
  getEffectiveIngestionPromptsFn: getEffectivePromptsMock,
}));

vi.mock("../../note/actions", () => ({
  getDirectoryTreeFn: getTreeMock,
}));

const navigateMock = vi.fn().mockResolvedValue(undefined);
const invalidateMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate: navigateMock, invalidate: invalidateMock }),
  Link: ({
    children,
    ...rest
  }: { children: React.ReactNode } & Record<string, unknown>) => (
    <a {...(rest as Record<string, string>)}>{children}</a>
  ),
}));

const { UploadDialog } = await import("../UploadDialog");

const baseJob: IngestionJobWire = {
  id: "job-1",
  ownerId: "owner-1",
  originalFileName: "doc.md",
  mimeType: "text/markdown",
  byteSize: 32,
  kind: "markdown",
  status: "pending",
  preview: null,
  errorCode: null,
  regenerationCount: 0,
  savedAsNoteId: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

const previewingJob: IngestionJobWire = {
  ...baseJob,
  status: "previewing",
  preview: {
    title: "Hello",
    contentHtml: "<p>hi</p>",
    suggestedDirectoryId: null,
    suggestedDirectoryName: null,
    frontMatterJson: "{}",
    suggestedTagNames: [],
    internalLinkRefs: [],
    mediaRefs: [],
  },
};

const failedJob: IngestionJobWire = {
  ...baseJob,
  status: "failed",
  errorCode: "INGESTION_TIMEOUT",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  uploadMock.mockReset();
  getJobMock.mockReset();
  discardMock.mockReset();
  getTreeMock.mockReset();
  regenerateMock.mockReset();
  ownerRetryMock.mockReset();
  commitMock.mockReset();
  getEffectivePromptsMock.mockReset();
  navigateMock.mockClear();
  invalidateMock.mockClear();
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
});

function findInputByAccept(): HTMLInputElement {
  const input =
    document.body.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error("file input not rendered");
  return input;
}

// The multi-file UploadingView renders a determinate (decorative) ProgressBar:
// the track is `aria-hidden` and its inner accent fill carries the ratio as an
// inline `width: N%` style. Read that percent back so the test can assert the
// bar advances in step with the count.
function uploadProgressPercent(): number {
  const fill = document.body.querySelector<HTMLElement>(
    '[aria-hidden="true"] > div[style*="width"]',
  );
  if (fill === null) throw new Error("determinate progress fill not rendered");
  const match = /width:\s*([\d.]+)%/.exec(fill.getAttribute("style") ?? "");
  if (match?.[1] === undefined) {
    throw new Error("progress fill has no width style");
  }
  return Number(match[1]);
}

function dispatchFile(input: HTMLInputElement, files: File[]) {
  // happy-dom's FileList constructor is not directly exposed; mock the
  // `files` getter on the element to return our array as a FileList-like.
  const fileList = {
    length: files.length,
    item: (i: number) => files[i] ?? null,
    [Symbol.iterator]: function* () {
      for (const f of files) yield f;
    },
  } as unknown as FileList;
  Object.defineProperty(input, "files", { value: fileList, writable: false });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("UploadDialog state machine", () => {
  it("starts in the `select` view when opened", () => {
    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });
    const dropzone = document.body.querySelector("label[for]");
    expect(dropzone?.textContent).toContain("ファイルをドラッグ");
  });

  it("transitions select → uploading → waiting → editing on a single-file happy path", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });
    // First poll: still pending. Second poll: previewing.
    getJobMock
      .mockResolvedValueOnce({ job: baseJob })
      .mockResolvedValueOnce({ job: previewingJob });
    getTreeMock.mockResolvedValue({ flat: [] });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });

    const file = new File(["x"], "doc.md", { type: "text/markdown" });
    act(() => {
      dispatchFile(findInputByAccept(), [file]);
    });
    // Flush microtasks for upload promise.
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });

    // We should now be in the `waiting` view. Advance time past the poll
    // interval to trigger the first getJob call.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    // One more flush so the previewing transition lands.
    await act(async () => {
      await Promise.resolve();
    });

    expect(getJobMock).toHaveBeenCalled();
    // editing view: title input should now be present with the preview value.
    const titleInput =
      document.body.querySelector<HTMLInputElement>('input[type="text"]');
    expect(titleInput?.value).toBe("Hello");
  });

  it("transitions editing → committed on a successful commit and links to the note", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });
    getJobMock
      .mockResolvedValueOnce({ job: baseJob })
      .mockResolvedValueOnce({ job: previewingJob });
    getTreeMock.mockResolvedValue({ flat: [] });
    commitMock.mockResolvedValue({ noteId: "note-99" });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });

    const file = new File(["x"], "doc.md", { type: "text/markdown" });
    act(() => {
      dispatchFile(findInputByAccept(), [file]);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // editing view: edit the title, then submit the form.
    const titleInput =
      document.body.querySelector<HTMLInputElement>('input[type="text"]');
    if (titleInput === null) throw new Error("title input not rendered");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(titleInput, "Edited Title");
      titleInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const form = document.body.querySelector("form");
    if (form === null) throw new Error("preview form not rendered");
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    // committed view: the edited title is echoed and a link to the new note
    // is rendered. The commit was called with the edited title.
    expect(commitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobId: "job-1",
          title: "Edited Title",
        }),
      }),
    );
    expect(document.body.textContent).toContain("ノートを登録しました");
    expect(document.body.textContent).toContain("Edited Title");
    const status = document.body.querySelector<HTMLElement>('[role="status"]');
    expect(status?.textContent).toBe("ノートを登録しました");
    // The mocked Link renders its props as attributes; the "ノートを開く"
    // link targets the new note's route.
    const openLink = Array.from(document.body.querySelectorAll("a")).find((a) =>
      a.textContent?.includes("ノートを開く"),
    );
    expect(openLink?.getAttribute("to")).toBe("/notes/$noteId");
    // Successful commit must NOT immediately navigate (it stays in the modal).
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("transitions to `failed` view when poll observes status=failed", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });
    getJobMock.mockResolvedValue({ job: failedJob });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });

    const file = new File(["x"], "doc.md", { type: "text/markdown" });
    act(() => {
      dispatchFile(findInputByAccept(), [file]);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // The failed view shows a user-facing message (never the raw internal
    // code) and the owner-facing actions (再試行 / キュー画面で詳細を見る / 破棄).
    expect(document.body.textContent).toContain("取り込みに失敗しました");
    expect(document.body.textContent).not.toContain("INGESTION_TIMEOUT");
    expect(document.body.textContent).toContain("再試行");
    expect(document.body.textContent).toContain("破棄");
    expect(document.body.textContent).toContain("キュー画面で詳細を見る");
  });

  it("renders a multi-result summary for multi-file uploads", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });

    const files = [
      new File(["a"], "a.md", { type: "text/markdown" }),
      new File(["b"], "b.md", { type: "text/markdown" }),
    ];
    act(() => {
      dispatchFile(findInputByAccept(), files);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain("2 件中 2 件をキューに追加");
  });

  // Also the `upload`-origin regression guard for Issue #319: an initial
  // upload (origin `upload`) that hits a fatal poll error still falls back to
  // `select` — only `existingJob`-origin sessions route to queue guidance.
  it("stops polling and surfaces the error when a Business-kind error is returned", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });
    // `AppServerError` is the canonical channel used by the
    // error-response middleware on the server side.
    const wrapped = new AppServerError({
      kind: "forbidden",
      code: "INGESTION_JOB_FORBIDDEN",
      message: "Ingestion job is not owned by actor",
    });
    getJobMock.mockRejectedValue(wrapped);

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });

    const file = new File(["x"], "doc.md", { type: "text/markdown" });
    act(() => {
      dispatchFile(findInputByAccept(), [file]);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Only one poll attempt — fatal error stops the loop immediately.
    expect(getJobMock).toHaveBeenCalledTimes(1);
    // Back in `select` view with an inline alert. We assert the alert
    // region is rendered without pinning the exact wording.
    const alert = document.body.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    // Dropzone is visible again — confirms the state machine returned
    // to the `select` view.
    expect(document.body.textContent).toContain("ファイルをドラッグ");
  });

  // W-T-001: EC-1 — when the poll loop exceeds POLL_TIMEOUT_MS (180s)
  // without observing a terminal status, the view must transition to
  // `timedOut`. `setSystemTime` is used so the `Date.now()` check
  // inside the loop sees a value past the budget after a single tick.
  it("transitions to `timedOut` after 180 seconds of polling", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });
    // Always still pending so the loop never reaches a terminal status.
    getJobMock.mockResolvedValue({ job: baseJob });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });
    const startedAt = new Date(2026, 0, 1, 0, 0, 0).getTime();
    vi.setSystemTime(startedAt);

    const file = new File(["x"], "doc.md", { type: "text/markdown" });
    act(() => {
      dispatchFile(findInputByAccept(), [file]);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });

    // Jump past the 180s budget so the next tick's Date.now() check
    // sees the timeout breach.
    vi.setSystemTime(startedAt + 181_000);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain(
      "推論の完了を待ちきれませんでした",
    );
  });

  // W-T-002: ADR-011 — after POLL_MAX_TRANSIENT_FAILURES (3) transient
  // failures the loop stops and the view falls back to `select` with
  // an inline alert. Uses `system`-kind errors so they are classified
  // as transient (vs business/forbidden which are fatal-on-first).
  it("falls back to `select` after 3 consecutive transient poll failures (ADR-011)", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });
    const transient = new AppServerError({
      kind: "system",
      code: null,
      message: "transient backend error",
    });
    getJobMock.mockRejectedValue(transient);

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });

    const file = new File(["x"], "doc.md", { type: "text/markdown" });
    act(() => {
      dispatchFile(findInputByAccept(), [file]);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });

    // Three poll attempts, each one ticking the transientFailures
    // counter. After the third failure the loop sets `error` + view
    // back to `select`.
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      await act(async () => {
        await Promise.resolve();
      });
    }

    expect(getJobMock).toHaveBeenCalledTimes(3);
    expect(document.body.textContent).toContain("ファイルをドラッグ");
    expect(document.body.querySelector('[role="alert"]')).not.toBeNull();
  });

  // Issue #258 (Perf-H1): transient poll failures under the cap keep the
  // same `waiting` session alive and resume polling at the regular interval,
  // eventually reaching `editing`. After moving the failure counter to a ref
  // (out of the `view` discriminant), a transient failure no longer rebuilds
  // the `waiting` view — but the externally observable cadence (one getJob per
  // POLL_INTERVAL) is unchanged either way, so this is a behavioral guard that
  // the loop survives transient hiccups, not a detector of the internal
  // re-mount itself. It pins: failures under the cap don't drop or duplicate a
  // poll, and the count of polls equals the number of intervals advanced.
  it("resumes polling at the regular interval through transient failures, then reaches editing", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });
    const transient = new AppServerError({
      kind: "system",
      code: null,
      message: "transient backend error",
    });
    // Two transient failures (under the cap of 3), then previewing.
    getJobMock
      .mockRejectedValueOnce(transient)
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce({ job: previewingJob });
    getTreeMock.mockResolvedValue({ flat: [] });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });

    const file = new File(["x"], "doc.md", { type: "text/markdown" });
    act(() => {
      dispatchFile(findInputByAccept(), [file]);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });

    // Each interval advance must trigger exactly one new poll — no burst.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(getJobMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(getJobMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(getJobMock).toHaveBeenCalledTimes(3);

    // Still in `select`/`waiting` budget — the loop survived the transients
    // and landed on the editing view.
    const titleInput =
      document.body.querySelector<HTMLInputElement>('input[type="text"]');
    expect(titleInput?.value).toBe("Hello");
  });

  // W-T-007: failed-view 破棄 button calls `discardIngestionPreviewFn`,
  // invalidates the router, then calls onClose.
  it("invokes discard + router.invalidate + onClose when failed-view 破棄 is clicked", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });
    getJobMock.mockResolvedValue({ job: failedJob });
    discardMock.mockResolvedValue(undefined);
    const onClose = vi.fn();

    act(() => {
      root.render(<UploadDialog open={true} onClose={onClose} />);
    });

    const file = new File(["x"], "doc.md", { type: "text/markdown" });
    act(() => {
      dispatchFile(findInputByAccept(), [file]);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Find the failed-view discard button.
    const allButtons = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    );
    const discardBtn = allButtons.find(
      (b) => (b.textContent ?? "").trim() === "破棄",
    );
    expect(discardBtn).toBeDefined();

    await act(async () => {
      discardBtn?.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(discardMock).toHaveBeenCalledTimes(1);
    expect(discardMock.mock.calls[0]?.[0]).toMatchObject({
      data: { jobId: "job-1" },
    });
    expect(invalidateMock).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Issue #254: clicking 再試行 in the failed view calls
  // `ownerRetryIngestionJobFn`, then re-enters the `waiting` view (via the
  // same `onRegenerated` handler) so the existing poll loop watches the job
  // back through `pending → processing → previewing` and lands on `editing`.
  it("re-enters the `waiting` view and resumes polling when 再試行 is clicked in the failed view", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });
    // First poll lands on failed → failed view. After retry, the next poll
    // observes previewing → editing view.
    getJobMock
      .mockResolvedValueOnce({ job: failedJob })
      .mockResolvedValue({ job: previewingJob });
    getTreeMock.mockResolvedValue({ flat: [] });
    ownerRetryMock.mockResolvedValue({ jobId: "job-1" });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });

    const file = new File(["x"], "doc.md", { type: "text/markdown" });
    act(() => {
      dispatchFile(findInputByAccept(), [file]);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const status = document.body.querySelector<HTMLElement>('[role="status"]');
    expect(status?.textContent).toBe("取り込みに失敗しました");
    const retryBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => (b.textContent ?? "").trim() === "再試行");
    expect(retryBtn).toBeDefined();
    const pollsBeforeRetry = getJobMock.mock.calls.length;

    await act(async () => {
      retryBtn?.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(ownerRetryMock).toHaveBeenCalledTimes(1);
    expect(ownerRetryMock.mock.calls[0]?.[0]).toMatchObject({
      data: { jobId: "job-1" },
    });
    // Back in the waiting view: the status region announces the re-drive.
    expect(status?.textContent).toBe("LLM がタイトルとメタデータを提案中");

    // Polling resumes from the waiting view: advancing past the interval
    // triggers a fresh getJob call, observes previewing, lands on editing.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(getJobMock.mock.calls.length).toBeGreaterThan(pollsBeforeRetry);
    expect(status?.textContent).toBe("プレビュー編集に進みました");
  });

  // Issue #254 (review W-002): when 再試行 fails (e.g. the staged upload was
  // already reclaimed → `ingestion_no_temp_storage_for_retry`), the failed
  // view shows an inline error and does NOT transition to the waiting view.
  it("keeps the failed view and surfaces an inline error when 再試行 fails", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });
    getJobMock.mockResolvedValue({ job: failedJob });
    getTreeMock.mockResolvedValue({ flat: [] });
    ownerRetryMock.mockRejectedValue(
      new AppServerError({
        kind: "business",
        code: "ingestion_no_temp_storage_for_retry",
        message: "Ingestion job has no staged upload to retry",
      }),
    );

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });

    const file = new File(["x"], "doc.md", { type: "text/markdown" });
    act(() => {
      dispatchFile(findInputByAccept(), [file]);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const status = document.body.querySelector<HTMLElement>('[role="status"]');
    expect(status?.textContent).toBe("取り込みに失敗しました");
    const retryBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => (b.textContent ?? "").trim() === "再試行");

    await act(async () => {
      retryBtn?.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(ownerRetryMock).toHaveBeenCalledTimes(1);
    // Still in the failed view (no waiting re-entry) with an inline alert
    // carrying the user-facing temp-storage message — internal details
    // are never leaked. The failed view renders two alert regions (the job's
    // own failure reason and the action error); the retry-failure message
    // must surface in one of them.
    expect(status?.textContent).toBe("取り込みに失敗しました");
    const alertText = Array.from(
      document.body.querySelectorAll('[role="alert"]'),
    )
      .map((el) => el.textContent ?? "")
      .join(" ");
    expect(alertText).toContain("再試行に必要なデータが見つかりません");
  });

  // Issue #253 ADR-003: clicking 再生成 in the editing view re-enters the
  // `waiting` view (via `onRegenerated`) so the existing poll loop watches
  // the job back through `pending → processing → previewing` and lands on a
  // fresh `editing` view. Regression guard for the modal-internal re-drive.
  it("re-enters the `waiting` view and resumes polling when 再生成 is clicked in editing", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });
    // First poll lands directly on previewing → editing view.
    getJobMock.mockResolvedValue({ job: previewingJob });
    getTreeMock.mockResolvedValue({ flat: [] });
    regenerateMock.mockResolvedValue({ jobId: "job-1" });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });

    const file = new File(["x"], "doc.md", { type: "text/markdown" });
    act(() => {
      dispatchFile(findInputByAccept(), [file]);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // We are in the editing view: the title input and the 再生成 button
    // are present.
    const status = document.body.querySelector<HTMLElement>('[role="status"]');
    expect(status?.textContent).toBe("プレビュー編集に進みました");
    const regenBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => (b.textContent ?? "").trim() === "再生成");
    expect(regenBtn).toBeDefined();
    const pollsBeforeRegen = getJobMock.mock.calls.length;

    // Click 再生成. The handler awaits regenerate + router.invalidate, then
    // calls onRegenerated(jobId) which flips the view back to `waiting`.
    await act(async () => {
      regenBtn?.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(regenerateMock).toHaveBeenCalledTimes(1);
    expect(regenerateMock.mock.calls[0]?.[0]).toMatchObject({
      data: { jobId: "job-1" },
    });
    // Back in the waiting view: the status region announces the re-drive.
    expect(status?.textContent).toBe("LLM がタイトルとメタデータを提案中");

    // Polling resumes from the waiting view: advancing past the interval
    // triggers a fresh getJob call, observes previewing, and returns to
    // the editing view.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(getJobMock.mock.calls.length).toBeGreaterThan(pollsBeforeRegen);
    expect(status?.textContent).toBe("プレビュー編集に進みました");
  });

  // Issue #319: a fatal poll error during an `existingJob`-origin waiting
  // session (entered via 再生成) must NOT dump the user back to the dropzone
  // (`select`). The job is persisted in the queue, so the dialog routes to the
  // `queueGuidance` view (queue link + the triggering error) so the editing
  // context is not lost. See .issue/319/adr.md ADR-001/002.
  it("routes a regenerate-origin waiting session to queue guidance (not select) on a fatal poll error", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });
    // First poll lands on previewing → editing. After 再生成 re-enters
    // waiting, the next poll fails fatally (forbidden).
    getJobMock.mockResolvedValueOnce({ job: previewingJob }).mockRejectedValue(
      new AppServerError({
        kind: "forbidden",
        code: "INGESTION_JOB_FORBIDDEN",
        message: "Ingestion job is not owned by actor",
      }),
    );
    getTreeMock.mockResolvedValue({ flat: [] });
    regenerateMock.mockResolvedValue({ jobId: "job-1" });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });

    const file = new File(["x"], "doc.md", { type: "text/markdown" });
    act(() => {
      dispatchFile(findInputByAccept(), [file]);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // In the editing view — click 再生成 to re-enter waiting (existingJob).
    const regenBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => (b.textContent ?? "").trim() === "再生成");
    expect(regenBtn).toBeDefined();
    await act(async () => {
      regenBtn?.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Next poll fails fatally → queueGuidance (not select).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Dropzone is NOT shown — we did not fall back to `select`.
    expect(document.body.textContent).not.toContain("ファイルをドラッグ");
    // Queue guidance is shown with a link to the queue and an inline alert.
    expect(document.body.textContent).toContain("ジョブはキューに残っています");
    expect(document.body.textContent).toContain("キュー画面を開く");
    expect(document.body.querySelector('[role="alert"]')).not.toBeNull();
    const status = document.body.querySelector<HTMLElement>('[role="status"]');
    expect(status?.textContent).toBe("ジョブはキューに残っています");
  });

  // Issue #319: the retry path (failed view 再試行 → waiting via the shared
  // `onRegenerated` handler) is also `existingJob` origin, so a fatal poll
  // error there routes to queue guidance too.
  it("routes a retry-origin waiting session to queue guidance on a fatal poll error", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });
    // First poll lands on failed → failed view. After 再試行 re-enters
    // waiting, the next poll fails fatally.
    getJobMock.mockResolvedValueOnce({ job: failedJob }).mockRejectedValue(
      new AppServerError({
        kind: "notFound",
        code: "INGESTION_JOB_NOT_FOUND",
        message: "Ingestion job not found",
      }),
    );
    getTreeMock.mockResolvedValue({ flat: [] });
    ownerRetryMock.mockResolvedValue({ jobId: "job-1" });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });

    const file = new File(["x"], "doc.md", { type: "text/markdown" });
    act(() => {
      dispatchFile(findInputByAccept(), [file]);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // In the failed view — click 再試行 to re-enter waiting (existingJob).
    const retryBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => (b.textContent ?? "").trim() === "再試行");
    expect(retryBtn).toBeDefined();
    await act(async () => {
      retryBtn?.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Next poll fails fatally → queueGuidance (not select).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(document.body.textContent).not.toContain("ファイルをドラッグ");
    expect(document.body.textContent).toContain("ジョブはキューに残っています");
    expect(document.body.textContent).toContain("キュー画面を開く");
  });

  // Issue #256 A11y-H1: the dialog's accessible name comes from
  // the visible `<h2 id={titleId}>` via `aria-labelledby`. We assert
  // the wiring rather than the surface label so the test is robust
  // against title-text tweaks.
  it("wires aria-labelledby on the panel to the visible <h2> id", () => {
    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });
    const panel = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(panel).not.toBeNull();
    const labelledBy = panel?.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    const heading = labelledBy ? document.getElementById(labelledBy) : null;
    expect(heading).not.toBeNull();
    expect(heading?.tagName).toBe("H2");
    expect(heading?.textContent).toContain("アップロード");
  });

  // Issue #256 A11y-H3: the always-mounted status region drives view
  // transitions to the SR. Existence + ARIA wiring is checked here;
  // textContent updates are exercised in dedicated tests below.
  it("renders an always-mounted role=status / aria-live=polite region", () => {
    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });
    const status = document.body.querySelector<HTMLElement>('[role="status"]');
    expect(status).not.toBeNull();
    expect(status?.getAttribute("aria-live")).toBe("polite");
    // `select` view: status region is silent (contract: no double-announce
    // when an inline role=alert region is the error path).
    expect(status?.textContent ?? "").toBe("");
  });

  it("updates the status region textContent on uploading → waiting → editing", async () => {
    // Pin the upload mock to a hand-controlled promise so the `uploading`
    // view is observable before the upload resolves and pushes the state
    // forward to `waiting`.
    let resolveUpload: (v: { jobId: string }) => void = () => {};
    uploadMock.mockReturnValue(
      new Promise<{ jobId: string }>((res) => {
        resolveUpload = res;
      }),
    );
    getJobMock
      .mockResolvedValueOnce({ job: baseJob })
      .mockResolvedValueOnce({ job: previewingJob });
    getTreeMock.mockResolvedValue({ flat: [] });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });
    const status = document.body.querySelector<HTMLElement>('[role="status"]');
    expect(status).not.toBeNull();

    const file = new File(["x"], "doc.md", { type: "text/markdown" });
    act(() => {
      dispatchFile(findInputByAccept(), [file]);
    });
    // uploading — `setView({kind: "uploading"})` runs synchronously
    // inside submitFiles before the upload await.
    expect(status?.textContent).toBe("アップロード中");

    // Resolve the upload to advance to `waiting`.
    await act(async () => {
      resolveUpload({ jobId: "job-1" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(status?.textContent).toBe("LLM がタイトルとメタデータを提案中");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });
    // editing
    expect(status?.textContent).toBe("プレビュー編集に進みました");
  });

  it("updates the status region textContent for multi-file uploads", async () => {
    // Hand-controlled upload promises so we can observe both intermediate
    // and terminal status announcements.
    const resolvers: Array<(v: { jobId: string }) => void> = [];
    uploadMock.mockImplementation(
      () =>
        new Promise<{ jobId: string }>((res) => {
          resolvers.push(res);
        }),
    );
    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });
    const status = document.body.querySelector<HTMLElement>('[role="status"]');
    const files = [
      new File(["a"], "a.md", { type: "text/markdown" }),
      new File(["b"], "b.md", { type: "text/markdown" }),
    ];
    act(() => {
      dispatchFile(findInputByAccept(), files);
    });
    // uploading view active before any upload resolves; the count progress
    // starts at 0 / total. The determinate ProgressBar fill is at 0%.
    expect(status?.textContent).toBe("2 件中 0 件をアップロード");
    expect(uploadProgressPercent()).toBe(0);

    // Drain both uploads.
    const MAX_FLUSH = 50;
    await act(async () => {
      // The submitFiles loop awaits the first upload before kicking off
      // the second, so we resolve them in order. A bounded microtask
      // flush avoids the infinite-loop risk if a future refactor of
      // `submitFiles` ever inserts an extra microtask / setTimeout in
      // front of the first `upload()` call.
      for (let i = 0; i < MAX_FLUSH && resolvers.length === 0; i++) {
        await Promise.resolve();
      }
      if (resolvers.length === 0) {
        throw new Error("first upload was not invoked within the flush budget");
      }
      resolvers[0]?.({ jobId: "job-a" });
      await Promise.resolve();
      await Promise.resolve();
    });
    // Intermediate: the first of two files is done. The live region and the
    // determinate ProgressBar must both reflect 1 / 2 (= 50%) before the
    // second upload resolves — this is the core "progress actually advances"
    // assertion that the original two-point test (0 → final) skipped.
    expect(status?.textContent).toBe("2 件中 1 件をアップロード");
    expect(uploadProgressPercent()).toBe(50);

    // Resolve the second upload → terminal multi-result.
    await act(async () => {
      for (let i = 0; i < MAX_FLUSH && resolvers.length < 2; i++) {
        await Promise.resolve();
      }
      if (resolvers.length < 2) {
        throw new Error(
          "second upload was not invoked within the flush budget",
        );
      }
      resolvers[1]?.({ jobId: "job-b" });
      await Promise.resolve();
      await Promise.resolve();
    });
    // multiResult
    expect(status?.textContent).toBe("2 件中 2 件をキューに追加しました");
  });

  it("includes the failed-count suffix in the status region on partial failure", async () => {
    uploadMock
      .mockResolvedValueOnce({ jobId: "job-1" })
      .mockRejectedValueOnce(new Error("boom"));
    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });
    const status = document.body.querySelector<HTMLElement>('[role="status"]');
    const files = [
      new File(["a"], "a.md", { type: "text/markdown" }),
      new File(["b"], "b.md", { type: "text/markdown" }),
    ];
    act(() => {
      dispatchFile(findInputByAccept(), files);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(status?.textContent).toBe(
      "2 件中 1 件をキューに追加しました（1 件失敗）",
    );
  });

  it("updates the status region textContent when polling observes failed", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });
    getJobMock.mockResolvedValue({ job: failedJob });
    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });
    const status = document.body.querySelector<HTMLElement>('[role="status"]');
    const file = new File(["x"], "doc.md", { type: "text/markdown" });
    act(() => {
      dispatchFile(findInputByAccept(), [file]);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(status?.textContent).toBe("取り込みに失敗しました");
  });

  it("updates the status region textContent on timeout", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });
    getJobMock.mockResolvedValue({ job: baseJob });
    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });
    const status = document.body.querySelector<HTMLElement>('[role="status"]');
    const startedAt = new Date(2026, 0, 1, 0, 0, 0).getTime();
    vi.setSystemTime(startedAt);
    const file = new File(["x"], "doc.md", { type: "text/markdown" });
    act(() => {
      dispatchFile(findInputByAccept(), [file]);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });
    vi.setSystemTime(startedAt + 181_000);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(status?.textContent).toBe("推論の完了を待ちきれませんでした");
  });

  // C': re-open contract — when the dialog is re-opened the status
  // region returns to silence so a fresh `select` view does not
  // re-announce the previous run's terminal message.
  it("resets the status region to empty on re-open (select view is silent)", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });
    getJobMock.mockResolvedValue({ job: failedJob });
    let openProp = true;
    const Renderer = ({ open }: { open: boolean }) => (
      <UploadDialog open={open} onClose={() => {}} />
    );
    act(() => {
      root.render(<Renderer open={openProp} />);
    });
    const file = new File(["x"], "doc.md", { type: "text/markdown" });
    act(() => {
      dispatchFile(findInputByAccept(), [file]);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const status = document.body.querySelector<HTMLElement>('[role="status"]');
    expect(status?.textContent).toBe("取り込みに失敗しました");

    // Close → re-open
    openProp = false;
    act(() => {
      root.render(<Renderer open={openProp} />);
    });
    openProp = true;
    act(() => {
      root.render(<Renderer open={openProp} />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const status2 = document.body.querySelector<HTMLElement>('[role="status"]');
    expect(status2?.textContent ?? "").toBe("");
  });

  // D: editing view focuses the title input. The focus is committed
  // via a `useEffect(view.kind)` so it fires synchronously after the
  // state commit — no rAF involved on the focus path itself.
  //
  // This relies on React's effect ordering guarantee that child commits
  // (IngestionPreviewForm mounting its `<input ref>`) complete before the
  // parent's `useEffect([view.kind])` fires. If IngestionPreviewForm is
  // ever moved behind a Suspense boundary or lazy-loaded, this contract
  // may silently break.
  it("moves focus to the title input when entering the editing view", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });
    getJobMock
      .mockResolvedValueOnce({ job: baseJob })
      .mockResolvedValueOnce({ job: previewingJob });
    getTreeMock.mockResolvedValue({ flat: [] });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });
    const file = new File(["x"], "doc.md", { type: "text/markdown" });
    act(() => {
      dispatchFile(findInputByAccept(), [file]);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const titleInput =
      document.body.querySelector<HTMLInputElement>('input[type="text"]');
    expect(titleInput).not.toBeNull();
    expect(document.activeElement).toBe(titleInput);
  });

  // E: a re-render that does NOT change `view.kind` must not re-fire
  // the focus effect. We move focus elsewhere after editing landed,
  // then trigger a benign re-render and assert focus stayed put.
  it("does not re-steal focus on re-renders while still in editing view", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });
    getJobMock
      .mockResolvedValueOnce({ job: baseJob })
      .mockResolvedValueOnce({ job: previewingJob });
    getTreeMock.mockResolvedValue({ flat: [] });

    const Renderer = ({ tick: _tick }: { tick: number }) => (
      <UploadDialog open={true} onClose={() => {}} />
    );
    act(() => {
      root.render(<Renderer tick={0} />);
    });
    const file = new File(["x"], "doc.md", { type: "text/markdown" });
    act(() => {
      dispatchFile(findInputByAccept(), [file]);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const titleInput =
      document.body.querySelector<HTMLInputElement>('input[type="text"]');
    expect(titleInput).not.toBeNull();
    // Move focus elsewhere (e.g. the cancel button).
    const cancelBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => (b.textContent ?? "").trim() === "キャンセル");
    expect(cancelBtn).toBeDefined();
    cancelBtn?.focus();
    expect(document.activeElement).toBe(cancelBtn);
    // Force a re-render via parent prop change; `view.kind` stays
    // `editing` so the focus effect must not fire.
    act(() => {
      root.render(<Renderer tick={1} />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(cancelBtn);
  });

  // #228: the `select` view's advanced-options textareas are wired into the
  // submitted FormData as `structurePrompt` / `metadataPrompt`. The
  // `<details>` is uncontrolled so the textareas are in the DOM regardless of
  // open state; we set their values directly and read back the FormData the
  // upload mock received.
  function setPromptTextareas(structure: string, metadata: string) {
    const textareas = Array.from(
      document.body.querySelectorAll<HTMLTextAreaElement>("textarea"),
    );
    expect(textareas.length).toBeGreaterThanOrEqual(2);
    const [structureTa, metadataTa] = textareas;
    if (structureTa === undefined || metadataTa === undefined) {
      throw new Error("prompt textareas not rendered");
    }
    setReactValue(structureTa, structure);
    setReactValue(metadataTa, metadata);
  }

  // React controls the textarea value via its own setter, so a plain
  // `.value =` assignment is clobbered on the next render. Use the native
  // value setter then dispatch `input` so React's onChange sees the update.
  function setReactValue(el: HTMLTextAreaElement, value: string) {
    const proto = Object.getPrototypeOf(el) as object;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    desc?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  it("wires the custom prompts into the upload FormData (single file)", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });
    getJobMock.mockResolvedValue({ job: baseJob });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });

    act(() => {
      setPromptTextareas("  my structure prompt  ", "  my metadata prompt  ");
    });

    const file = new File(["x"], "doc.md", { type: "text/markdown" });
    act(() => {
      dispatchFile(findInputByAccept(), [file]);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });

    expect(uploadMock).toHaveBeenCalledTimes(1);
    const formData = uploadMock.mock.calls[0]?.[0]?.data as FormData;
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get("structurePrompt")).toBe("my structure prompt");
    expect(formData.get("metadataPrompt")).toBe("my metadata prompt");
  });

  it("applies the same custom prompts to every file (multi-file)", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });

    act(() => {
      setPromptTextareas("shared structure", "shared metadata");
    });

    const files = [
      new File(["a"], "a.md", { type: "text/markdown" }),
      new File(["b"], "b.md", { type: "text/markdown" }),
    ];
    act(() => {
      dispatchFile(findInputByAccept(), files);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(uploadMock).toHaveBeenCalledTimes(2);
    for (const call of uploadMock.mock.calls) {
      const formData = call[0]?.data as FormData;
      expect(formData.get("structurePrompt")).toBe("shared structure");
      expect(formData.get("metadataPrompt")).toBe("shared metadata");
    }
  });

  it("omits the override fields from FormData when both prompts are empty", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });
    getJobMock.mockResolvedValue({ job: baseJob });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });

    const file = new File(["x"], "doc.md", { type: "text/markdown" });
    act(() => {
      dispatchFile(findInputByAccept(), [file]);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });

    expect(uploadMock).toHaveBeenCalledTimes(1);
    const formData = uploadMock.mock.calls[0]?.[0]?.data as FormData;
    expect(formData.has("structurePrompt")).toBe(false);
    expect(formData.has("metadataPrompt")).toBe(false);
  });

  // W-T-008: multi-file partial failure surfaces a per-file failed
  // name list. uploadMock resolves once then rejects once.
  it("reports failed file names in the multi-result view on partial failure", async () => {
    uploadMock
      .mockResolvedValueOnce({ jobId: "job-1" })
      .mockRejectedValueOnce(new Error("boom"));

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });

    const files = [
      new File(["a"], "a.md", { type: "text/markdown" }),
      new File(["b"], "b.md", { type: "text/markdown" }),
    ];
    act(() => {
      dispatchFile(findInputByAccept(), files);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain("2 件中 1 件をキューに追加");
    expect(document.body.textContent).toContain("1 件失敗");
    expect(document.body.textContent).toContain("b.md");
  });

  // #358: opening the advanced-options accordion lazily fetches the
  // resolved default prompts. The `<details>` `onToggle` fires the fetch
  // exactly once; the resolved text is surfaced as a placeholder and a
  // collapsible full body, plus a "既定の出所" badge per purpose.
  //
  // The advanced-options accordion is the FIRST `<details>` in the select
  // view; toggling its `open` property dispatches a `toggle` event that
  // happy-dom routes to React's `onToggle`.
  function openAdvancedOptions() {
    const details = document.body.querySelector<HTMLDetailsElement>("details");
    if (details === null) throw new Error("advanced-options details missing");
    details.open = true;
    details.dispatchEvent(new Event("toggle", { bubbles: false }));
  }

  it("lazily fetches and shows the resolved default prompts when the accordion opens", async () => {
    getEffectivePromptsMock.mockResolvedValue({
      structure: { text: "STRUCTURE DEFAULT TEXT", isUserOverride: false },
      metadata: { text: "METADATA DEFAULT TEXT", isUserOverride: true },
    });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });

    // No fetch until the accordion is opened.
    expect(getEffectivePromptsMock).not.toHaveBeenCalled();

    await act(async () => {
      openAdvancedOptions();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getEffectivePromptsMock).toHaveBeenCalledTimes(1);
    // Resolved default text appears (in the placeholder + full body).
    const textareas = Array.from(
      document.body.querySelectorAll<HTMLTextAreaElement>("textarea"),
    );
    expect(textareas[0]?.placeholder).toContain("STRUCTURE DEFAULT TEXT");
    expect(document.body.textContent).toContain("STRUCTURE DEFAULT TEXT");
    expect(document.body.textContent).toContain("METADATA DEFAULT TEXT");
    // Source-layer badges: structure = instance default, metadata = user.
    expect(document.body.textContent).toContain("インスタンス既定");
    expect(document.body.textContent).toContain("ユーザー設定で上書き中");

    // Re-toggling does not re-fetch (fetched-once guard).
    await act(async () => {
      const details =
        document.body.querySelector<HTMLDetailsElement>("details");
      if (details !== null) {
        details.open = false;
        details.dispatchEvent(new Event("toggle", { bubbles: false }));
        details.open = true;
        details.dispatchEvent(new Event("toggle", { bubbles: false }));
      }
      await Promise.resolve();
    });
    expect(getEffectivePromptsMock).toHaveBeenCalledTimes(1);
  });

  it("toggles the override state badge based on textarea content", async () => {
    getEffectivePromptsMock.mockResolvedValue({
      structure: { text: "STRUCTURE DEFAULT TEXT", isUserOverride: false },
      metadata: { text: "METADATA DEFAULT TEXT", isUserOverride: false },
    });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });
    await act(async () => {
      openAdvancedOptions();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Both fields start blank → "既定を使用中".
    const usingDefault = Array.from(
      document.body.querySelectorAll("span"),
    ).filter((s) => (s.textContent ?? "").includes("既定を使用中"));
    expect(usingDefault.length).toBe(2);

    // Type into the structure textarea → that field flips to override.
    const structureTa =
      document.body.querySelectorAll<HTMLTextAreaElement>("textarea")[0];
    if (structureTa === undefined)
      throw new Error("structure textarea missing");
    act(() => {
      const proto = Object.getPrototypeOf(structureTa) as object;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(
        structureTa,
        "my override",
      );
      structureTa.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Assert per-field: only the structure badge flips, metadata stays put.
    // The two badges are the spans carrying the state copy, in DOM order
    // structure-then-metadata.
    const badges = Array.from(
      document.body.querySelectorAll<HTMLSpanElement>("span"),
    ).filter((s) => {
      const t = s.textContent ?? "";
      return t === "この回だけ上書き" || t === "既定を使用中";
    });
    expect(badges.length).toBe(2);
    expect(badges[0]?.textContent).toBe("この回だけ上書き");
    expect(badges[0]?.getAttribute("data-overriding")).toBe("true");
    expect(badges[1]?.textContent).toBe("既定を使用中");
    expect(badges[1]?.getAttribute("data-overriding")).toBeNull();
  });

  it("shows the system-default copy when the resolved default is empty", async () => {
    getEffectivePromptsMock.mockResolvedValue({
      structure: { text: "", isUserOverride: false },
      metadata: { text: "", isUserOverride: false },
    });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });
    await act(async () => {
      openAdvancedOptions();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Empty default → the system-default copy is shown (placeholder + full body).
    expect(document.body.textContent).toContain("システム既定の動作を使用");
    // ...and the source layer is named "システム既定" (the most common
    // standard state: no instance default + no user override).
    expect(document.body.textContent).toContain("システム既定");
    const structureTa =
      document.body.querySelectorAll<HTMLTextAreaElement>("textarea")[0];
    expect(structureTa?.placeholder).toBe("システム既定の動作を使用");
  });

  it("keeps the upload flow usable when the default-prompt fetch fails", async () => {
    getEffectivePromptsMock.mockRejectedValue(new Error("boom"));
    uploadMock.mockResolvedValue({ jobId: "job-1" });
    getJobMock.mockResolvedValue({ job: baseJob });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });
    await act(async () => {
      openAdvancedOptions();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getEffectivePromptsMock).toHaveBeenCalledTimes(1);
    // No default hint rendered, but the upload still proceeds.
    expect(document.body.textContent).not.toContain("既定の出所");

    const file = new File(["x"], "doc.md", { type: "text/markdown" });
    act(() => {
      dispatchFile(findInputByAccept(), [file]);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });

    expect(uploadMock).toHaveBeenCalledTimes(1);
  });
});
