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

const notifyMock = vi.fn();
vi.mock("../queueBadgeBus", () => ({
  notifyIngestionQueueChanged: notifyMock,
}));

// The edit dialog has its own test file (IngestionJobEditDialog.test.tsx);
// here a marker stub keeps the row tests free of its server-fn wiring.
vi.mock("../IngestionJobEditDialog", () => ({
  IngestionJobEditDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="edit-dialog-stub" /> : null,
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

const existingDirPreview: NonNullable<IngestionJobWire["preview"]> = {
  title: "Suggested Title",
  contentHtml: "<p>body</p>",
  suggestedDirectoryId: "dir-1",
  suggestedDirectoryName: null,
  frontMatterJson: "{}",
  suggestedTagNames: [],
  internalLinkRefs: [],
  mediaRefs: [],
};

const previewingJobExistingDir: IngestionJobWire = {
  id: "job-1",
  ownerId: "owner-1",
  originalFileName: "doc.md",
  mimeType: "text/markdown",
  byteSize: 1024,
  kind: "markdown",
  status: "previewing",
  preview: existingDirPreview,
  errorCode: null,
  regenerationCount: 0,
  savedAsNoteId: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

const previewingJobNewDir: IngestionJobWire = {
  ...previewingJobExistingDir,
  preview: {
    ...existingDirPreview,
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
  notifyMock.mockClear();
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
  // Issue #538: previewing rows expose an 編集 action that opens the
  // queue-side edit dialog (row-local state).
  it("shows the 編集 button on a previewing row and opens the edit dialog", async () => {
    await renderRow(previewingJobExistingDir);

    const editBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => (b.textContent ?? "").trim() === "編集");
    expect(editBtn).toBeDefined();
    expect(
      document.body.querySelector('[data-testid="edit-dialog-stub"]'),
    ).toBeNull();

    await act(async () => {
      editBtn?.click();
    });
    expect(
      document.body.querySelector('[data-testid="edit-dialog-stub"]'),
    ).not.toBeNull();
  });

  it("does not show the 編集 button on failed / discarded rows", async () => {
    await renderRow(failedJob);
    expect(
      Array.from(
        document.body.querySelectorAll<HTMLButtonElement>("button"),
      ).some((b) => (b.textContent ?? "").trim() === "編集"),
    ).toBe(false);

    await renderRow(discardedJob);
    expect(
      Array.from(
        document.body.querySelectorAll<HTMLButtonElement>("button"),
      ).some((b) => (b.textContent ?? "").trim() === "編集"),
    ).toBe(false);
  });

  // Issue #538: successful mutations announce the queue change so the
  // header badge refreshes.
  it("notifies the queue badge bus after a successful commit", async () => {
    commitMock.mockResolvedValue({ noteId: "note-1" });
    await renderRow(previewingJobExistingDir);
    await act(async () => {
      getSaveButton().click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it("does not notify the queue badge bus when commit fails", async () => {
    commitMock.mockRejectedValue(new Error("commit failed"));
    await renderRow(previewingJobExistingDir);
    await act(async () => {
      getSaveButton().click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("notifies the queue badge bus after a successful discard", async () => {
    discardMock.mockResolvedValue(undefined);
    await renderRow(previewingJobExistingDir);

    const discardBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => (b.textContent ?? "").trim() === "破棄");
    await act(async () => {
      discardBtn?.click();
    });
    const confirmBtn = document.body
      .querySelector<HTMLElement>('[role="alertdialog"]')
      ?.querySelector<HTMLButtonElement>('button[type="submit"]');
    await act(async () => {
      confirmBtn?.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(discardMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it("notifies the queue badge bus after a successful regenerate", async () => {
    regenerateMock.mockResolvedValue(undefined);
    await renderRow(previewingJobExistingDir);

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

    expect(regenerateMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  // commit パスは preview の suggested 値を server function に転送し、
  // 新規ディレクトリ作成時のみ 生 router.invalidate を呼ぶ regression guard。
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
    // 新規ディレクトリ作成で Sidebar tree が変わるため _app も invalidate される
    expect(routerInvalidate).toHaveBeenCalledTimes(1);
    expect(routerNavigate).toHaveBeenCalledTimes(1);
  });

  // The failed card exposes an owner-facing 再試行 action that calls
  // `ownerRetryIngestionJobFn` and invalidates the router so the card
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
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  // When 再試行 fails, the card does NOT invalidate the router and surfaces
  // an inline error instead.
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

  // After 再試行 fails, the inline RetryableError renders its OWN 再試行
  // button (small pill, `data-sm`) distinct from the owner-action 再試行
  // (plain pill, no `data-sm`). Both carry the same label, so the test must
  // disambiguate by attribute — clicking the RetryableError one re-runs the
  // last action (owner retry) a second time without grabbing the wrong button.
  it("renders a distinct RetryableError retry button after 再試行 fails and re-runs the last action", async () => {
    ownerRetryMock.mockRejectedValue(
      new AppServerError({
        kind: "business",
        code: "ingestion_no_temp_storage_for_retry",
        message: "Ingestion job has no staged upload to retry",
      }),
    );

    await renderRow(failedJob);

    const retryButtons = () =>
      Array.from(
        document.body.querySelectorAll<HTMLButtonElement>("button"),
      ).filter((b) => (b.textContent ?? "").trim() === "再試行");

    // Before any failure: exactly one 再試行 — the owner action (no data-sm).
    const before = retryButtons();
    expect(before).toHaveLength(1);
    expect(before[0]?.getAttribute("data-sm")).toBeNull();

    await act(async () => {
      before[0]?.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(ownerRetryMock).toHaveBeenCalledTimes(1);
    expect(routerInvalidate).not.toHaveBeenCalled();

    // After the failure: two 再試行 buttons now coexist — the owner action
    // and the RetryableError affordance. They are distinguishable by `data-sm`.
    const after = retryButtons();
    expect(after).toHaveLength(2);
    const ownerRetryBtn = after.find((b) => b.getAttribute("data-sm") === null);
    const retryableErrorBtn = after.find(
      (b) => b.getAttribute("data-sm") === "",
    );
    expect(ownerRetryBtn).toBeDefined();
    expect(retryableErrorBtn).toBeDefined();
    // The RetryableError button lives inside its own role=alert region — a
    // separate alert from the card's own failure-reason `<p role="alert">`.
    const alerts = Array.from(container.querySelectorAll('[role="alert"]'));
    const retryableAlert = alerts.find((el) =>
      el.contains(retryableErrorBtn as Node),
    );
    expect(retryableAlert).toBeDefined();
    expect(retryableAlert?.textContent).toContain(
      "再試行に必要なデータが見つかりません",
    );

    // Clicking the RetryableError retry re-runs the captured last action
    // (the owner retry), proving the inline retry path is wired.
    await act(async () => {
      retryableErrorBtn?.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(ownerRetryMock).toHaveBeenCalledTimes(2);
  });

  // A discarded card is visually distinguished (data-discarded drives the
  // dimmed Tailwind variant) and shows the "破棄済み" badge so it cannot be
  // confused with a retained job once the toggle reveals it.
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

  // Discard dims the card optimistically (data-discarded) the moment the
  // transition starts, before the loader round-trip resolves, and the
  // status-gated action buttons disappear in the same tick.
  it("optimistically dims the card and hides actions while discard is pending", async () => {
    let resolveDiscard: (() => void) | undefined;
    discardMock.mockReturnValue(
      new Promise<void>((res) => {
        resolveDiscard = res;
      }),
    );

    await renderRow(previewingJobExistingDir);
    expect(container.querySelector("[data-discarded]")).toBeNull();

    const discardBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => (b.textContent ?? "").trim() === "破棄");
    await act(async () => {
      discardBtn?.click();
    });
    const confirmBtn = document.body
      .querySelector<HTMLElement>('[role="alertdialog"]')
      ?.querySelector<HTMLButtonElement>('button[type="submit"]');
    await act(async () => {
      confirmBtn?.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(discardMock).toHaveBeenCalledTimes(1);
    // Dimmed optimistically even though the discard promise is unresolved.
    expect(container.querySelector("[data-discarded]")).not.toBeNull();
    // The previewing action buttons are hidden by the optimistic discarded
    // value, not the raw `job.status`.
    expect(
      Array.from(
        document.body.querySelectorAll<HTMLButtonElement>("button"),
      ).some((b) => (b.textContent ?? "").includes("ノートとして保存")),
    ).toBe(false);

    await act(async () => {
      resolveDiscard?.();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  // A failed discard snaps the optimistic dim back to the server-confirmed
  // (non-discarded) status.
  it("reverts the optimistic dim when discard fails", async () => {
    discardMock.mockRejectedValue(
      new AppServerError({
        kind: "system",
        code: null,
        message: "System error",
      }),
    );

    await renderRow(previewingJobExistingDir);

    const discardBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => (b.textContent ?? "").trim() === "破棄");
    await act(async () => {
      discardBtn?.click();
    });
    const confirmBtn = document.body
      .querySelector<HTMLElement>('[role="alertdialog"]')
      ?.querySelector<HTMLButtonElement>('button[type="submit"]');
    await act(async () => {
      confirmBtn?.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(discardMock).toHaveBeenCalledTimes(1);
    // Snapped back: no longer dimmed.
    expect(container.querySelector("[data-discarded]")).toBeNull();
    // The dialog stays open and surfaces the error.
    expect(document.body.querySelector('[role="alertdialog"]')).not.toBeNull();
    const alerts = Array.from(
      document.body.querySelectorAll('[role="alert"]'),
    ).map((el) => el.textContent ?? "");
    expect(alerts.join(" ")).toContain("システムエラーが発生しました");
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

  // On a discard failure the error must surface inside the ConfirmDialog
  // (its role="alert"), NOT in the row's inline FORM_ERROR (the
  // `!confirmDiscardOpen` guard), and the dialog must stay open. Pressing
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
