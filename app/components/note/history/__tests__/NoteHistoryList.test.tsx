import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { UserDTO } from "@/core/application/dto/identity";
import { NotFoundError } from "@/core/application/errors";

/**
 * Issue #409: `NoteHistoryList` is rendered as an RSC via
 * `renderServerComponent`, where `throw notFound()` does not reach the route's
 * `notFoundComponent` (now removed). Lock that a non-existent note resolves to
 * the notFound JSX directly (not the generic error boundary), and that
 * unrelated errors are re-thrown unchanged.
 */

const loadNoteDetail = vi.fn();
const loadNoteRevisions = vi.fn();

vi.mock("../../loaders", () => ({
  loadNoteDetail: (...args: unknown[]) => loadNoteDetail(...args),
  loadNoteRevisions: (...args: unknown[]) => loadNoteRevisions(...args),
}));

const { NoteHistoryList } = await import("../NoteHistoryList");

const user = { id: "user-1" } as unknown as UserDTO;
const noteId = "missing-note";

describe("NoteHistoryList notFound handling", () => {
  it("returns the notFound JSX (not the error boundary) for a missing note", async () => {
    loadNoteDetail.mockRejectedValue(
      new NotFoundError("NOTE_NOT_FOUND", "Note not found: missing-note"),
    );
    loadNoteRevisions.mockResolvedValue({ revisions: [], totalCount: 0 });

    const element = await NoteHistoryList({ user, noteId, page: 1, limit: 20 });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('role="alert"');
    expect(html).toContain("ノートが見つかりません");
  });

  it("re-throws errors that are not NotFoundError", async () => {
    loadNoteDetail.mockRejectedValue(new Error("boom"));
    loadNoteRevisions.mockResolvedValue({ revisions: [], totalCount: 0 });

    await expect(
      NoteHistoryList({ user, noteId, page: 1, limit: 20 }),
    ).rejects.toThrow("boom");
  });
});
