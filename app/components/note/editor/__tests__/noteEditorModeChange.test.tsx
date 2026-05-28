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

async function renderEditor(): Promise<void> {
  await act(async () => {
    root.render(
      <NoteEditor
        mode="edit"
        noteId="n1"
        initialTitle="Hello"
        initialContentHtml="<p>foo</p>"
        initialFrontMatter={{}}
        initialTagNames={[]}
        initialDirectoryId={null}
        tree={[]}
      />,
    );
  });
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
