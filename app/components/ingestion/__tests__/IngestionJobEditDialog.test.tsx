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

const commitMock = vi.fn();
const discardMock = vi.fn();
const regenerateMock = vi.fn();
const getTreeMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter(
    [
      [commitMock, commitMock],
      [discardMock, discardMock],
      [regenerateMock, regenerateMock],
      [getTreeMock, getTreeMock],
    ],
    vi.fn(),
  ),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

vi.mock("../actions", () => ({
  commitIngestionPreviewFn: commitMock,
  discardIngestionPreviewFn: discardMock,
  regenerateIngestionPreviewFn: regenerateMock,
}));

vi.mock("../../note/actions", () => ({
  getDirectoryTreeFn: getTreeMock,
}));

const notifyMock = vi.fn();
vi.mock("../queueBadgeBus", () => ({
  notifyIngestionQueueChanged: notifyMock,
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

const { IngestionJobEditDialog } = await import("../IngestionJobEditDialog");

const previewingJob: IngestionJobWire = {
  id: "job-1",
  ownerId: "owner-1",
  originalFileName: "doc.md",
  mimeType: "text/markdown",
  byteSize: 32,
  kind: "markdown",
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
  errorCode: null,
  regenerationCount: 0,
  savedAsNoteId: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  commitMock.mockReset();
  discardMock.mockReset();
  regenerateMock.mockReset();
  getTreeMock.mockReset();
  getTreeMock.mockResolvedValue({ flat: [] });
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

async function flush() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function renderDialog(open = true, onClose: () => void = () => {}) {
  act(() => {
    root.render(
      <IngestionJobEditDialog
        job={previewingJob}
        open={open}
        onClose={onClose}
      />,
    );
  });
}

function findButton(label: string): HTMLButtonElement | undefined {
  return Array.from(
    document.body.querySelectorAll<HTMLButtonElement>("button"),
  ).find((b) => (b.textContent ?? "").trim() === label);
}

async function waitForAnimationFrame() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  });
}

describe("IngestionJobEditDialog", () => {
  it("lazy-loads the directory tree when opened and names the dialog after the file", async () => {
    renderDialog();
    await flush();

    expect(getTreeMock).toHaveBeenCalledTimes(1);
    const panel = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(panel).not.toBeNull();
    const labelledBy = panel?.getAttribute("aria-labelledby");
    const heading = labelledBy ? document.getElementById(labelledBy) : null;
    expect(heading?.textContent).toContain("doc.md");
  });

  it("does not fetch the tree while closed", async () => {
    renderDialog(false);
    await flush();
    expect(getTreeMock).not.toHaveBeenCalled();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it("moves initial focus to the title input", async () => {
    renderDialog();
    await flush();
    await waitForAnimationFrame();

    const titleInput =
      document.body.querySelector<HTMLInputElement>('input[type="text"]');
    expect(titleInput?.value).toBe("Hello");
    expect(document.activeElement).toBe(titleInput);
  });

  it("commits the edited preview, notifies the badge bus, and navigates to the note", async () => {
    commitMock.mockResolvedValue({ noteId: "note-99" });
    renderDialog();
    await flush();

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
    });
    await flush();

    expect(commitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobId: "job-1",
          title: "Edited Title",
        }),
      }),
    );
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/notes/$noteId",
      params: { noteId: "note-99" },
    });
  });

  it("discards via the confirm dialog, notifies, and closes", async () => {
    discardMock.mockResolvedValue({ ok: true });
    const onClose = vi.fn();
    renderDialog(true, onClose);
    await flush();

    const discardBtn = findButton("破棄");
    expect(discardBtn).toBeDefined();
    await act(async () => {
      discardBtn?.click();
    });
    const confirmBtn = document.body
      .querySelector<HTMLElement>('[role="alertdialog"]')
      ?.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(confirmBtn).not.toBeNull();
    await act(async () => {
      confirmBtn?.click();
    });
    await flush();

    expect(discardMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { jobId: "job-1" } }),
    );
    // The form itself invalidates the /upload loader before the callback.
    expect(invalidateMock).toHaveBeenCalled();
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("regenerates, notifies, and closes without any in-dialog waiting state", async () => {
    regenerateMock.mockResolvedValue({ jobId: "job-1" });
    const onClose = vi.fn();
    renderDialog(true, onClose);
    await flush();

    const regenBtn = findButton("再生成");
    expect(regenBtn).toBeDefined();
    await act(async () => {
      regenBtn?.click();
    });
    await flush();

    expect(regenerateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { jobId: "job-1" } }),
    );
    expect(invalidateMock).toHaveBeenCalled();
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    // Fire-and-forget: no skeleton / waiting copy appears.
    expect(document.body.textContent ?? "").not.toContain(
      "LLM がタイトルとメタデータを提案中",
    );
  });

  it("surfaces a commit conflict inline and keeps the dialog open", async () => {
    commitMock.mockRejectedValue(
      new AppServerError({
        kind: "notFound",
        code: "INGESTION_JOB_NOT_FOUND",
        message: "Ingestion job not found",
      }),
    );
    const onClose = vi.fn();
    renderDialog(true, onClose);
    await flush();

    const form = document.body.querySelector("form");
    if (form === null) throw new Error("preview form not rendered");
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await flush();

    expect(onClose).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("closes via キャンセル", async () => {
    const onClose = vi.fn();
    renderDialog(true, onClose);
    await flush();

    const cancelBtn = findButton("キャンセル");
    expect(cancelBtn).toBeDefined();
    await act(async () => {
      cancelBtn?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the editor usable when the tree load fails", async () => {
    getTreeMock.mockRejectedValue(new Error("boom"));
    renderDialog();
    await flush();

    // The form is still rendered; the picker is simply empty.
    expect(document.body.querySelector("form")).not.toBeNull();
    expect(
      document.body.querySelector<HTMLInputElement>('input[type="text"]')
        ?.value,
    ).toBe("Hello");
  });
});
