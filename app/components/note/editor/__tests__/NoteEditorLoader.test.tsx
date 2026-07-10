import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { UserDTO } from "@/core/application/dto/identity";
import { NotFoundError } from "@/core/application/errors";

/**
 * Issue #819: the editor was moved onto the detail route's Suspense-streaming
 * shape. As with `NoteDetailContent`, `throw notFound()` does not reach the
 * route's `notFoundComponent` from a `renderServerComponent` RSC, so a missing
 * note must resolve to the inline notFound JSX (the intentional shift away from
 * the old full-page `RouteErrorFallback`), and unrelated errors must re-throw
 * so `SectionErrorBoundary` can catch them.
 */

const loadNoteDetail = vi.fn();
const loadDirectoryTreeFlat = vi.fn();
const loadAllTags = vi.fn();

vi.mock("../../loaders", () => ({
  loadNoteDetail: (...args: unknown[]) => loadNoteDetail(...args),
  loadDirectoryTreeFlat: (...args: unknown[]) => loadDirectoryTreeFlat(...args),
  loadAllTags: (...args: unknown[]) => loadAllTags(...args),
}));

// `NoteEditor` is the heavy `"use client"` orchestrator; stub it so this test
// exercises only the loader's data-resolution / notFound branch. Capture the
// props so the seed-derivation logic (initialTagNames / initialEditLock) can be
// asserted on.
let capturedProps: Record<string, unknown> | null = null;
vi.mock("../NoteEditor", () => ({
  NoteEditor: (props: Record<string, unknown>) => {
    capturedProps = props;
    return <div data-testid="note-editor" />;
  },
}));

const { NoteEditorLoader } = await import("../NoteEditorLoader");

const user = { id: "user-1" } as unknown as UserDTO;
const noteId = "missing-note";

function resolveOthers() {
  loadDirectoryTreeFlat.mockResolvedValue({ flat: [] });
  loadAllTags.mockResolvedValue({ byId: new Map(), tags: [] });
}

describe("NoteEditorLoader notFound handling", () => {
  it("returns the inline notFound JSX (not the error boundary) for a missing note", async () => {
    resolveOthers();
    loadNoteDetail.mockRejectedValue(
      new NotFoundError("NOTE_NOT_FOUND", "Note not found: missing-note"),
    );

    const element = await NoteEditorLoader({ user, noteId });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('role="alert"');
    expect(html).toContain("ノートが見つかりません");
    expect(html).not.toContain("note-editor");
  });

  it("renders the editor when the note resolves", async () => {
    resolveOthers();
    loadNoteDetail.mockResolvedValue({
      note: {
        id: "note-1",
        title: "T",
        contentHtml: "<p>x</p>",
        frontMatter: {},
        tagIds: [],
        directoryId: null,
        editLock: null,
      },
    });

    const element = await NoteEditorLoader({ user, noteId: "note-1" });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("note-editor");
  });

  it("derives initialTagNames / initialEditLock / directory / suggestions from the note", async () => {
    loadDirectoryTreeFlat.mockResolvedValue({ flat: [{ id: "dir-9" }] });
    loadAllTags.mockResolvedValue({
      byId: new Map([
        ["t1", "typescript"],
        ["t2", "react"],
      ]),
      tags: [{ name: "typescript" }, { name: "react" }],
    });
    const expiresIso = "2026-07-10T12:00:00.000Z";
    loadNoteDetail.mockResolvedValue({
      note: {
        id: "note-1",
        title: "T",
        contentHtml: "<p>x</p>",
        frontMatter: {},
        // includes an unknown id that must be dropped
        tagIds: ["t1", "unknown", "t2"],
        directoryId: "dir-9",
        editLock: { expiresAt: expiresIso },
      },
    });

    capturedProps = null;
    const element = await NoteEditorLoader({ user, noteId: "note-1" });
    renderToStaticMarkup(element);

    // Cast back to the union: assigning `null` above narrows the static type,
    // but the mock reassigns it synchronously during render.
    const props = capturedProps as Record<string, unknown> | null;
    expect(props).not.toBeNull();
    // Unknown tag id is filtered out; known ids resolve to names in order.
    expect(props?.initialTagNames).toEqual(["typescript", "react"]);
    expect(props?.initialDirectoryId).toBe("dir-9");
    // A present lock becomes an acquired seed with the epoch-ms expiry.
    expect(props?.initialEditLock).toEqual({
      state: "acquired",
      lockId: null,
      expiresAt: new Date(expiresIso).getTime(),
    });
    expect(props?.tagSuggestions).toEqual(["typescript", "react"]);
  });

  it("omits initialEditLock when the note has no lock", async () => {
    resolveOthers();
    loadNoteDetail.mockResolvedValue({
      note: {
        id: "note-1",
        title: "T",
        contentHtml: "<p>x</p>",
        frontMatter: {},
        tagIds: [],
        directoryId: null,
        editLock: null,
      },
    });

    capturedProps = null;
    const element = await NoteEditorLoader({ user, noteId: "note-1" });
    renderToStaticMarkup(element);

    const props = capturedProps as Record<string, unknown> | null;
    expect(props).not.toBeNull();
    expect("initialEditLock" in (props ?? {})).toBe(false);
  });

  it("re-throws errors that are not NotFoundError", async () => {
    resolveOthers();
    loadNoteDetail.mockRejectedValue(new Error("boom"));

    await expect(NoteEditorLoader({ user, noteId })).rejects.toThrow("boom");
  });
});
