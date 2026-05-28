import { describe, expect, it } from "vitest";
import {
  BULK_NOTE_IDS_MAX,
  EXPORT_BULK_LIMIT,
  NOTE_LIST_LIMIT_MAX,
} from "../constants";
import {
  acquireLockSchema,
  bulkExportSchema,
  bulkMoveSchema,
  bulkTrashSchema,
  createNoteSchema,
  deleteNoteSchema,
  duplicateNoteSchema,
  extendLockSchema,
  moveNoteSchema,
  NOTE_BODY_MAX_BYTES,
  NOTE_TITLE_MAX_LENGTH,
  noteListSearchSchema,
  purgeNoteSchema,
  releaseLockSchema,
  renameNoteSchema,
  restoreNoteSchema,
  saveDraftSchema,
  saveNoteSchema,
} from "../schema";

describe("noteListSearchSchema", () => {
  it("accepts an empty object and leaves `page` / `limit` undefined (Issue #215)", () => {
    const parsed = noteListSearchSchema.parse({});
    // Issue #215: `.default(...)` was removed so the schema no longer
    // fills `page` / `limit`. Loaders re-default at the boundary so the
    // URL stays clean for default pagination.
    expect(parsed.page).toBeUndefined();
    expect(parsed.limit).toBeUndefined();
    expect(parsed.display).toBeUndefined();
    expect(parsed.directoryId).toBeUndefined();
    expect(parsed.q).toBeUndefined();
    expect(parsed.viewId).toBeUndefined();
    expect(parsed.visibility).toBeUndefined();
    expect(parsed.tagNames).toBeUndefined();
    expect(parsed.from).toBeUndefined();
    expect(parsed.to).toBeUndefined();
  });

  it("survives partial Link search targets — unrelated invalid fields fall back via .catch(undefined)", () => {
    const parsed = noteListSearchSchema.parse({
      directoryId: "dir-1",
      display: "not-a-mode",
      visibility: "bogus",
      tagNames: ["ok", ""],
      from: "not-a-date",
      to: "2024-13-40",
      page: "abc",
      limit: "abc",
    });
    expect(parsed.directoryId).toBe("dir-1");
    expect(parsed.display).toBeUndefined();
    expect(parsed.visibility).toBeUndefined();
    expect(parsed.tagNames).toBeUndefined();
    expect(parsed.from).toBeUndefined();
    expect(parsed.to).toBeUndefined();
    expect(parsed.page).toBeUndefined();
    expect(parsed.limit).toBeUndefined();
  });

  it("accepts each allowed `display` mode", () => {
    for (const display of ["list", "tile", "calendar"] as const) {
      const parsed = noteListSearchSchema.parse({ display });
      expect(parsed.display).toBe(display);
    }
  });

  it("accepts each allowed `visibility` value", () => {
    for (const visibility of ["private", "unlisted", "public"] as const) {
      const parsed = noteListSearchSchema.parse({ visibility });
      expect(parsed.visibility).toBe(visibility);
    }
  });

  it("coerces numeric strings for `page` / `limit`", () => {
    const parsed = noteListSearchSchema.parse({ page: "3", limit: "50" });
    expect(parsed.page).toBe(3);
    expect(parsed.limit).toBe(50);
  });

  it("falls back to undefined when `limit` exceeds the cap (Issue #215)", () => {
    const parsed = noteListSearchSchema.parse({
      limit: NOTE_LIST_LIMIT_MAX + 1,
    });
    expect(parsed.limit).toBeUndefined();
  });

  it("falls back to undefined when `page` is zero or negative (Issue #215)", () => {
    expect(noteListSearchSchema.parse({ page: 0 }).page).toBeUndefined();
    expect(noteListSearchSchema.parse({ page: -5 }).page).toBeUndefined();
  });

  it("drops empty-string `tagNames` entries via .catch(undefined)", () => {
    const parsed = noteListSearchSchema.parse({ tagNames: [""] });
    expect(parsed.tagNames).toBeUndefined();
  });

  it("rejects empty-string `directoryId` via .catch(undefined)", () => {
    const parsed = noteListSearchSchema.parse({ directoryId: "" });
    expect(parsed.directoryId).toBeUndefined();
  });

  it("rejects empty-string `viewId` via .catch(undefined)", () => {
    const parsed = noteListSearchSchema.parse({ viewId: "" });
    expect(parsed.viewId).toBeUndefined();
  });

  it("accepts a non-empty `referencingNoteId`", () => {
    const parsed = noteListSearchSchema.parse({
      referencingNoteId: "note-abc",
    });
    expect(parsed.referencingNoteId).toBe("note-abc");
  });

  it("rejects empty-string `referencingNoteId` via .catch(undefined)", () => {
    const parsed = noteListSearchSchema.parse({ referencingNoteId: "" });
    expect(parsed.referencingNoteId).toBeUndefined();
  });

  it("falls back to undefined when `referencingNoteId` is not a string", () => {
    const parsed = noteListSearchSchema.parse({
      referencingNoteId: 123 as never,
    });
    expect(parsed.referencingNoteId).toBeUndefined();
  });
});

describe("bulkMoveSchema", () => {
  it("requires at least one noteId", () => {
    expect(() =>
      bulkMoveSchema.parse({ noteIds: [], newDirectoryId: "dir-1" }),
    ).toThrow();
  });

  it("accepts exactly BULK_NOTE_IDS_MAX ids", () => {
    const noteIds = Array.from(
      { length: BULK_NOTE_IDS_MAX },
      (_, i) => `n${i}`,
    );
    const parsed = bulkMoveSchema.parse({ noteIds, newDirectoryId: "dir-1" });
    expect(parsed.noteIds).toHaveLength(BULK_NOTE_IDS_MAX);
  });

  it("rejects more than BULK_NOTE_IDS_MAX ids", () => {
    const noteIds = Array.from(
      { length: BULK_NOTE_IDS_MAX + 1 },
      (_, i) => `n${i}`,
    );
    expect(() =>
      bulkMoveSchema.parse({ noteIds, newDirectoryId: "dir-1" }),
    ).toThrow();
  });

  it("rejects empty-string note ids", () => {
    expect(() =>
      bulkMoveSchema.parse({ noteIds: [""], newDirectoryId: "dir-1" }),
    ).toThrow();
  });

  it("requires a non-empty newDirectoryId", () => {
    expect(() =>
      bulkMoveSchema.parse({ noteIds: ["n1"], newDirectoryId: "" }),
    ).toThrow();
  });
});

describe("bulkTrashSchema", () => {
  it("accepts exactly BULK_NOTE_IDS_MAX ids", () => {
    const noteIds = Array.from(
      { length: BULK_NOTE_IDS_MAX },
      (_, i) => `n${i}`,
    );
    expect(() => bulkTrashSchema.parse({ noteIds })).not.toThrow();
  });

  it("rejects more than BULK_NOTE_IDS_MAX ids", () => {
    const noteIds = Array.from(
      { length: BULK_NOTE_IDS_MAX + 1 },
      (_, i) => `n${i}`,
    );
    expect(() => bulkTrashSchema.parse({ noteIds })).toThrow();
  });

  it("rejects empty arrays", () => {
    expect(() => bulkTrashSchema.parse({ noteIds: [] })).toThrow();
  });
});

describe("bulkExportSchema", () => {
  it("accepts exactly EXPORT_BULK_LIMIT ids", () => {
    const noteIds = Array.from(
      { length: EXPORT_BULK_LIMIT },
      (_, i) => `n${i}`,
    );
    expect(() =>
      bulkExportSchema.parse({
        noteIds,
        format: "html",
        options: {
          includeFrontMatter: true,
          embedMedia: false,
          pdfPaperSize: null,
        },
      }),
    ).not.toThrow();
  });

  it("rejects more than EXPORT_BULK_LIMIT ids", () => {
    const noteIds = Array.from(
      { length: EXPORT_BULK_LIMIT + 1 },
      (_, i) => `n${i}`,
    );
    expect(() =>
      bulkExportSchema.parse({
        noteIds,
        format: "html",
        options: {
          includeFrontMatter: true,
          embedMedia: false,
          pdfPaperSize: null,
        },
      }),
    ).toThrow();
  });

  it("requires pdfPaperSize when format is pdf", () => {
    expect(() =>
      bulkExportSchema.parse({
        noteIds: ["n1"],
        format: "pdf",
        options: {
          includeFrontMatter: true,
          embedMedia: false,
          pdfPaperSize: null,
        },
      }),
    ).toThrow();
  });

  it("accepts pdf format when pdfPaperSize is supplied", () => {
    expect(() =>
      bulkExportSchema.parse({
        noteIds: ["n1"],
        format: "pdf",
        options: {
          includeFrontMatter: true,
          embedMedia: false,
          pdfPaperSize: "A4",
        },
      }),
    ).not.toThrow();
  });

  it("accepts non-pdf formats with null pdfPaperSize", () => {
    for (const format of ["html", "markdown"] as const) {
      expect(() =>
        bulkExportSchema.parse({
          noteIds: ["n1"],
          format,
          options: {
            includeFrontMatter: true,
            embedMedia: false,
            pdfPaperSize: null,
          },
        }),
      ).not.toThrow();
    }
  });

  it("rejects unknown export formats", () => {
    expect(() =>
      bulkExportSchema.parse({
        noteIds: ["n1"],
        format: "docx" as never,
        options: {
          includeFrontMatter: true,
          embedMedia: false,
          pdfPaperSize: null,
        },
      }),
    ).toThrow();
  });
});

describe("saveDraftSchema", () => {
  it("requires noteId", () => {
    expect(() => saveDraftSchema.parse({})).toThrow();
  });

  it("rejects empty-string noteId", () => {
    expect(() => saveDraftSchema.parse({ noteId: "" })).toThrow();
  });

  it("accepts noteId alone (all other fields optional)", () => {
    const parsed = saveDraftSchema.parse({ noteId: "n1" });
    expect(parsed.noteId).toBe("n1");
    expect(parsed.title).toBeUndefined();
    expect(parsed.contentHtml).toBeUndefined();
    expect(parsed.frontMatterJson).toBeUndefined();
    expect(parsed.tagNames).toBeUndefined();
  });

  it("trims leading/trailing whitespace on `title`", () => {
    const parsed = saveDraftSchema.parse({ noteId: "n1", title: "  hi  " });
    expect(parsed.title).toBe("hi");
  });

  it("rejects title beyond NOTE_TITLE_MAX_LENGTH", () => {
    const title = "a".repeat(NOTE_TITLE_MAX_LENGTH + 1);
    expect(() => saveDraftSchema.parse({ noteId: "n1", title })).toThrow();
  });

  it("accepts title exactly NOTE_TITLE_MAX_LENGTH long", () => {
    const title = "a".repeat(NOTE_TITLE_MAX_LENGTH);
    expect(() => saveDraftSchema.parse({ noteId: "n1", title })).not.toThrow();
  });

  it("rejects contentHtml beyond NOTE_BODY_MAX_BYTES", () => {
    const contentHtml = "a".repeat(NOTE_BODY_MAX_BYTES + 1);
    expect(() =>
      saveDraftSchema.parse({ noteId: "n1", contentHtml }),
    ).toThrow();
  });

  it("trims tagNames entries and rejects empty-after-trim", () => {
    const parsed = saveDraftSchema.parse({
      noteId: "n1",
      tagNames: ["  draft  ", " idea "],
    });
    expect(parsed.tagNames).toEqual(["draft", "idea"]);
    expect(() =>
      saveDraftSchema.parse({ noteId: "n1", tagNames: ["   "] }),
    ).toThrow();
  });
});

describe("createNoteSchema", () => {
  it("applies defaults across the board", () => {
    const parsed = createNoteSchema.parse({});
    expect(parsed.title).toBe("");
    expect(parsed.contentHtml).toBe("");
    expect(parsed.directoryId).toBe(null);
    expect(parsed.tagNames).toEqual([]);
    expect(parsed.frontMatterJson).toBeUndefined();
  });

  it("accepts an explicit null directoryId", () => {
    const parsed = createNoteSchema.parse({ directoryId: null });
    expect(parsed.directoryId).toBe(null);
  });

  it("rejects empty-string directoryId (must be null or non-empty)", () => {
    expect(() => createNoteSchema.parse({ directoryId: "" })).toThrow();
  });

  it("trims `title` and accepts trimmed-empty as default", () => {
    const parsed = createNoteSchema.parse({ title: "   hello   " });
    expect(parsed.title).toBe("hello");
  });

  it("rejects tagNames containing an empty-after-trim entry", () => {
    expect(() =>
      createNoteSchema.parse({ tagNames: ["draft", "   "] }),
    ).toThrow();
  });

  it("rejects oversized frontMatterJson", () => {
    const frontMatterJson = "a".repeat(64 * 1024 + 1);
    expect(() => createNoteSchema.parse({ frontMatterJson })).toThrow();
  });
});

describe("saveNoteSchema", () => {
  it("requires noteId", () => {
    expect(() => saveNoteSchema.parse({})).toThrow();
  });

  it("rejects empty noteId", () => {
    expect(() => saveNoteSchema.parse({ noteId: "" })).toThrow();
  });

  it("accepts a noteId alone", () => {
    const parsed = saveNoteSchema.parse({ noteId: "n1" });
    expect(parsed.noteId).toBe("n1");
  });
});

describe("simple noteId-only schemas", () => {
  const schemas = [
    ["deleteNoteSchema", deleteNoteSchema],
    ["purgeNoteSchema", purgeNoteSchema],
    ["duplicateNoteSchema", duplicateNoteSchema],
    ["acquireLockSchema", acquireLockSchema],
    ["extendLockSchema", extendLockSchema],
    ["releaseLockSchema", releaseLockSchema],
  ] as const;

  for (const [name, schema] of schemas) {
    it(`${name} requires a non-empty noteId`, () => {
      expect(() => schema.parse({})).toThrow();
      expect(() => schema.parse({ noteId: "" })).toThrow();
      const parsed = schema.parse({ noteId: "n1" });
      expect(parsed.noteId).toBe("n1");
    });
  }
});

describe("renameNoteSchema", () => {
  it("requires a non-empty newTitle", () => {
    expect(() =>
      renameNoteSchema.parse({ noteId: "n1", newTitle: "" }),
    ).toThrow();
    expect(() =>
      renameNoteSchema.parse({ noteId: "n1", newTitle: "   " }),
    ).toThrow();
  });

  it("defaults regenerateSlug to false", () => {
    const parsed = renameNoteSchema.parse({ noteId: "n1", newTitle: "Hi" });
    expect(parsed.regenerateSlug).toBe(false);
  });

  it("rejects newTitle beyond NOTE_TITLE_MAX_LENGTH", () => {
    const newTitle = "a".repeat(NOTE_TITLE_MAX_LENGTH + 1);
    expect(() => renameNoteSchema.parse({ noteId: "n1", newTitle })).toThrow();
  });
});

describe("moveNoteSchema", () => {
  it("requires a non-empty newDirectoryId (no null allowed)", () => {
    expect(() =>
      moveNoteSchema.parse({ noteId: "n1", newDirectoryId: "" }),
    ).toThrow();
    expect(() =>
      moveNoteSchema.parse({ noteId: "n1", newDirectoryId: null as never }),
    ).toThrow();
  });

  it("accepts a non-empty newDirectoryId", () => {
    const parsed = moveNoteSchema.parse({
      noteId: "n1",
      newDirectoryId: "dir-1",
    });
    expect(parsed.newDirectoryId).toBe("dir-1");
  });
});

describe("restoreNoteSchema", () => {
  it("defaults restoreDirectoryId to null", () => {
    const parsed = restoreNoteSchema.parse({ noteId: "n1" });
    expect(parsed.restoreDirectoryId).toBe(null);
  });

  it("accepts an explicit null restoreDirectoryId", () => {
    const parsed = restoreNoteSchema.parse({
      noteId: "n1",
      restoreDirectoryId: null,
    });
    expect(parsed.restoreDirectoryId).toBe(null);
  });

  it("rejects empty-string restoreDirectoryId", () => {
    expect(() =>
      restoreNoteSchema.parse({ noteId: "n1", restoreDirectoryId: "" }),
    ).toThrow();
  });
});
