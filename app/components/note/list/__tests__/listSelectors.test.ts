import { describe, expect, it } from "vitest";
import type { SavedViewDTO } from "@/core/application/dto/view";
import type { NoteListSearch } from "../../schema";
import {
  emptySelection,
  groupNotesByDay,
  searchToViewQuery,
  selectionReducer,
  viewQueryEquals,
  viewQueryToSearch,
} from "../listSelectors";

const baseSearch: NoteListSearch = {
  page: 1,
  limit: 20,
};

describe("selectionReducer", () => {
  it("toggles a single id on/off", () => {
    const s1 = selectionReducer(emptySelection, { type: "toggle", id: "a" });
    expect(s1.ids.has("a")).toBe(true);
    const s2 = selectionReducer(s1, { type: "toggle", id: "a" });
    expect(s2.ids.has("a")).toBe(false);
  });

  it("selectMany adds the union without dropping prior ids", () => {
    const s1 = selectionReducer(emptySelection, {
      type: "selectMany",
      ids: ["a", "b"],
    });
    const s2 = selectionReducer(s1, { type: "selectMany", ids: ["b", "c"] });
    expect(s2.ids.size).toBe(3);
    expect(s2.ids.has("a")).toBe(true);
    expect(s2.ids.has("c")).toBe(true);
  });

  it("selectAll replaces the set", () => {
    const s1 = selectionReducer(emptySelection, { type: "toggle", id: "x" });
    const s2 = selectionReducer(s1, { type: "selectAll", ids: ["a", "b"] });
    expect(s2.ids.has("x")).toBe(false);
    expect(s2.ids.size).toBe(2);
  });

  it("clear is a no-op when already empty (referential equality)", () => {
    const next = selectionReducer(emptySelection, { type: "clear" });
    expect(next).toBe(emptySelection);
  });

  it("clear empties an existing selection", () => {
    const s1 = selectionReducer(emptySelection, { type: "toggle", id: "a" });
    const s2 = selectionReducer(s1, { type: "clear" });
    expect(s2.ids.size).toBe(0);
  });
});

describe("groupNotesByDay", () => {
  it("buckets notes by the formatted day in the supplied tz", () => {
    const notes = [
      { id: "1", updatedAt: "2024-01-15T10:00:00Z" },
      { id: "2", updatedAt: "2024-01-15T23:30:00Z" },
      { id: "3", updatedAt: "2024-01-16T01:00:00Z" },
    ];
    const buckets = groupNotesByDay(notes, "UTC");
    expect(buckets).toHaveLength(2);
    expect(buckets[0]?.dateKey).toBe("2024-01-15");
    expect(buckets[0]?.notes).toHaveLength(2);
    expect(buckets[1]?.dateKey).toBe("2024-01-16");
  });

  it("places invalid dates under the `unknown` bucket", () => {
    const buckets = groupNotesByDay(
      [{ id: "x", updatedAt: "not-a-date" }],
      "UTC",
    );
    expect(buckets[0]?.dateKey).toBe("unknown");
  });

  it("returns an empty array for empty input", () => {
    expect(groupNotesByDay([], "UTC")).toEqual([]);
  });
});

describe("searchToViewQuery", () => {
  it("normalises an empty search to defaults", () => {
    const out = searchToViewQuery(baseSearch);
    expect(out.displayMode).toBe("list");
    expect(out.query.tagNames).toEqual([]);
    expect(out.query.directoryId).toBe(null);
    expect(out.query.dateRange).toBe(null);
    expect(out.query.keyword).toBe(null);
    expect(out.query.visibilityFilter).toBeUndefined();
  });

  it("propagates filter fields", () => {
    const out = searchToViewQuery({
      ...baseSearch,
      display: "tile",
      tagNames: ["draft", "idea"],
      directoryId: "dir-1",
      from: "2024-01-01",
      to: "2024-02-01",
      q: "claude",
      visibility: "public",
    });
    expect(out.displayMode).toBe("tile");
    expect(out.query.tagNames).toEqual(["draft", "idea"]);
    expect(out.query.directoryId).toBe("dir-1");
    expect(out.query.dateRange).toEqual({
      from: "2024-01-01",
      to: "2024-02-01",
    });
    expect(out.query.keyword).toBe("claude");
    expect(out.query.visibilityFilter).toEqual(["public"]);
  });

  it("treats an empty `q` as a null keyword", () => {
    const out = searchToViewQuery({ ...baseSearch, q: "   " });
    expect(out.query.keyword).toBe(null);
  });
});

describe("viewQueryToSearch", () => {
  const view: SavedViewDTO = {
    id: "view-1" as unknown as SavedViewDTO["id"],
    ownerId: "user-1" as unknown as SavedViewDTO["ownerId"],
    name: "My view",
    kind: "personal",
    query: {
      directoryId: "dir-1" as unknown as SavedViewDTO["query"]["directoryId"],
      tagIds: ["tag-1", "tag-2"] as unknown as SavedViewDTO["query"]["tagIds"],
      dateRange: {
        from: "2024-01-01T00:00:00.000Z",
        to: "2024-02-01T00:00:00.000Z",
      },
      keyword: "hi",
      referencingNoteId: null,
    },
    displayMode: "calendar",
    calendarDateKey: "updated",
    sort: { by: "updatedAt", direction: "desc" },
    isDefault: false,
    brokenConditions: [],
  };

  it("expands a SavedView back into URL-search fields", () => {
    const out = viewQueryToSearch(view);
    expect(out.display).toBe("calendar");
    expect(out.directoryId).toBe("dir-1");
    expect(out.q).toBe("hi");
    expect(out.from).toBe("2024-01-01");
    expect(out.to).toBe("2024-02-01");
    expect(out.tagNames).toBeUndefined();
  });

  it("resolves tag names when a resolver is supplied", () => {
    const out = viewQueryToSearch(view, (ids) => ids.map((id) => `name-${id}`));
    expect(out.tagNames).toEqual(["name-tag-1", "name-tag-2"]);
  });
});

describe("viewQueryEquals", () => {
  const base = {
    directoryId: null,
    tagIds: [],
    dateRange: null,
    keyword: null,
    referencingNoteId: null,
  } as unknown as SavedViewDTO["query"];

  it("returns true for identical shapes", () => {
    expect(viewQueryEquals(base, base)).toBe(true);
  });

  it("returns false when keyword differs", () => {
    expect(viewQueryEquals(base, { ...base, keyword: "x" })).toBe(false);
  });

  it("returns false when tag id order differs", () => {
    const a = {
      ...base,
      tagIds: ["a", "b"] as unknown as SavedViewDTO["query"]["tagIds"],
    };
    const b = {
      ...base,
      tagIds: ["b", "a"] as unknown as SavedViewDTO["query"]["tagIds"],
    };
    expect(viewQueryEquals(a, b)).toBe(false);
  });

  it("handles null vs non-null date ranges", () => {
    const a = { ...base, dateRange: null };
    const b = { ...base, dateRange: { from: "2024-01-01", to: null } };
    expect(viewQueryEquals(a, b)).toBe(false);
  });
});
