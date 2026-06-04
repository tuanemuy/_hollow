import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { UserDTO } from "@/core/application/dto/identity";
import { NotFoundError } from "@/core/application/errors";

/**
 * Issue #409: `NoteRevisionDetail` is rendered as an RSC via
 * `renderServerComponent`, where `throw notFound()` does not reach the route's
 * `notFoundComponent` (now removed). Lock that a non-existent revision resolves
 * to the notFound JSX directly (not the generic error boundary), and that
 * unrelated errors are re-thrown unchanged.
 */

const loadNoteRevisionDetail = vi.fn();

vi.mock("../../loaders", () => ({
  loadNoteRevisionDetail: (...args: unknown[]) =>
    loadNoteRevisionDetail(...args),
}));

vi.mock("../NoteRevisionRestorePanel", () => ({
  NoteRevisionRestorePanel: () => null,
}));

const { NoteRevisionDetail } = await import("../NoteRevisionDetail");

const user = { id: "user-1" } as unknown as UserDTO;
const noteId = "note-1";
const revisionId = "missing-revision";

describe("NoteRevisionDetail notFound handling", () => {
  it("returns the notFound JSX (not the error boundary) for a missing revision", async () => {
    loadNoteRevisionDetail.mockRejectedValue(
      new NotFoundError(
        "NOTE_REVISION_NOT_FOUND",
        "Note revision not found: missing-revision",
      ),
    );

    const element = await NoteRevisionDetail({ user, noteId, revisionId });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('role="alert"');
    expect(html).toContain("過去版が見つかりません");
  });

  it("re-throws errors that are not NotFoundError", async () => {
    loadNoteRevisionDetail.mockRejectedValue(new Error("boom"));

    await expect(
      NoteRevisionDetail({ user, noteId, revisionId }),
    ).rejects.toThrow("boom");
  });
});
