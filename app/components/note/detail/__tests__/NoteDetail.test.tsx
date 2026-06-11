import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { UserDTO } from "@/core/application/dto/identity";
import { NotFoundError } from "@/core/application/errors";

/**
 * Issue #385: `NoteDetail` is rendered as an RSC via `renderServerComponent`,
 * where `throw notFound()` does not reach the route's `notFoundComponent`.
 * Lock that a non-existent note resolves to the notFound JSX directly (not the
 * generic error boundary), and that unrelated errors are re-thrown unchanged.
 */

const loadNoteDetail = vi.fn();
const loadPublishStateForNote = vi.fn();
const loadDirectoryTreeFlat = vi.fn();
const loadAllTags = vi.fn();

vi.mock("../../loaders", () => ({
  loadNoteDetail: (...args: unknown[]) => loadNoteDetail(...args),
  loadPublishStateForNote: (...args: unknown[]) =>
    loadPublishStateForNote(...args),
  loadDirectoryTreeFlat: (...args: unknown[]) => loadDirectoryTreeFlat(...args),
  loadAllTags: (...args: unknown[]) => loadAllTags(...args),
}));

vi.mock("../FrontMatterPanel", () => ({ FrontMatterPanel: () => null }));
vi.mock("../NoteActions", () => ({ NoteActions: () => null }));
vi.mock("../NoteBreadcrumb", () => ({ NoteBreadcrumb: () => null }));
vi.mock("../NoteMetaPanel", () => ({ NoteMetaPanel: () => null }));

// `NoteDetail` is a sync shell (Suspense + error boundary); the
// notFound / re-throw behaviour under test lives in the async
// `NoteDetailContent` section.
const { NoteDetailContent } = await import("../NoteDetail");

const user = { id: "user-1" } as unknown as UserDTO;
const noteId = "missing-note";

function resolveOthers() {
  loadPublishStateForNote.mockResolvedValue({
    visibility: "private",
    publishedAt: null,
    links: [],
  });
  loadDirectoryTreeFlat.mockResolvedValue({ flat: [] });
  loadAllTags.mockResolvedValue({ byId: new Map() });
}

describe("NoteDetail notFound handling", () => {
  it("returns the notFound JSX (not the error boundary) for a missing note", async () => {
    resolveOthers();
    loadNoteDetail.mockRejectedValue(
      new NotFoundError("NOTE_NOT_FOUND", "Note not found: missing-note"),
    );

    const element = await NoteDetailContent({
      user,
      noteId,
      appUrl: "https://example.test",
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('role="alert"');
    expect(html).toContain("ノートが見つかりません");
  });

  it("re-throws errors that are not NotFoundError", async () => {
    resolveOthers();
    loadNoteDetail.mockRejectedValue(new Error("boom"));

    await expect(
      NoteDetailContent({ user, noteId, appUrl: "https://example.test" }),
    ).rejects.toThrow("boom");
  });
});
