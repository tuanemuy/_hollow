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

  // W-006: selectMany with an empty array still allocates a fresh set
  // (the reducer doesn't fast-path that case) but must preserve every
  // existing id. Documenting the behaviour pins it against accidental
  // regressions in the loop guard.
  it("selectMany([]) preserves existing ids", () => {
    const s1 = selectionReducer(emptySelection, {
      type: "selectMany",
      ids: ["a", "b"],
    });
    const s2 = selectionReducer(s1, { type: "selectMany", ids: [] });
    expect(s2.ids.size).toBe(2);
    expect(s2.ids.has("a")).toBe(true);
    expect(s2.ids.has("b")).toBe(true);
  });

  it("selectMany([]) from empty stays empty", () => {
    const s1 = selectionReducer(emptySelection, {
      type: "selectMany",
      ids: [],
    });
    expect(s1.ids.size).toBe(0);
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

  // W-005: the `tz` argument is the whole reason this helper exists
  // (Workers default to UTC). The cases below pin the timezone shift,
  // contrast it against UTC, and exercise a month rollover so DST-style
  // edge cases stay obvious.
  it("bucketed key follows the supplied tz (Asia/Tokyo shifts late UTC to next day)", () => {
    const notes = [{ id: "1", updatedAt: "2024-01-15T23:30:00Z" }];
    const jst = groupNotesByDay(notes, "Asia/Tokyo");
    expect(jst[0]?.dateKey).toBe("2024-01-16");
  });

  it("Asia/Tokyo and UTC disagree on a late-evening UTC timestamp", () => {
    const notes = [{ id: "1", updatedAt: "2024-01-15T23:30:00Z" }];
    const jst = groupNotesByDay(notes, "Asia/Tokyo");
    const utc = groupNotesByDay(notes, "UTC");
    expect(jst[0]?.dateKey).not.toBe(utc[0]?.dateKey);
    expect(utc[0]?.dateKey).toBe("2024-01-15");
    expect(jst[0]?.dateKey).toBe("2024-01-16");
  });

  it("month rollover: 2024-01-31T23:00:00Z buckets as 2024-02-01 in Asia/Tokyo", () => {
    const notes = [{ id: "1", updatedAt: "2024-01-31T23:00:00Z" }];
    const buckets = groupNotesByDay(notes, "Asia/Tokyo");
    expect(buckets[0]?.dateKey).toBe("2024-02-01");
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
    });
    expect(out.displayMode).toBe("tile");
    expect(out.query.tagNames).toEqual(["draft", "idea"]);
    expect(out.query.directoryId).toBe("dir-1");
    expect(out.query.dateRange).toEqual({
      from: "2024-01-01",
      to: "2024-02-01",
    });
    expect(out.query.keyword).toBe("claude");
  });

  it("treats an empty `q` as a null keyword", () => {
    const out = searchToViewQuery({ ...baseSearch, q: "   " });
    expect(out.query.keyword).toBe(null);
  });

  it("propagates `referencingNoteId` into the saved-view query", () => {
    const out = searchToViewQuery({
      ...baseSearch,
      referencingNoteId: "note-ref-1",
    });
    expect(out.query.referencingNoteId).toBe("note-ref-1");
  });

  it("falls back to null `referencingNoteId` when unset", () => {
    const out = searchToViewQuery(baseSearch);
    expect(out.query.referencingNoteId).toBe(null);
  });

  it("wraps a single URL `visibility` into a 1-element array", () => {
    const out = searchToViewQuery({ ...baseSearch, visibility: "public" });
    expect(out.query.visibilityFilter).toEqual(["public"]);
  });

  it("falls back to an empty `visibilityFilter` when unset", () => {
    const out = searchToViewQuery(baseSearch);
    expect(out.query.visibilityFilter).toEqual([]);
  });

  // W-003: the dateRange branch must engage when *either* bound is
  // present, with the missing side null'd rather than dropped. Without
  // this the SavedView would lose the open-ended interval entirely.
  it("dateRange with only `from` keeps `to` null", () => {
    const out = searchToViewQuery({ ...baseSearch, from: "2024-01-01" });
    expect(out.query.dateRange).toEqual({
      from: "2024-01-01",
      to: null,
    });
  });

  it("dateRange with only `to` keeps `from` null", () => {
    const out = searchToViewQuery({ ...baseSearch, to: "2024-02-01" });
    expect(out.query.dateRange).toEqual({
      from: null,
      to: "2024-02-01",
    });
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
      visibilityFilter: [],
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

  // W-004: every nullable field on the SavedView query is its own
  // branch in `viewQueryToSearch`. We pin the null / partial cases
  // explicitly and assert the resolver-call protocol.
  const emptyView: SavedViewDTO = {
    ...view,
    query: {
      directoryId: null,
      tagIds: [] as unknown as SavedViewDTO["query"]["tagIds"],
      dateRange: null,
      keyword: null,
      referencingNoteId: null,
      visibilityFilter: [],
    },
  };

  it("omits directoryId when the view has none", () => {
    const out = viewQueryToSearch(emptyView);
    expect("directoryId" in out).toBe(false);
  });

  it("omits q when keyword is null", () => {
    const out = viewQueryToSearch(emptyView);
    expect("q" in out).toBe(false);
  });

  it("omits from / to when dateRange is null", () => {
    const out = viewQueryToSearch(emptyView);
    expect("from" in out).toBe(false);
    expect("to" in out).toBe(false);
  });

  it("propagates only `from` when dateRange.to is null", () => {
    const v: SavedViewDTO = {
      ...view,
      query: {
        ...view.query,
        dateRange: { from: "2024-01-01T00:00:00.000Z", to: null },
      },
    };
    const out = viewQueryToSearch(v);
    expect(out.from).toBe("2024-01-01");
    expect("to" in out).toBe(false);
  });

  it("propagates only `to` when dateRange.from is null", () => {
    const v: SavedViewDTO = {
      ...view,
      query: {
        ...view.query,
        dateRange: { from: null, to: "2024-02-01T00:00:00.000Z" },
      },
    };
    const out = viewQueryToSearch(v);
    expect(out.to).toBe("2024-02-01");
    expect("from" in out).toBe(false);
  });

  it("omits tagNames when the resolver returns an empty array", () => {
    const out = viewQueryToSearch(view, () => []);
    expect("tagNames" in out).toBe(false);
  });

  it("does not invoke the resolver when tagIds is empty", () => {
    let calls = 0;
    const out = viewQueryToSearch(emptyView, (ids) => {
      calls += 1;
      return ids.map((id) => `name-${id}`);
    });
    expect(calls).toBe(0);
    expect("tagNames" in out).toBe(false);
  });

  it("restores `referencingNoteId` when the view carries one", () => {
    const v: SavedViewDTO = {
      ...view,
      query: {
        ...view.query,
        referencingNoteId:
          "note-ref-99" as unknown as SavedViewDTO["query"]["referencingNoteId"],
      },
    };
    const out = viewQueryToSearch(v);
    expect(out.referencingNoteId).toBe("note-ref-99");
  });

  it("omits `referencingNoteId` when the view has none", () => {
    const out = viewQueryToSearch(emptyView);
    expect("referencingNoteId" in out).toBe(false);
  });

  it("projects the first `visibilityFilter` entry into the URL `visibility`", () => {
    const v: SavedViewDTO = {
      ...view,
      query: {
        ...view.query,
        visibilityFilter: ["unlisted"],
      },
    };
    const out = viewQueryToSearch(v);
    expect(out.visibility).toBe("unlisted");
  });

  it("omits `visibility` when `visibilityFilter` is empty", () => {
    const out = viewQueryToSearch(emptyView);
    expect("visibility" in out).toBe(false);
  });
});

describe("viewQueryEquals", () => {
  const base = {
    directoryId: null,
    tagIds: [],
    dateRange: null,
    keyword: null,
    referencingNoteId: null,
    visibilityFilter: [],
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

  it("returns false when visibilityFilter length differs", () => {
    const a = {
      ...base,
      visibilityFilter:
        [] as unknown as SavedViewDTO["query"]["visibilityFilter"],
    };
    const b = {
      ...base,
      visibilityFilter: [
        "public",
      ] as unknown as SavedViewDTO["query"]["visibilityFilter"],
    };
    expect(viewQueryEquals(a, b)).toBe(false);
  });

  it("returns false when visibilityFilter values differ", () => {
    const a = {
      ...base,
      visibilityFilter: [
        "public",
      ] as unknown as SavedViewDTO["query"]["visibilityFilter"],
    };
    const b = {
      ...base,
      visibilityFilter: [
        "unlisted",
      ] as unknown as SavedViewDTO["query"]["visibilityFilter"],
    };
    expect(viewQueryEquals(a, b)).toBe(false);
  });
});
