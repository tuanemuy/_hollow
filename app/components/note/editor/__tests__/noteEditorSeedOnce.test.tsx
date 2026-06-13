// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";

/**
 * Issue #669: pins the seed-once contract of `NoteEditor`.
 *
 * The `useReducer` lazy initializer seeds the editor state from the
 * `initial*` props exactly once, on first mount. A loader re-run that
 * delivers fresh props to the SAME component instance must NOT reset
 * in-progress edits. This guards against a future regression where a
 * `useEffect` props-resync sneaks in; it does NOT (and cannot) cover the
 * raw `router.invalidate()` path where the RSC tree swap remounts the
 * editor — see `.issue/669/adr.md` ADR-003 (known residual gap).
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
  vi.clearAllMocks();
});

async function renderEditor(initial: {
  title: string;
  contentHtml: string;
}): Promise<void> {
  await act(async () => {
    root.render(
      <NoteEditor
        mode="edit"
        noteId="n1"
        initialTitle={initial.title}
        initialContentHtml={initial.contentHtml}
        initialFrontMatter={{}}
        initialTagNames={[]}
        initialDirectoryId={null}
        tree={[]}
      />,
    );
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

describe("NoteEditor seed-once contract (Issue #669)", () => {
  it("seeds from initial props on first mount", async () => {
    await renderEditor({ title: "Hello", contentHtml: "<p>foo</p>" });
    expect(titleInput().value).toBe("Hello");
  });

  it("keeps in-progress edits when fresh initial props arrive on the same instance", async () => {
    await renderEditor({ title: "Hello", contentHtml: "<p>foo</p>" });
    await typeTitle("Edited while loader re-ran");
    expect(titleInput().value).toBe("Edited while loader re-ran");

    // Simulate a loader re-run delivering fresh props (same React
    // instance — `root.render` reconciles, it does not remount).
    await renderEditor({
      title: "Server title",
      contentHtml: "<p>server</p>",
    });

    expect(titleInput().value).toBe("Edited while loader re-ran");
    // The body must not be re-seeded either: `state.contentHtml` (rendered
    // into the inline editor host) keeps the originally seeded content and
    // the fresh `initialContentHtml` never appears anywhere.
    const host = container.querySelector(".note-detail-content");
    expect(host).not.toBeNull();
    expect(host?.textContent ?? "").toContain("foo");
    expect(container.innerHTML).not.toContain("server");
  });
});
