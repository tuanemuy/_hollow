import { describe, expect, it } from "vitest";
import { Note } from "@/core/domain/note/entity";
import { toBacklink } from "../view";

const TS = new Date("2026-02-01T00:00:00.000Z");

const makeNote = (id: string) =>
  Note.reconstruct({
    id,
    ownerId: "0193e7d7-00aa-7000-8000-0000000000aa",
    directoryId: "0193e7d7-00bb-7000-8000-0000000000bb",
    slug: "n-test",
    title: "Referrer",
    contentHtml: "<p>body</p>",
    frontMatter: {},
    tagIds: [],
    internalLinkRefs: [],
    mediaRefs: [],
    sourceFileId: null,
    status: "active",
    trashedAt: null,
    editLock: null,
    version: 0,
    createdAt: TS,
    updatedAt: TS,
  });

describe("toBacklink", () => {
  it("projects directorySegments from the supplied context", () => {
    const note = makeNote("0193e7d7-00cc-7000-8000-0000000000cc");
    const dto = toBacklink(note, {
      snippet: "excerpt",
      directorySegments: [
        { id: "d1", name: "Research" },
        { id: "d2", name: "書籍要約" },
      ],
    });
    expect(dto.directorySegments).toEqual([
      { id: "d1", name: "Research" },
      { id: "d2", name: "書籍要約" },
    ]);
    expect(dto.snippet).toBe("excerpt");
    expect(dto.noteId).toBe("0193e7d7-00cc-7000-8000-0000000000cc");
    expect(dto.title).toBe("Referrer");
  });

  it("projects an empty directorySegments array for a root-level referrer", () => {
    const note = makeNote("0193e7d7-00cd-7000-8000-0000000000cd");
    const dto = toBacklink(note, { snippet: null, directorySegments: [] });
    expect(dto.directorySegments).toEqual([]);
    expect(dto.snippet).toBeNull();
  });
});
