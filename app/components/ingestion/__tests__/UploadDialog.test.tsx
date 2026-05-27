// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("@tanstack/react-start", () => {
  const chain = () =>
    new Proxy(() => chain(), {
      get: (_, prop) => (prop === "then" ? undefined : chain()),
    });
  return {
    useServerFn: (fn: unknown) => {
      // Identity dispatch via the imported references below. The module
      // mock for `./actions` returns those same references, so the
      // strict-equality compare here is stable.
      if (fn === uploadMock) return uploadMock;
      if (fn === getJobMock) return getJobMock;
      if (fn === discardMock) return discardMock;
      if (fn === getTreeMock) return getTreeMock;
      return vi.fn();
    },
    createMiddleware: () => chain(),
    createServerFn: () => chain(),
  };
});

vi.mock("../actions", () => ({
  uploadFileFn: uploadMock,
  getIngestionJobFn: getJobMock,
  discardIngestionPreviewFn: discardMock,
  commitIngestionPreviewFn: vi.fn(),
  regenerateIngestionPreviewFn: vi.fn(),
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
  errorReason: null,
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
  errorReason: "LLM timed out",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  uploadMock.mockReset();
  getJobMock.mockReset();
  discardMock.mockReset();
  getTreeMock.mockReset();
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

    // The failed view shows the error code/reason and the two actions.
    expect(document.body.textContent).toContain("取り込みに失敗しました");
    expect(document.body.textContent).toContain("INGESTION_TIMEOUT");
    expect(document.body.textContent).toContain("破棄");
    expect(document.body.textContent).toContain("キュー画面で詳細を見る");
    // No "再試行" button on the modal failed view.
    expect(document.body.textContent ?? "").not.toMatch(/再試行/);
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
});
