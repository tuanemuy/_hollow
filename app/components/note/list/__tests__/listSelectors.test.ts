import { describe, expect, it } from "vitest";
import type { SavedViewDTO } from "@/core/application/dto/view";
import type { NoteListSearch } from "../../schema";
import {
  emptySelection,
  formatDateRangeChipLabel,
  formatReferencingNoteChipLabel,
  groupNotesByDay,
  hasAnyHomeFilter,
  homeHeadingText,
  homeSectionResetKey,
  isSearchActive,
  matchDateRangePreset,
  resolveDateRangePreset,
  resolveViewName,
  searchToViewQuery,
  selectDisplay,
  selectionReducer,
  shouldRedirectForSavedView,
  viewQueryEquals,
  viewQueryToSearch,
  viewSwitcherAriaLabel,
} from "../listSelectors";
import { visibilityLabel, visibilitySwatchClass } from "../styles";

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

  // Issue #354: explicit selection mode. The flag lives alongside the ids
  // so "leave mode" and "clear selection" are a single atomic transition.
  it("starts with selection mode off", () => {
    expect(emptySelection.mode).toBe(false);
  });

  it("enterSelectMode turns the flag on and preserves ids", () => {
    const s1 = selectionReducer(emptySelection, { type: "toggle", id: "a" });
    const s2 = selectionReducer(s1, { type: "enterSelectMode" });
    expect(s2.mode).toBe(true);
    expect(s2.ids.has("a")).toBe(true);
  });

  it("enterSelectMode is a no-op when already on (referential equality)", () => {
    const s1 = selectionReducer(emptySelection, { type: "enterSelectMode" });
    const s2 = selectionReducer(s1, { type: "enterSelectMode" });
    expect(s2).toBe(s1);
  });

  it("exitSelectMode turns the flag off and clears the selection", () => {
    const s1 = selectionReducer(emptySelection, { type: "enterSelectMode" });
    const s2 = selectionReducer(s1, { type: "toggle", id: "a" });
    expect(s2.mode).toBe(true);
    expect(s2.ids.size).toBe(1);
    const s3 = selectionReducer(s2, { type: "exitSelectMode" });
    expect(s3.mode).toBe(false);
    expect(s3.ids.size).toBe(0);
  });

  it("toggleSelectMode flips on then clears back off", () => {
    const s1 = selectionReducer(emptySelection, { type: "toggleSelectMode" });
    expect(s1.mode).toBe(true);
    const s2 = selectionReducer(s1, { type: "toggle", id: "a" });
    const s3 = selectionReducer(s2, { type: "toggleSelectMode" });
    expect(s3.mode).toBe(false);
    expect(s3.ids.size).toBe(0);
  });

  it("clear preserves selection mode", () => {
    const s1 = selectionReducer(emptySelection, { type: "enterSelectMode" });
    const s2 = selectionReducer(s1, { type: "toggle", id: "a" });
    const s3 = selectionReducer(s2, { type: "clear" });
    expect(s3.mode).toBe(true);
    expect(s3.ids.size).toBe(0);
  });

  it("toggle / selectMany / selectAll preserve the current mode", () => {
    const on = selectionReducer(emptySelection, { type: "enterSelectMode" });
    expect(selectionReducer(on, { type: "toggle", id: "a" }).mode).toBe(true);
    expect(selectionReducer(on, { type: "selectMany", ids: ["a"] }).mode).toBe(
      true,
    );
    expect(selectionReducer(on, { type: "selectAll", ids: ["a"] }).mode).toBe(
      true,
    );
  });

  // #635 ADR-002: `pendingBulk` lives alongside the ids so a bulk trash can
  // dim the selected rows for the transition's duration. The cases below pin
  // the setter, its no-op fast path, and preservation across every action.
  it("starts with pendingBulk off", () => {
    expect(emptySelection.pendingBulk).toBe(false);
  });

  it("setPendingBulk reflects true then false", () => {
    const s1 = selectionReducer(emptySelection, {
      type: "setPendingBulk",
      value: true,
    });
    expect(s1.pendingBulk).toBe(true);
    const s2 = selectionReducer(s1, { type: "setPendingBulk", value: false });
    expect(s2.pendingBulk).toBe(false);
  });

  it("setPendingBulk is a no-op when the value is unchanged (referential equality)", () => {
    const s1 = selectionReducer(emptySelection, {
      type: "setPendingBulk",
      value: true,
    });
    const s2 = selectionReducer(s1, { type: "setPendingBulk", value: true });
    expect(s2).toBe(s1);
    const s3 = selectionReducer(emptySelection, {
      type: "setPendingBulk",
      value: false,
    });
    expect(s3).toBe(emptySelection);
  });

  it("toggle / clear / enterSelectMode preserve pendingBulk", () => {
    const pending = selectionReducer(emptySelection, {
      type: "setPendingBulk",
      value: true,
    });
    expect(
      selectionReducer(pending, { type: "toggle", id: "a" }).pendingBulk,
    ).toBe(true);
    const withId = selectionReducer(pending, { type: "toggle", id: "a" });
    expect(selectionReducer(withId, { type: "clear" }).pendingBulk).toBe(true);
    expect(
      selectionReducer(pending, { type: "enterSelectMode" }).pendingBulk,
    ).toBe(true);
  });

  it("exitSelectMode resets even when only pendingBulk is set (mode/ids empty)", () => {
    const pending = selectionReducer(emptySelection, {
      type: "setPendingBulk",
      value: true,
    });
    const next = selectionReducer(pending, { type: "exitSelectMode" });
    expect(next).toBe(emptySelection);
    expect(next.pendingBulk).toBe(false);
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

  // ADR-002 documents that URL schema carries a single `visibility` enum
  // while the SavedView VO can hold multiple. When a view holds multiple
  // visibility values (e.g. via direct API), the selector projects the
  // first value into the URL and drops the rest. Pin this behavior so a
  // future change to URL-multi-select doesn't silently regress it.
  it("projects only the first `visibilityFilter` entry when the view carries multiple", () => {
    const v: SavedViewDTO = {
      ...view,
      query: {
        ...view.query,
        visibilityFilter: ["public", "unlisted"],
      },
    };
    const out = viewQueryToSearch(v);
    expect(out.visibility).toBe("public");
  });
});

describe("formatReferencingNoteChipLabel", () => {
  const id = "0123456789abcdef0123456789abcdef";

  it("returns the title when one is supplied", () => {
    expect(formatReferencingNoteChipLabel(id, "My Note")).toBe("My Note");
  });

  it("falls back to the first 8 id chars when title is null", () => {
    expect(formatReferencingNoteChipLabel(id, null)).toBe("01234567");
  });

  it("falls back to the first 8 id chars when title is empty", () => {
    expect(formatReferencingNoteChipLabel(id, "")).toBe("01234567");
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

describe("selectDisplay", () => {
  it("returns the explicit display mode when set", () => {
    expect(selectDisplay({ display: "tile" })).toBe("tile");
    expect(selectDisplay({ display: "calendar" })).toBe("calendar");
    expect(selectDisplay({ display: "list" })).toBe("list");
  });

  it("falls back to 'list' when display is undefined", () => {
    expect(selectDisplay({})).toBe("list");
    expect(selectDisplay({ display: undefined })).toBe("list");
  });
});

describe("shouldRedirectForSavedView", () => {
  // Issue #219 ADR-002: redirect must fire only when restoring a
  // SavedView and the URL does not already pin a display. The four
  // branches below cover the explicit invariants of the predicate;
  // breaking any of them risks either a redirect loop or an
  // unintentional override of a manual user switch.

  const view = { displayMode: "tile" as const };

  it("returns true when viewId is present, display is absent, and the view was resolved", () => {
    expect(shouldRedirectForSavedView({ search: { viewId: "v1" }, view })).toBe(
      true,
    );
  });

  it("returns false when the user already pinned a display", () => {
    expect(
      shouldRedirectForSavedView({
        search: { viewId: "v1", display: "list" },
        view,
      }),
    ).toBe(false);
  });

  it("returns false when the SavedView could not be resolved", () => {
    expect(
      shouldRedirectForSavedView({ search: { viewId: "v1" }, view: null }),
    ).toBe(false);
  });

  it("returns false when there is no viewId in the URL", () => {
    expect(shouldRedirectForSavedView({ search: {}, view })).toBe(false);
  });
});

// Issue #476: date-range presets are computed client-side from an injected
// base date so the conversion is deterministic and React-agnostic. Local
// calendar arithmetic must never shift the day due to a UTC offset.
describe("resolveDateRangePreset", () => {
  // 2026-06-15 is a Monday → easy to reason about week boundaries.
  const monday = new Date(2026, 5, 15);

  it("today: from === to === base date", () => {
    expect(resolveDateRangePreset("today", new Date(2026, 5, 15))).toEqual({
      from: "2026-06-15",
      to: "2026-06-15",
    });
  });

  it("thisWeek: Monday..Sunday when base is the Monday", () => {
    expect(resolveDateRangePreset("thisWeek", monday)).toEqual({
      from: "2026-06-15",
      to: "2026-06-21",
    });
  });

  it("thisWeek: Monday..Sunday when base is mid-week (Wed)", () => {
    expect(resolveDateRangePreset("thisWeek", new Date(2026, 5, 17))).toEqual({
      from: "2026-06-15",
      to: "2026-06-21",
    });
  });

  it("thisWeek: Monday..Sunday when base is the Sunday (week end)", () => {
    expect(resolveDateRangePreset("thisWeek", new Date(2026, 5, 21))).toEqual({
      from: "2026-06-15",
      to: "2026-06-21",
    });
  });

  it("thisWeek: spans a month boundary", () => {
    // 2026-07-01 is a Wednesday; its week starts Mon 2026-06-29.
    expect(resolveDateRangePreset("thisWeek", new Date(2026, 6, 1))).toEqual({
      from: "2026-06-29",
      to: "2026-07-05",
    });
  });

  it("thisMonth: first..last day of the month", () => {
    expect(resolveDateRangePreset("thisMonth", new Date(2026, 5, 15))).toEqual({
      from: "2026-06-01",
      to: "2026-06-30",
    });
  });

  it("thisMonth: February of a leap year ends on the 29th", () => {
    expect(resolveDateRangePreset("thisMonth", new Date(2024, 1, 10))).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
  });

  it("last30: base − 29 days .. base (inclusive 30 days)", () => {
    expect(resolveDateRangePreset("last30", new Date(2026, 5, 15))).toEqual({
      from: "2026-05-17",
      to: "2026-06-15",
    });
  });

  it("last30: crosses a year boundary", () => {
    expect(resolveDateRangePreset("last30", new Date(2026, 0, 10))).toEqual({
      from: "2025-12-12",
      to: "2026-01-10",
    });
  });

  it("last90: base − 89 days .. base (inclusive 90 days)", () => {
    expect(resolveDateRangePreset("last90", new Date(2026, 5, 15))).toEqual({
      from: "2026-03-18",
      to: "2026-06-15",
    });
  });

  it("thisYear: Jan 1 .. base date", () => {
    expect(resolveDateRangePreset("thisYear", new Date(2026, 5, 15))).toEqual({
      from: "2026-01-01",
      to: "2026-06-15",
    });
  });

  it("zero-pads single-digit months and days", () => {
    expect(resolveDateRangePreset("today", new Date(2026, 0, 3))).toEqual({
      from: "2026-01-03",
      to: "2026-01-03",
    });
  });
});

describe("matchDateRangePreset", () => {
  const base = new Date(2026, 5, 15);

  it("returns the matching preset for a from/to that lines up", () => {
    expect(matchDateRangePreset("2026-06-01", "2026-06-30", base)).toBe(
      "thisMonth",
    );
  });

  it("returns null for a manual range that matches no preset", () => {
    expect(matchDateRangePreset("2026-06-02", "2026-06-09", base)).toBe(null);
  });

  it("returns null when either bound is missing", () => {
    expect(matchDateRangePreset("2026-06-15", undefined, base)).toBe(null);
    expect(matchDateRangePreset(undefined, "2026-06-15", base)).toBe(null);
    expect(matchDateRangePreset(undefined, undefined, base)).toBe(null);
  });
});

describe("formatDateRangeChipLabel", () => {
  it("formats both bounds with stripped leading zeros", () => {
    expect(formatDateRangeChipLabel("2026-06-01", "2026-06-30")).toBe(
      "6/1–6/30",
    );
  });

  it("renders an open-ended start as …", () => {
    expect(formatDateRangeChipLabel(undefined, "2026-06-30")).toBe("…–6/30");
  });

  it("renders an open-ended end as …", () => {
    expect(formatDateRangeChipLabel("2026-06-01", undefined)).toBe("6/1–…");
  });

  it("returns null when neither bound is set", () => {
    expect(formatDateRangeChipLabel(undefined, undefined)).toBe(null);
  });

  // The URL schema (`z.string().date()`) guarantees a `YYYY-MM-DD` shape, but
  // pin the defensive fallback so a malformed bound renders verbatim rather
  // than as a garbage `0/0`.
  it("passes a malformed bound through unchanged", () => {
    expect(formatDateRangeChipLabel("not-a-date", "2026-06-30")).toBe(
      "not-a-date–6/30",
    );
    expect(formatDateRangeChipLabel("2026-06", undefined)).toBe("2026-06–…");
  });
});

// Issue #476: the 公開状態 popover adds an "all" (解除) option, so the label
// helper widens to `Visibility | "all"`.
describe("visibilityLabel", () => {
  it("labels each visibility plus the 'all' reset option", () => {
    expect(visibilityLabel("all")).toBe("すべて");
    expect(visibilityLabel("private")).toBe("非公開");
    expect(visibilityLabel("unlisted")).toBe("限定公開");
    expect(visibilityLabel("public")).toBe("公開");
  });
});

describe("visibilitySwatchClass", () => {
  it("maps each option to its status color (all/private share ink-tertiary)", () => {
    expect(visibilitySwatchClass("public")).toBe("bg-success");
    expect(visibilitySwatchClass("unlisted")).toBe("bg-warning");
    expect(visibilitySwatchClass("private")).toBe("bg-ink-tertiary");
    expect(visibilitySwatchClass("all")).toBe("bg-ink-tertiary");
  });
});

describe("home heading / filter selectors (#636 TS-W-002)", () => {
  it("isSearchActive is false for undefined / empty / whitespace-only q", () => {
    expect(isSearchActive(undefined)).toBe(false);
    expect(isSearchActive("")).toBe(false);
    expect(isSearchActive("   ")).toBe(false);
    expect(isSearchActive("\t\n")).toBe(false);
  });

  it("isSearchActive is true for a non-blank q", () => {
    expect(isSearchActive("memo")).toBe(true);
    expect(isSearchActive(" memo ")).toBe(true);
  });

  it("homeHeadingText switches between search results and all notes", () => {
    expect(homeHeadingText("memo")).toBe("「memo」の検索結果");
    expect(homeHeadingText(undefined)).toBe("すべてのノート");
    expect(homeHeadingText("   ")).toBe("すべてのノート");
  });

  it("homeHeadingText shows the view name, but search wins over it (ADR-005)", () => {
    expect(homeHeadingText(undefined, "今週のレビュー")).toBe("今週のレビュー");
    expect(homeHeadingText("memo", "今週のレビュー")).toBe(
      "「memo」の検索結果",
    );
  });

  it("resolveViewName resolves the id and falls back to すべてのノート", () => {
    const views = [
      { id: "v1", name: "今週のレビュー" },
      { id: "v2", name: "未公開の下書き" },
    ];
    expect(resolveViewName("v2", views)).toBe("未公開の下書き");
    expect(resolveViewName(undefined, views)).toBe("すべてのノート");
    // Deleted / foreign id never blanks the heading.
    expect(resolveViewName("gone", views)).toBe("すべてのノート");
  });

  it("viewSwitcherAriaLabel composes per the ADR-005 rule (label-in-name)", () => {
    // The visible heading text leads (WCAG 2.5.3 — the accessible name must
    // contain the visible label); the action follows after the dash.
    expect(viewSwitcherAriaLabel(undefined, "今週のレビュー")).toBe(
      "今週のレビュー — ビューを切り替え",
    );
    expect(viewSwitcherAriaLabel(undefined)).toBe(
      "すべてのノート — ビューを切り替え",
    );
    // While searching the heading shows the search phrasing — the label
    // contains it verbatim instead of the (contradicting)「現在 {ビュー名}」.
    expect(viewSwitcherAriaLabel("memo", "今週のレビュー")).toBe(
      "「memo」の検索結果 — ビューを切り替え",
    );
  });

  it("hasAnyHomeFilter is false when only q / page / limit are set", () => {
    expect(hasAnyHomeFilter({ ...baseSearch, q: "memo" })).toBe(false);
  });

  it("hasAnyHomeFilter detects each non-query filter", () => {
    expect(hasAnyHomeFilter({ ...baseSearch, tagNames: ["t"] })).toBe(true);
    expect(hasAnyHomeFilter({ ...baseSearch, tagNames: [] })).toBe(false);
    expect(hasAnyHomeFilter({ ...baseSearch, from: "2026-01-01" })).toBe(true);
    expect(hasAnyHomeFilter({ ...baseSearch, to: "2026-01-31" })).toBe(true);
    expect(hasAnyHomeFilter({ ...baseSearch, directoryId: "d1" })).toBe(true);
    expect(hasAnyHomeFilter({ ...baseSearch, visibility: "public" })).toBe(
      true,
    );
    expect(hasAnyHomeFilter({ ...baseSearch, referencingNoteId: "n1" })).toBe(
      true,
    );
  });

  it("homeSectionResetKey changes when loader-relevant fields change and ignores display", () => {
    const a = homeSectionResetKey(baseSearch);
    expect(homeSectionResetKey({ ...baseSearch, q: "memo" })).not.toBe(a);
    expect(homeSectionResetKey({ ...baseSearch, page: 2 })).not.toBe(a);
    expect(homeSectionResetKey({ ...baseSearch, display: "tile" })).toBe(a);
    expect(homeSectionResetKey({ ...baseSearch })).toBe(a);
  });
});
