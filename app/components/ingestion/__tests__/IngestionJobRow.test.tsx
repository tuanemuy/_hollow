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
const ownerRetryMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter(
    [
      [commitMock, commitMock],
      [discardMock, discardMock],
      [regenerateMock, regenerateMock],
      [ownerRetryMock, ownerRetryMock],
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
  ownerRetryIngestionJobFn: ownerRetryMock,
}));

const routerInvalidate = vi.fn().mockResolvedValue(undefined);
const routerNavigate = vi.fn().mockResolvedValue(undefined);
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    invalidate: routerInvalidate,
    navigate: routerNavigate,
  }),
  Link: ({
    children,
    ...rest
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <a {...(rest as Record<string, unknown>)}>{children}</a>,
}));

const previewingJobExistingDir: IngestionJobWire = {
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

const previewingJobNewDir: IngestionJobWire = {
  ...previewingJobExistingDir,
  preview: {
    ...previewingJobExistingDir.preview!,
    suggestedDirectoryId: null,
    suggestedDirectoryName: "ideas",
  },
};

const failedJob: IngestionJobWire = {
  ...previewingJobExistingDir,
  status: "failed",
  preview: null,
  errorCode: "ingestion_invalid_state_for_retry",
};

const discardedJob: IngestionJobWire = {
  ...previewingJobExistingDir,
  status: "discarded",
  preview: null,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  commitMock.mockReset();
  discardMock.mockReset();
  regenerateMock.mockReset();
  ownerRetryMock.mockReset();
  routerInvalidate.mockClear();
  routerNavigate.mockClear();
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

function getSaveButton(): HTMLButtonElement {
  const buttons = document.body.querySelectorAll<HTMLButtonElement>("button");
  for (const b of buttons) {
    if ((b.textContent ?? "").includes("ノートとして保存")) return b;
  }
  throw new Error("'ノートとして保存' button not found");
}

async function renderRow(job: IngestionJobWire) {
  const { IngestionJobRow } = await import("../IngestionJobRow");
  act(() => {
    root.render(<IngestionJobRow job={job} />);
  });
}

describe("IngestionJobRow", () => {
  // Issue #306: commit パスで preview の suggested 値を server function に
  // 転送し、新規ディレクトリ作成時のみ rule 2 (生 router.invalidate) を
  // 呼ぶ regression guard。
  it("forwards suggestedDirectoryId as directoryId and does NOT call router.invalidate", async () => {
    commitMock.mockResolvedValue({ noteId: "note-1" });

    await renderRow(previewingJobExistingDir);

    await act(async () => {
      getSaveButton().click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(commitMock).toHaveBeenCalledTimes(1);
    const callArg = commitMock.mock.calls[0]?.[0];
    expect(callArg.data).toMatchObject({
      jobId: "job-1",
      directoryId: "dir-1",
    });
    expect(callArg.data).not.toHaveProperty("directoryNameToCreate");
    // 既存ディレクトリ選択は Sidebar tree を変えないため invalidate は呼ばれない
    expect(routerInvalidate).not.toHaveBeenCalled();
    expect(routerNavigate).toHaveBeenCalledTimes(1);
  });

  it("forwards suggestedDirectoryName as directoryNameToCreate and calls router.invalidate", async () => {
    commitMock.mockResolvedValue({ noteId: "note-2" });

    await renderRow(previewingJobNewDir);

    await act(async () => {
      getSaveButton().click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(commitMock).toHaveBeenCalledTimes(1);
    const callArg = commitMock.mock.calls[0]?.[0];
    expect(callArg.data).toMatchObject({
      jobId: "job-1",
      directoryNameToCreate: "ideas",
    });
    expect(callArg.data).not.toHaveProperty("directoryId");
    // rule 2: 新規ディレクトリ作成で Sidebar tree が変わるため _app も invalidate
    expect(routerInvalidate).toHaveBeenCalledTimes(1);
    expect(routerNavigate).toHaveBeenCalledTimes(1);
  });

  // Issue #254: the failed card exposes an owner-facing 再試行 action that
  // calls `ownerRetryIngestionJobFn` and invalidates the router so the card
  // re-renders back to its `pending` state.
  it("calls ownerRetryIngestionJobFn + router.invalidate when 再試行 is clicked on a failed card", async () => {
    ownerRetryMock.mockResolvedValue({ jobId: "job-1" });

    await renderRow(failedJob);

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

    expect(ownerRetryMock).toHaveBeenCalledTimes(1);
    expect(ownerRetryMock.mock.calls[0]?.[0]).toMatchObject({
      data: { jobId: "job-1" },
    });
    expect(routerInvalidate).toHaveBeenCalledTimes(1);
  });

  // Issue #254 (review W-002): when 再試行 fails, the card does NOT invalidate
  // the router and surfaces an inline error instead.
  it("does not call router.invalidate and shows an inline error when 再試行 fails", async () => {
    ownerRetryMock.mockRejectedValue(
      new AppServerError({
        kind: "business",
        code: "ingestion_no_temp_storage_for_retry",
        message: "Ingestion job has no staged upload to retry",
      }),
    );

    await renderRow(failedJob);

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
    expect(routerInvalidate).not.toHaveBeenCalled();
    // The card renders two alert regions: the job's own failure reason and
    // the action error. The retry-failure message must surface in one of them.
    const alertText = Array.from(
      document.body.querySelectorAll('[role="alert"]'),
    )
      .map((el) => el.textContent ?? "")
      .join(" ");
    expect(alertText).toContain("再試行に必要なデータが見つかりません");
  });

  // Issue #238: a discarded card is visually distinguished (data-discarded
  // drives the dimmed Tailwind variant) and shows the "破棄済み" badge so it
  // cannot be confused with a retained job once the toggle reveals it.
  it("marks a discarded card with data-discarded and the 破棄済み badge", async () => {
    await renderRow(discardedJob);

    const card = container.querySelector("[data-discarded]");
    expect(card).not.toBeNull();
    expect(document.body.textContent ?? "").toContain("破棄済み");
  });

  it("does NOT mark a non-discarded card with data-discarded", async () => {
    await renderRow(failedJob);

    expect(container.querySelector("[data-discarded]")).toBeNull();
  });

  // A discarded job is terminal: the card is read-only, so none of the
  // status-gated action buttons (保存/再生成/破棄/再試行) render.
  it("renders no action buttons on a discarded card", async () => {
    await renderRow(discardedJob);

    expect(
      container.querySelectorAll("button").length,
      "discarded card should expose no action buttons",
    ).toBe(0);
  });

  it("does not call router.invalidate when commit fails", async () => {
    commitMock.mockRejectedValue(new Error("commit failed"));

    await renderRow(previewingJobNewDir);

    await act(async () => {
      getSaveButton().click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(routerInvalidate).not.toHaveBeenCalled();
    expect(routerNavigate).not.toHaveBeenCalled();
  });

  // Issue #98 (T-W-003): on a discard failure the error must surface inside
  // the ConfirmDialog (its role="alert"), NOT in the row's inline FORM_ERROR
  // (the `!confirmDiscardOpen` guard), and the dialog must stay open. Pressing
  // cancel (onClose) then clears the error from both the dialog and the row.
  it("shows discard error inside the dialog (not inline) and clears it on cancel", async () => {
    discardMock.mockRejectedValue(
      new AppServerError({
        kind: "system",
        code: null,
        message: "System error",
      }),
    );

    await renderRow(previewingJobExistingDir);

    // Open the discard confirmation dialog.
    const discardBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => (b.textContent ?? "").trim() === "破棄");
    expect(discardBtn).toBeDefined();
    await act(async () => {
      discardBtn?.click();
    });

    const dialog = document.body.querySelector<HTMLElement>(
      '[role="alertdialog"]',
    );
    expect(dialog).not.toBeNull();

    // Confirm the discard inside the dialog (the submit button).
    const confirmBtn = dialog?.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    expect(confirmBtn).not.toBeNull();
    await act(async () => {
      confirmBtn?.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(discardMock).toHaveBeenCalledTimes(1);
    expect(routerInvalidate).not.toHaveBeenCalled();

    // Dialog is still open after the failure.
    const dialogAfter = document.body.querySelector<HTMLElement>(
      '[role="alertdialog"]',
    );
    expect(dialogAfter).not.toBeNull();

    // The error is rendered inside the dialog's role="alert" region…
    const dialogAlert = dialogAfter?.querySelector('[role="alert"]');
    expect(dialogAlert?.textContent).toBe("システムエラーが発生しました");

    // …and NOT in the row's inline FORM_ERROR (the card has no errorCode, so
    // the only inline alert source would be the shared error state, which the
    // `!confirmDiscardOpen` guard suppresses while the dialog is open).
    const inlineAlerts = Array.from(
      container.querySelectorAll('[role="alert"]'),
    );
    expect(inlineAlerts).toHaveLength(0);

    // Cancel (onClose) closes the dialog and clears the error: it must not
    // "move" to the row's inline FORM_ERROR.
    const cancelBtn = Array.from(
      (dialogAfter as HTMLElement).querySelectorAll<HTMLButtonElement>(
        "button",
      ),
    ).find((b) => (b.textContent ?? "").trim() === "キャンセル");
    expect(cancelBtn).toBeDefined();
    await act(async () => {
      cancelBtn?.click();
    });

    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull();
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(0);
    expect(document.body.querySelectorAll('[role="alert"]')).toHaveLength(0);
  });
});
