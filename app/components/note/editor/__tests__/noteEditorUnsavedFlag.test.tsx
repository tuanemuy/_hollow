// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";

/**
 * Issue #583 ADR-002: `NoteEditor` mirrors `dirtyKeys` into the cross-route
 * `sessionStorage` unsaved flag via edge tracking plus an explicit clear on
 * manual save.
 *
 * - rising edge (0 → >0, the first edit) → `markNoteUnsaved`
 * - falling edge (>0 → 0, the `autosaveSuccess` reset) → `clearNoteUnsaved`
 * - initial mount (0 → 0, `EMPTY_DIRTY`) → no clear (must not clobber a flag
 *   left by another route in the same session)
 * - manual save (`saveNote` success — which does NOT reset `dirtyKeys`) →
 *   explicit `clearNoteUnsaved`
 * - `mode="new"` (`noteId === null`) → never touches the flag
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const KEY = "hollow3:note:n1:dirty";

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
const searchInternalLinkTargetsMock = vi.fn().mockResolvedValue([]);
const navigateMock = vi.fn().mockResolvedValue(undefined);

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
    navigate: navigateMock,
    invalidate: vi.fn().mockResolvedValue(undefined),
    history: { back: vi.fn() },
  }),
}));

const { NoteEditor } = await import("../NoteEditor");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  window.sessionStorage.clear();
  navigateMock.mockClear();
  saveNoteMock.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  window.sessionStorage.clear();
  vi.clearAllMocks();
});

async function renderEdit(): Promise<void> {
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

async function renderNew(): Promise<void> {
  await act(async () => {
    root.render(<NoteEditor mode="new" tree={[]} />);
  });
}

function titleInput(): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>("#note-editor-title");
  if (el === null) throw new Error("title input not found");
  return el;
}

async function typeTitle(value: string): Promise<void> {
  const el = titleInput();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function saveButton(): HTMLButtonElement {
  const el = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  ).find((b) => (b.textContent ?? "").trim() === "保存");
  if (el === undefined) throw new Error("save button not found");
  return el;
}

describe("NoteEditor → unsaved flag sync (Issue #583)", () => {
  it("does not set the flag on a fresh unedited mount (0 → 0)", async () => {
    await renderEdit();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it("does not clobber an existing flag on unedited mount", async () => {
    window.sessionStorage.setItem(KEY, "1");
    await renderEdit();
    expect(window.sessionStorage.getItem(KEY)).toBe("1");
  });

  it("sets the flag on the first edit (rising edge 0 → >0)", async () => {
    await renderEdit();
    await typeTitle("Edited");
    expect(window.sessionStorage.getItem(KEY)).toBe("1");
  });

  it("explicitly clears the flag on manual save success", async () => {
    await renderEdit();
    await typeTitle("Edited");
    expect(window.sessionStorage.getItem(KEY)).toBe("1");

    await act(async () => {
      saveButton().click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(saveNoteMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it("never touches the flag for a new note (noteId === null)", async () => {
    await renderNew();
    await typeTitle("Brand new note");
    expect(window.sessionStorage.length).toBe(0);
  });
});
