// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";

/**
 * Issue #798 review Test W-001: end-to-end wiring of AC-2's body. The
 * WYSIWYG toolbar's「画像」button must trigger `.click()` on the WYSIWYG
 * `MediaUploader`'s `<input type="file">` (`onRequestImage` →
 * `mediaInputRef.current?.click()`). happy-dom cannot open the OS file
 * dialog, so this pins the wiring proxy: clicking the toolbar button calls
 * `HTMLElement.prototype.click` with the file input as the receiver.
 *
 * The full `NoteEditor` is rendered against the same harness as
 * `noteEditorModeChange.test.tsx` (server-fn / router / useServerFn mocks)
 * — the orchestrator owns the shared `mediaInputRef`, so the結線 can only
 * be exercised through it.
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

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
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

async function flushRaf(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

describe("NoteEditor WYSIWYG image button wiring (Issue #798 W-001)", () => {
  it("clicks the MediaUploader file input when the toolbar image button is pressed", async () => {
    // Edit surface defaults to inline; `<p>foo</p>` carries only supported
    // tags so switching to WYSIWYG mounts the pane directly (no decoration
    // dialog), matching the gate proven in noteEditorModeChange.test.tsx.
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
    await act(async () => {
      tabByLabel("WYSIWYG").click();
    });
    await flushRaf();

    // The WYSIWYG toolbar and the WYSIWYG MediaUploader's file input are both
    // mounted now.
    const imageButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="画像"]',
    );
    expect(imageButton).not.toBeNull();
    expect(imageButton?.disabled).toBe(false);
    const fileInput =
      container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();

    // Spy on the prototype `click` (the file input inherits it). Trigger the
    // toolbar button via a dispatched event rather than `.click()` so the
    // button's own click does not register on the spy — only the wired
    // `mediaInputRef.current.click()` should.
    const clickSpy = vi
      .spyOn(window.HTMLElement.prototype, "click")
      .mockImplementation(() => {});

    await act(async () => {
      imageButton?.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true }),
      );
    });

    expect(clickSpy).toHaveBeenCalledTimes(1);
    // The receiver of the `.click()` is the WYSIWYG MediaUploader's file
    // input — proving `onRequestImage` resolved `mediaInputRef` to it.
    expect(clickSpy.mock.contexts).toContain(fileInput);
  });
});
