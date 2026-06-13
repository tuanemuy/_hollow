// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";
import { AppServerError } from "@/core/presentation/errorResponse";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Per-server-fn mocks. The fire-and-forget dialog uses only 2 server fns
// (`uploadFileFn`, `getEffectiveIngestionPromptsFn`) — the former
// polling / editing fns are intentionally absent (Issue #538).
const uploadMock = vi.fn();
const getEffectivePromptsMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter(
    [
      [uploadMock, uploadMock],
      [getEffectivePromptsMock, getEffectivePromptsMock],
    ],
    vi.fn(),
  ),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

vi.mock("../actions", () => ({
  uploadFileFn: uploadMock,
  getEffectiveIngestionPromptsFn: getEffectivePromptsMock,
}));

const notifyMock = vi.fn();
vi.mock("../queueBadgeBus", () => ({
  notifyIngestionQueueChanged: notifyMock,
  subscribeIngestionQueueChanged: () => () => {},
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

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  uploadMock.mockReset();
  getEffectivePromptsMock.mockReset();
  notifyMock.mockClear();
  navigateMock.mockClear();
  invalidateMock.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function findFileInput(): HTMLInputElement {
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

async function flush() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function findButton(label: string): HTMLButtonElement | undefined {
  return Array.from(
    document.body.querySelectorAll<HTMLButtonElement>("button"),
  ).find((b) => (b.textContent ?? "").trim() === label);
}

describe("UploadDialog fire-and-forget state machine", () => {
  it("starts in the `select` view when opened", () => {
    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });
    const dropzone = document.body.querySelector("label[for]");
    expect(dropzone?.textContent).toContain("ファイルをドラッグ");
  });

  it("lands on the `queued` view after a single-file upload, invalidating and notifying", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });

    const file = new File(["x"], "doc.md", { type: "text/markdown" });
    act(() => {
      dispatchFile(findFileInput(), [file]);
    });
    await flush();

    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain(
      "1 件中 1 件をキューに追加しました",
    );
    // The /upload loader behind the modal is refreshed and the header badge
    // is notified — for single uploads too (Issue #538).
    expect(invalidateMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledTimes(1);
    // Queue guidance: a link to /upload plus the editing hint.
    const queueLink = Array.from(document.body.querySelectorAll("a")).find(
      (a) => a.textContent?.includes("キュー画面を開く"),
    );
    expect(queueLink?.getAttribute("to")).toBe("/upload");
    expect(document.body.textContent).toContain("キュー画面から行えます");
    const status = document.body.querySelector<HTMLElement>('[role="status"]');
    expect(status?.textContent).toBe("1 件中 1 件をキューに追加しました");
  });

  it("offers 続けてアップロード and 閉じる with no blocking pending UI in the queued view", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });
    const onClose = vi.fn();

    act(() => {
      root.render(<UploadDialog open={true} onClose={onClose} />);
    });
    act(() => {
      dispatchFile(findFileInput(), [
        new File(["x"], "doc.md", { type: "text/markdown" }),
      ]);
    });
    await flush();

    // No disabled controls / spinners hold the user in the queued view.
    const disabled = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button[disabled]"),
    );
    expect(disabled).toHaveLength(0);

    const closeBtn = findButton("閉じる");
    expect(closeBtn).toBeDefined();
    await act(async () => {
      closeBtn?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("returns to a clean `select` view on 続けてアップロード and uploads again", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });
    act(() => {
      dispatchFile(findFileInput(), [
        new File(["x"], "doc.md", { type: "text/markdown" }),
      ]);
    });
    await flush();
    expect(document.body.textContent).toContain("キューに追加しました");

    const moreBtn = findButton("続けてアップロード");
    expect(moreBtn).toBeDefined();
    await act(async () => {
      moreBtn?.click();
    });

    // Back on the dropzone with a silent status region.
    expect(document.body.textContent).toContain("ファイルをドラッグ");
    const status = document.body.querySelector<HTMLElement>('[role="status"]');
    expect(status?.textContent ?? "").toBe("");

    // A second submission goes straight through.
    act(() => {
      dispatchFile(findFileInput(), [
        new File(["y"], "more.md", { type: "text/markdown" }),
      ]);
    });
    await flush();
    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain(
      "1 件中 1 件をキューに追加しました",
    );
  });

  it("renders the aggregate queued view with failed names on multi-file partial failure", async () => {
    uploadMock
      .mockResolvedValueOnce({ jobId: "job-1" })
      .mockRejectedValueOnce(new Error("boom"));

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });
    act(() => {
      dispatchFile(findFileInput(), [
        new File(["a"], "a.md", { type: "text/markdown" }),
        new File(["b"], "b.md", { type: "text/markdown" }),
      ]);
    });
    await flush();

    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain("2 件中 1 件をキューに追加");
    expect(document.body.textContent).toContain("1 件失敗");
    expect(document.body.textContent).toContain("b.md");
    expect(invalidateMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledTimes(1);
    const status = document.body.querySelector<HTMLElement>('[role="status"]');
    expect(status?.textContent).toBe(
      "2 件中 1 件をキューに追加しました（1 件失敗）",
    );
  });

  it("falls back to `select` with an inline alert when a single upload fails", async () => {
    uploadMock.mockRejectedValue(
      new AppServerError({
        kind: "business",
        code: "unsupported_format",
        message: "unsupported_format",
      }),
    );

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });
    act(() => {
      dispatchFile(findFileInput(), [
        new File(["x"], "doc.md", { type: "text/markdown" }),
      ]);
    });
    await flush();

    expect(document.body.textContent).toContain("ファイルをドラッグ");
    expect(document.body.querySelector('[role="alert"]')).not.toBeNull();
    expect(notifyMock).not.toHaveBeenCalled();
    expect(invalidateMock).not.toHaveBeenCalled();
  });

  it("announces the uploading progress then the queued result via the status region", async () => {
    // Pin the upload mock to a hand-controlled promise so the `uploading`
    // view is observable before the upload resolves.
    let resolveUpload: (v: { jobId: string }) => void = () => {};
    uploadMock.mockReturnValue(
      new Promise<{ jobId: string }>((res) => {
        resolveUpload = res;
      }),
    );

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });
    const status = document.body.querySelector<HTMLElement>('[role="status"]');
    act(() => {
      dispatchFile(findFileInput(), [
        new File(["x"], "doc.md", { type: "text/markdown" }),
      ]);
    });
    expect(status?.textContent).toBe("アップロード中");

    await act(async () => {
      resolveUpload({ jobId: "job-1" });
    });
    await flush();
    expect(status?.textContent).toBe("1 件中 1 件をキューに追加しました");
  });

  // Issue #256 A11y-H1: the dialog's accessible name comes from the visible
  // `<h2 id={titleId}>` via `aria-labelledby`.
  it("wires aria-labelledby on the panel to the visible <h2> id", () => {
    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });
    const panel = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(panel).not.toBeNull();
    const labelledBy = panel?.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    const heading = labelledBy ? document.getElementById(labelledBy) : null;
    expect(heading?.tagName).toBe("H2");
    expect(heading?.textContent).toContain("アップロード");
  });

  // C': re-open contract — when the dialog is re-opened the status region
  // returns to silence so a fresh `select` view does not re-announce the
  // previous run's terminal message.
  it("resets the status region to empty on re-open (select view is silent)", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });
    const Renderer = ({ open }: { open: boolean }) => (
      <UploadDialog open={open} onClose={() => {}} />
    );
    act(() => {
      root.render(<Renderer open={true} />);
    });
    act(() => {
      dispatchFile(findFileInput(), [
        new File(["x"], "doc.md", { type: "text/markdown" }),
      ]);
    });
    await flush();
    const status = document.body.querySelector<HTMLElement>('[role="status"]');
    expect(status?.textContent).toBe("1 件中 1 件をキューに追加しました");

    act(() => {
      root.render(<Renderer open={false} />);
    });
    act(() => {
      root.render(<Renderer open={true} />);
    });
    await flush();
    const status2 = document.body.querySelector<HTMLElement>('[role="status"]');
    expect(status2?.textContent ?? "").toBe("");
  });

  // #228: the `select` view's advanced-options textareas are wired into the
  // submitted FormData as `structurePrompt` / `metadataPrompt`.
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

  it("wires the custom prompts into the upload FormData and preserves them across 続けてアップロード", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });
    act(() => {
      setPromptTextareas("  my structure prompt  ", "  my metadata prompt  ");
    });
    act(() => {
      dispatchFile(findFileInput(), [
        new File(["x"], "doc.md", { type: "text/markdown" }),
      ]);
    });
    await flush();

    expect(uploadMock).toHaveBeenCalledTimes(1);
    const formData = uploadMock.mock.calls[0]?.[0]?.data as FormData;
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get("structurePrompt")).toBe("my structure prompt");
    expect(formData.get("metadataPrompt")).toBe("my metadata prompt");

    // 続けてアップロード keeps the prompt inputs for the next submission.
    const moreBtn = findButton("続けてアップロード");
    await act(async () => {
      moreBtn?.click();
    });
    act(() => {
      dispatchFile(findFileInput(), [
        new File(["y"], "more.md", { type: "text/markdown" }),
      ]);
    });
    await flush();
    const formData2 = uploadMock.mock.calls[1]?.[0]?.data as FormData;
    expect(formData2.get("structurePrompt")).toBe("my structure prompt");
  });

  it("applies the same custom prompts to every file (multi-file)", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });
    act(() => {
      setPromptTextareas("shared structure", "shared metadata");
    });
    act(() => {
      dispatchFile(findFileInput(), [
        new File(["a"], "a.md", { type: "text/markdown" }),
        new File(["b"], "b.md", { type: "text/markdown" }),
      ]);
    });
    await flush();

    expect(uploadMock).toHaveBeenCalledTimes(2);
    for (const call of uploadMock.mock.calls) {
      const formData = call[0]?.data as FormData;
      expect(formData.get("structurePrompt")).toBe("shared structure");
      expect(formData.get("metadataPrompt")).toBe("shared metadata");
    }
  });

  it("omits the override fields from FormData when both prompts are empty", async () => {
    uploadMock.mockResolvedValue({ jobId: "job-1" });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });
    act(() => {
      dispatchFile(findFileInput(), [
        new File(["x"], "doc.md", { type: "text/markdown" }),
      ]);
    });
    await flush();

    const formData = uploadMock.mock.calls[0]?.[0]?.data as FormData;
    expect(formData.has("structurePrompt")).toBe(false);
    expect(formData.has("metadataPrompt")).toBe(false);
  });

  // #358: opening the advanced-options accordion lazily fetches the
  // resolved default prompts exactly once.
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
    expect(getEffectivePromptsMock).not.toHaveBeenCalled();

    await act(async () => {
      openAdvancedOptions();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getEffectivePromptsMock).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("STRUCTURE DEFAULT TEXT");
    expect(document.body.textContent).toContain("METADATA DEFAULT TEXT");
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

  it("keeps the upload flow usable when the default-prompt fetch fails", async () => {
    getEffectivePromptsMock.mockRejectedValue(new Error("boom"));
    uploadMock.mockResolvedValue({ jobId: "job-1" });

    act(() => {
      root.render(<UploadDialog open={true} onClose={() => {}} />);
    });
    await act(async () => {
      openAdvancedOptions();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getEffectivePromptsMock).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain("既定の出所");

    act(() => {
      dispatchFile(findFileInput(), [
        new File(["x"], "doc.md", { type: "text/markdown" }),
      ]);
    });
    await flush();
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });
});
