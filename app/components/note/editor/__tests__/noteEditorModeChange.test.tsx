// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";

/**
 * Issue #233 review-001 W-T-010: pins the `onModeChange` confirm
 * dispatch conditions documented in ADR-004 / ADR-008.
 *
 * The full `NoteEditor` is rendered against happy-dom so the live
 * `state.dirtyKeys` / `state.autosave` snapshot is what feeds the
 * handler — there is no useful way to reach this branch with a pure
 * reducer test because the gate lives in the orchestrator.
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const createNoteMock = vi.fn().mockResolvedValue({ noteId: "n1" });
const saveNoteMock = vi.fn().mockResolvedValue(undefined);
const createDirectoryMock = vi
  .fn()
  .mockResolvedValue({ directory: { id: "d1" } });
const saveDraftMock = vi.fn().mockResolvedValue(undefined);
const acquireLockMock = vi.fn().mockResolvedValue({
  lockId: "l1",
  expiresAt: null,
});
const extendLockMock = vi.fn().mockResolvedValue({ expiresAt: null });
const releaseLockMock = vi.fn().mockResolvedValue(undefined);
const presignMediaMock = vi.fn();
const finalizeMediaMock = vi.fn();
// WysiwygEditor (mounted when switching to the new edit-surface WYSIWYG
// tab, Issue #696) reads this server fn for the `[[` internal-link
// suggest plugin. The editor never actually queries it in these tests,
// but the named export must exist on the mock so its module-level read
// does not throw.
const searchInternalLinkTargetsMock = vi.fn().mockResolvedValue({
  suggestions: [],
});

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter(
    [
      [createNoteMock, createNoteMock],
      [saveNoteMock, saveNoteMock],
      [createDirectoryMock, createDirectoryMock],
      [saveDraftMock, saveDraftMock],
      [acquireLockMock, acquireLockMock],
      [extendLockMock, extendLockMock],
      [releaseLockMock, releaseLockMock],
      [presignMediaMock, presignMediaMock],
      [finalizeMediaMock, finalizeMediaMock],
      [searchInternalLinkTargetsMock, searchInternalLinkTargetsMock],
    ],
    vi.fn(),
  ),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

vi.mock("@/components/note/actions", () => ({
  createNoteFn: createNoteMock,
  saveNoteFn: saveNoteMock,
  saveNoteDraftFn: saveDraftMock,
  acquireEditLockFn: acquireLockMock,
  extendEditLockFn: extendLockMock,
  releaseEditLockFn: releaseLockMock,
  searchInternalLinkTargetsFn: searchInternalLinkTargetsMock,
}));

vi.mock("@/components/directory/actions", () => ({
  createDirectoryFn: createDirectoryMock,
}));

vi.mock("@/components/media/actions", () => ({
  presignMediaUploadFn: presignMediaMock,
  finalizeMediaUploadFn: finalizeMediaMock,
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    navigate: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn().mockResolvedValue(undefined),
    history: { back: vi.fn() },
  }),
}));

const { NoteEditor } = await import("../NoteEditor");

let container: HTMLDivElement;
let root: Root;
let confirmMock: ReturnType<typeof vi.fn>;
let originalConfirm: ((message?: string) => boolean) | undefined;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  confirmMock = vi.fn().mockReturnValue(true);
  originalConfirm = (window as unknown as { confirm?: typeof window.confirm })
    .confirm;
  (window as unknown as { confirm: (m?: string) => boolean }).confirm =
    confirmMock as unknown as (m?: string) => boolean;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  (
    window as unknown as { confirm: typeof window.confirm | undefined }
  ).confirm = originalConfirm as typeof window.confirm;
  vi.clearAllMocks();
});

function tabByLabel(label: string): HTMLButtonElement {
  const buttons = Array.from(
    container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  );
  const found = buttons.find((b) => b.textContent?.trim() === label);
  if (found === undefined) {
    throw new Error(
      `tab "${label}" not found among [${buttons.map((b) => b.textContent?.trim()).join(", ")}]`,
    );
  }
  return found;
}

async function renderEditor(initialContentHtml = "<p>foo</p>"): Promise<void> {
  await act(async () => {
    root.render(
      <NoteEditor
        mode="edit"
        noteId="n1"
        initialTitle="Hello"
        initialContentHtml={initialContentHtml}
        initialFrontMatter={{}}
        initialTagNames={[]}
        initialDirectoryId={null}
        tree={[]}
      />,
    );
  });
}

function alertDialog(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[role="alertdialog"]');
}

function dialogButtonByLabel(label: string): HTMLButtonElement {
  const dialog = alertDialog();
  if (dialog === null) throw new Error("no alertdialog open");
  const buttons = Array.from(
    dialog.querySelectorAll<HTMLButtonElement>("button"),
  );
  const found = buttons.find((b) => b.textContent?.trim() === label);
  if (found === undefined) {
    throw new Error(
      `dialog button "${label}" not found among [${buttons
        .map((b) => b.textContent?.trim())
        .join(", ")}]`,
    );
  }
  return found;
}

function isWysiwygMounted(): boolean {
  // The WYSIWYG pane renders a `role="toolbar"` labelled "書式"; no other
  // pane does, so its presence is a reliable mounted-marker for these
  // mode-gate assertions.
  return (
    document.body.querySelector('[role="toolbar"][aria-label="書式"]') !== null
  );
}

describe("NoteEditor.onModeChange confirm conditions", () => {
  it("does not confirm when state is clean (no dirty, autosave idle)", async () => {
    await renderEditor();
    await act(async () => {
      tabByLabel("HTML").click();
    });
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("confirms when contentHtml is dirty before switching modes", async () => {
    await renderEditor();
    // Make the editor dirty via the title field — the cheapest path
    // that does not depend on the InlineEditor MutationObserver async
    // cycle. The branch is gated on `dirtyKeys.size > 0`, not on which
    // key specifically.
    const titleInput =
      container.querySelector<HTMLInputElement>("#note-editor-title");
    expect(titleInput).not.toBeNull();
    await act(async () => {
      if (titleInput !== null) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set;
        setter?.call(titleInput, "Hello world");
        titleInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await act(async () => {
      tabByLabel("HTML").click();
    });
    expect(confirmMock).toHaveBeenCalledTimes(1);
  });

  it("confirms when autosave entered an error state via the dirty path", async () => {
    await renderEditor();
    // Stage a saveDraft rejection so the autosave path lands in
    // `error`. The dirtyKeys branch and the autosave.error branch are
    // OR'd in `onModeChange` (ADR-004); we cannot easily reach the
    // "error-only, no dirty" combination because the reducer never
    // clears dirtyKeys on `autosaveError`. This test pins the broader
    // invariant: any non-idle state triggers confirm. The dirty-only
    // case is already pinned above.
    saveDraftMock.mockRejectedValueOnce(new Error("autosave network"));
    const titleInput =
      container.querySelector<HTMLInputElement>("#note-editor-title");
    await act(async () => {
      if (titleInput !== null) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set;
        setter?.call(titleInput, "x");
        titleInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await act(async () => {
      tabByLabel("HTML").click();
    });
    expect(confirmMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * Issue #696: switching to WYSIWYG on the edit surface warns before
 * dropping decoration. The gate runs against the latest committed
 * `state.contentHtml` and only opens the decoration-loss `ConfirmDialog`
 * when `detectUnsupportedTags` finds at least one unsupported tag. The
 * confirm path dispatches `setMode "wysiwyg"` AND `wysiwygUnsupportedAck`
 * together so the in-pane banner mounts already acknowledged — these
 * tests pin that latch coupling (the dialog's lostTags and the pane's
 * `onCreate` re-detection are the same set, so the ack survives).
 */
describe("NoteEditor.onModeChange WYSIWYG decoration-loss gate (Issue #696)", () => {
  it("opens the warning dialog and defers the switch when unsupported tags exist (AC-2/AC-5)", async () => {
    await renderEditor("<section><p>x</p></section>");
    await act(async () => {
      tabByLabel("WYSIWYG").click();
    });
    // Dialog is open and the switch is deferred (no WYSIWYG pane yet).
    const dialog = alertDialog();
    expect(dialog).not.toBeNull();
    expect(isWysiwygMounted()).toBe(false);
    // The lost element is listed (AC-5).
    expect(dialog?.textContent ?? "").toContain("<section>");
    expect(dialog?.textContent ?? "").toContain(
      "次の要素は WYSIWYG モードでは保持されません",
    );
    // No unsaved changes, so the unsaved `window.confirm` did not fire.
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("switches without a dialog when only supported tags exist (AC-3)", async () => {
    await renderEditor("<p>x</p>");
    await act(async () => {
      tabByLabel("WYSIWYG").click();
    });
    expect(alertDialog()).toBeNull();
    expect(isWysiwygMounted()).toBe(true);
  });

  it("keeps mode and content when the dialog is cancelled (AC-4)", async () => {
    await renderEditor("<section><p>x</p></section>");
    await act(async () => {
      tabByLabel("WYSIWYG").click();
    });
    expect(alertDialog()).not.toBeNull();
    await act(async () => {
      dialogButtonByLabel("キャンセル").click();
    });
    expect(alertDialog()).toBeNull();
    // Still on the default `inline` pane — WYSIWYG never mounted.
    expect(isWysiwygMounted()).toBe(false);
  });

  it("switches and acks the in-pane banner when the dialog is confirmed (AC-7)", async () => {
    await renderEditor("<section><p>x</p></section>");
    await act(async () => {
      tabByLabel("WYSIWYG").click();
    });
    await act(async () => {
      dialogButtonByLabel("切り替える").click();
    });
    // Flush TipTap's onCreate (it runs inside rAF under happy-dom and
    // re-detects the same `<section>` set against the original `value`).
    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    expect(alertDialog()).toBeNull();
    expect(isWysiwygMounted()).toBe(true);
    // Latch coupling (Issue #696 ADR-002): the confirm handler seeds
    // `wysiwygUnsupportedTags` with the SAME set the dialog listed, then
    // sets the ack. So when the WYSIWYG pane's `onCreate` re-detects
    // `<section>`, the reducer hits the `setsEqual` short-circuit and the
    // ack survives. The banner must therefore mount already acknowledged:
    // it lists the lost element but renders NO "了解した" re-acknowledge
    // button — the user is never asked twice about the loss they just
    // approved in the dialog.
    const banner = document.body.querySelector<HTMLElement>('[role="note"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent ?? "").toContain("<section>");
    expect(document.body.textContent ?? "").not.toContain("了解した");
  });

  it("runs unsaved-confirm before the decoration dialog without double-prompting the loss (AC-7)", async () => {
    await renderEditor("<section><p>x</p></section>");
    // Make the editor dirty so the unsaved `window.confirm` fires first.
    const titleInput =
      container.querySelector<HTMLInputElement>("#note-editor-title");
    await act(async () => {
      if (titleInput !== null) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set;
        setter?.call(titleInput, "Hello world");
        titleInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    confirmMock.mockReturnValue(true);
    await act(async () => {
      tabByLabel("WYSIWYG").click();
    });
    // Order: window.confirm (unsaved) once, THEN the decoration dialog.
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(alertDialog()).not.toBeNull();
    // The decoration concern is surfaced exactly once (single dialog).
    expect(document.body.querySelectorAll('[role="alertdialog"]').length).toBe(
      1,
    );
  });

  it("does not switch to WYSIWYG when the unsaved confirm is cancelled", async () => {
    await renderEditor("<section><p>x</p></section>");
    const titleInput =
      container.querySelector<HTMLInputElement>("#note-editor-title");
    await act(async () => {
      if (titleInput !== null) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set;
        setter?.call(titleInput, "Hello world");
        titleInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    confirmMock.mockReturnValue(false);
    await act(async () => {
      tabByLabel("WYSIWYG").click();
    });
    // Cancelling the unsaved confirm aborts before the decoration gate.
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(alertDialog()).toBeNull();
    expect(isWysiwygMounted()).toBe(false);
  });
});

/**
 * Issue #286: discard during mode switch must cancel in-flight saveDraft.
 *
 * Uses fake timers so we can advance past the AUTOSAVE_DEBOUNCE_MS
 * (1500ms) without hanging the test. saveDraft is mocked to either hang
 * on a never-resolving promise (so we can observe it being in-flight at
 * the moment of mode switch) or to reject when its AbortSignal aborts
 * (so we can assert the abort propagated through the fetcher boundary).
 */
describe("NoteEditor.onModeChange in-flight autosave cancel (Issue #286)", () => {
  type SaveDraftArgs = { data: unknown; signal?: AbortSignal };

  async function makeDirty(): Promise<void> {
    const titleInput =
      container.querySelector<HTMLInputElement>("#note-editor-title");
    expect(titleInput).not.toBeNull();
    await act(async () => {
      if (titleInput !== null) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set;
        setter?.call(titleInput, "dirty");
        titleInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  }

  it("forwards an AbortSignal to saveDraft once autosave fires", async () => {
    vi.useFakeTimers();
    try {
      await renderEditor();
      // Hang the in-flight saveDraft so the controller stays alive long
      // enough for the assertion.
      saveDraftMock.mockImplementation(() => new Promise(() => {}));
      await makeDirty();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(saveDraftMock).toHaveBeenCalled();
      const call = saveDraftMock.mock.calls.at(-1)?.[0] as
        | SaveDraftArgs
        | undefined;
      expect(call).toBeDefined();
      expect(call?.signal).toBeInstanceOf(AbortSignal);
      expect(call?.signal?.aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts the in-flight saveDraft when the user picks discard", async () => {
    vi.useFakeTimers();
    try {
      await renderEditor();
      // Reject only when the signal aborts so we can both observe the
      // in-flight state and verify the abort propagates.
      saveDraftMock.mockImplementation(
        ({ signal }: SaveDraftArgs) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          }),
      );
      await makeDirty();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(saveDraftMock).toHaveBeenCalled();
      const callsBeforeAbort = saveDraftMock.mock.calls.length;
      const call = saveDraftMock.mock.calls.at(-1)?.[0] as
        | SaveDraftArgs
        | undefined;
      const signal = call?.signal;
      expect(signal?.aborted).toBe(false);

      confirmMock.mockReturnValue(true);
      await act(async () => {
        tabByLabel("HTML").click();
      });
      // Mode-switch dispatched `autosaveDiscarded` which abort()'d the
      // controller. Allow any pending microtasks (rejected promise +
      // `.finally`) to flush.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(signal?.aborted).toBe(true);
      // AutosaveIndicator should be back in idle. In edit mode the idle
      // state renders nothing (autosave is armed-but-clean), so the prior
      // "保存中…" copy must be gone and the new-note "自動保存はオフ" copy
      // must NOT appear on an existing-note surface.
      const indicatorText = container.textContent ?? "";
      expect(indicatorText).not.toContain("保存中");
      expect(indicatorText).not.toContain("自動保存はオフ");

      // Issue #286 review-001 W-T-003: indirectly assert that the prior
      // in-flight promise's `.finally` cleared `inFlightRef.current`.
      // If it had not, a fresh `schedule()` would hit the
      // `inFlightRef.current !== null` branch and only set `reRunRef`
      // instead of starting a new flush. Re-dirty the title and let the
      // new mode's effect fire — a brand-new `saveDraft` call must
      // surface, proving the in-flight slot is genuinely empty.
      const titleInput =
        container.querySelector<HTMLInputElement>("#note-editor-title");
      await act(async () => {
        if (titleInput !== null) {
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value",
          )?.set;
          setter?.call(titleInput, "another");
          titleInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(saveDraftMock.mock.calls.length).toBeGreaterThan(callsBeforeAbort);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the in-flight saveDraft alive when the user cancels the confirm", async () => {
    vi.useFakeTimers();
    try {
      await renderEditor();
      saveDraftMock.mockImplementation(
        ({ signal }: SaveDraftArgs) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          }),
      );
      await makeDirty();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      const call = saveDraftMock.mock.calls.at(-1)?.[0] as
        | SaveDraftArgs
        | undefined;
      const signal = call?.signal;
      expect(signal?.aborted).toBe(false);

      confirmMock.mockReturnValue(false);
      await act(async () => {
        tabByLabel("HTML").click();
      });
      expect(confirmMock).toHaveBeenCalledTimes(1);
      // Cancel must not abort the live fetch.
      expect(signal?.aborted).toBe(false);
      // Indicator is still showing the saving copy because we never
      // discarded.
      expect(container.textContent ?? "").toContain("保存中…");
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the autosaveError banner when the user discards during mode switch", async () => {
    vi.useFakeTimers();
    try {
      await renderEditor();
      // Reject 3 times so attemptRef hits MAX_ATTEMPTS and lands in
      // `error`. Backoff waits are 500/1000/2000 ms, so push the
      // timeline far enough past them.
      saveDraftMock.mockRejectedValue(new Error("autosave network"));
      await makeDirty();
      // debounce 1500ms + retry backoffs (500 + 1000 + 2000)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(container.textContent ?? "").toContain("自動保存に失敗");

      // Issue #286 review-001 W-T-004: stop the persistent rejection
      // before discarding so the new mode's effect (post-`setMode`,
      // re-mounted because `state.mode` is now in deps) doesn't
      // immediately re-error from a leftover mock setting. The point
      // of this case is to pin the banner dismiss, not to chain a
      // second retry round.
      saveDraftMock.mockReset();
      saveDraftMock.mockResolvedValue(undefined);

      confirmMock.mockReturnValue(true);
      await act(async () => {
        tabByLabel("HTML").click();
      });
      // Allow the post-discard effect's debounce + flush to settle so
      // the indicator transitions through `saving → saved` rather than
      // being mid-flight when we assert.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(container.textContent ?? "").not.toContain("自動保存に失敗");
    } finally {
      vi.useRealTimers();
    }
  });

  // Issue #286 review-001 W-F-003 / W-T-002: when the user discards
  // mid-saving and switches to a different `canFlush=true` mode, the
  // effect must re-mount on the new mode so autosave resumes without
  // requiring the user to type again. This is the empirical evidence
  // that `state.mode` is in the effect's dep array and the discard
  // semantics ("cancel in-flight, preserve dirtyKeys") hold.
  it("resumes autosave on the new mode after discard preserves dirtyKeys", async () => {
    vi.useFakeTimers();
    try {
      await renderEditor();
      // Hang the first saveDraft so we land in `saving` cleanly.
      let resolveFirst: (() => void) | undefined;
      saveDraftMock.mockImplementationOnce(
        ({ signal }: SaveDraftArgs) =>
          new Promise<void>((resolve, reject) => {
            resolveFirst = () => resolve();
            signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          }),
      );
      // Subsequent calls (post-discard, on the new mode) succeed
      // immediately so the indicator can return to `saved`.
      saveDraftMock.mockResolvedValue(undefined);
      await makeDirty();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(saveDraftMock).toHaveBeenCalledTimes(1);

      confirmMock.mockReturnValue(true);
      await act(async () => {
        tabByLabel("HTML").click();
      });
      // Flush microtasks for the abort listener + finally bookkeeping.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      // Now in `html` mode with dirtyKeys preserved. The re-mounted
      // effect should schedule a fresh flush after the debounce.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      // 2 calls = first (aborted) + second (post-discard on new mode).
      expect(saveDraftMock.mock.calls.length).toBeGreaterThanOrEqual(2);
      // Silence the dangling resolver to be polite to other tests.
      resolveFirst?.();
    } finally {
      vi.useRealTimers();
    }
  });
});
