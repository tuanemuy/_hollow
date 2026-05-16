import { describe, expect, it } from "vitest";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import { isBusinessRuleError } from "@/core/domain/error";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import { ViewErrorCode } from "../errorCode";
import {
  BrokenConditionMarker,
  CalendarDateKey,
  DateRange,
  DisplayMode,
  SavedViewId,
  SavedViewName,
  SortBy,
  SortDirection,
  ViewKeyword,
  ViewKind,
  ViewQuery,
  ViewSort,
} from "../valueObject";

const T0 = new Date(0);

describe("SavedViewId", () => {
  it("throws InvalidId for an empty string", () => {
    try {
      SavedViewId.create("");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ViewErrorCode.InvalidId);
      }
    }
  });

  it("throws InvalidId for a whitespace-only string", () => {
    try {
      SavedViewId.create("   ");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ViewErrorCode.InvalidId);
      }
    }
  });

  it("accepts any non-empty string and trims surrounding whitespace", () => {
    const id = SavedViewId.create("  abc-123  ");
    expect(id as unknown as string).toBe("abc-123");
  });
});

describe("SavedViewName", () => {
  it("throws NameEmpty when raw input is empty", () => {
    try {
      SavedViewName.create("");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ViewErrorCode.NameEmpty);
      }
    }
  });

  it("throws NameEmpty when input is whitespace only", () => {
    try {
      SavedViewName.create("   ");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ViewErrorCode.NameEmpty);
      }
    }
  });

  it("throws NameTooLong when length exceeds 60", () => {
    try {
      SavedViewName.create("a".repeat(61));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ViewErrorCode.NameTooLong);
      }
    }
  });

  it("accepts a name exactly 60 characters long", () => {
    const name = SavedViewName.create("a".repeat(60));
    expect((name as unknown as string).length).toBe(60);
  });

  it("trims surrounding whitespace from the name", () => {
    const name = SavedViewName.create("  hello  ");
    expect(name as unknown as string).toBe("hello");
  });

  it("equals compares case-insensitively", () => {
    const a = SavedViewName.create("Inbox");
    const b = SavedViewName.create("inbox");
    const c = SavedViewName.create("Other");
    expect(SavedViewName.equals(a, b)).toBe(true);
    expect(SavedViewName.equals(a, c)).toBe(false);
  });
});

describe("ViewKind", () => {
  it.each(["personal", "public"])("accepts %s", (raw) => {
    expect(ViewKind.create(raw)).toBe(raw);
  });

  it("throws InvalidKind for an unknown value", () => {
    try {
      ViewKind.create("private");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ViewErrorCode.InvalidKind);
      }
    }
  });
});

describe("DisplayMode", () => {
  it.each(["list", "tile", "calendar"])("accepts %s", (raw) => {
    expect(DisplayMode.create(raw)).toBe(raw);
  });

  it("throws InvalidDisplayMode for an unknown value", () => {
    try {
      DisplayMode.create("grid");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ViewErrorCode.InvalidDisplayMode);
      }
    }
  });
});

describe("CalendarDateKey", () => {
  it.each(["updated", "created", "frontMatterDate"])("accepts %s", (raw) => {
    expect(CalendarDateKey.create(raw)).toBe(raw);
  });

  it("throws InvalidCalendarDateKey for an unknown value", () => {
    try {
      CalendarDateKey.create("modified");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ViewErrorCode.InvalidCalendarDateKey);
      }
    }
  });
});

describe("SortBy", () => {
  it.each(["updatedAt", "createdAt", "title"])("accepts %s", (raw) => {
    expect(SortBy.create(raw)).toBe(raw);
  });

  it("throws InvalidSortBy for an unknown value", () => {
    try {
      SortBy.create("name");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ViewErrorCode.InvalidSortBy);
      }
    }
  });
});

describe("SortDirection", () => {
  it.each(["asc", "desc"])("accepts %s", (raw) => {
    expect(SortDirection.create(raw)).toBe(raw);
  });

  it("throws InvalidSortDirection for an unknown value", () => {
    try {
      SortDirection.create("up");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ViewErrorCode.InvalidSortDirection);
      }
    }
  });
});

describe("ViewSort", () => {
  it("create stores `by` and `direction` verbatim", () => {
    const sort = ViewSort.create({
      by: SortBy.create("updatedAt"),
      direction: SortDirection.create("desc"),
    });
    expect(sort.by).toBe("updatedAt");
    expect(sort.direction).toBe("desc");
  });

  it("equals returns true for structurally equal sorts", () => {
    const a = ViewSort.create({
      by: SortBy.create("updatedAt"),
      direction: SortDirection.create("desc"),
    });
    const b = ViewSort.create({
      by: SortBy.create("updatedAt"),
      direction: SortDirection.create("desc"),
    });
    expect(ViewSort.equals(a, b)).toBe(true);
  });

  it("equals returns false when `by` differs", () => {
    const a = ViewSort.create({
      by: SortBy.create("updatedAt"),
      direction: SortDirection.create("desc"),
    });
    const b = ViewSort.create({
      by: SortBy.create("createdAt"),
      direction: SortDirection.create("desc"),
    });
    expect(ViewSort.equals(a, b)).toBe(false);
  });

  it("equals returns false when `direction` differs", () => {
    const a = ViewSort.create({
      by: SortBy.create("title"),
      direction: SortDirection.create("asc"),
    });
    const b = ViewSort.create({
      by: SortBy.create("title"),
      direction: SortDirection.create("desc"),
    });
    expect(ViewSort.equals(a, b)).toBe(false);
  });
});

describe("DateRange", () => {
  it("throws InvalidDateRange when both `from` and `to` are null", () => {
    try {
      DateRange.create({ from: null, to: null });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ViewErrorCode.InvalidDateRange);
      }
    }
  });

  it("throws InvalidDateRange when `from` is after `to`", () => {
    try {
      DateRange.create({ from: new Date(10), to: new Date(5) });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ViewErrorCode.InvalidDateRange);
      }
    }
  });

  it("accepts a half-open range with only `from`", () => {
    const range = DateRange.create({ from: new Date(1), to: null });
    expect(range.from?.getTime()).toBe(1);
    expect(range.to).toBeNull();
  });

  it("accepts a half-open range with only `to`", () => {
    const range = DateRange.create({ from: null, to: new Date(1) });
    expect(range.from).toBeNull();
    expect(range.to?.getTime()).toBe(1);
  });

  it("accepts a range where `from` equals `to`", () => {
    const range = DateRange.create({ from: new Date(1), to: new Date(1) });
    expect(range.from?.getTime()).toBe(1);
    expect(range.to?.getTime()).toBe(1);
  });

  it("equals compares structurally including null handling", () => {
    const a = DateRange.create({ from: new Date(1), to: new Date(2) });
    const b = DateRange.create({ from: new Date(1), to: new Date(2) });
    const c = DateRange.create({ from: new Date(1), to: null });
    const d = DateRange.create({ from: new Date(1), to: null });
    expect(DateRange.equals(a, b)).toBe(true);
    expect(DateRange.equals(c, d)).toBe(true);
    expect(DateRange.equals(a, c)).toBe(false);
  });
});

describe("ViewKeyword", () => {
  it("throws KeywordEmpty for empty input", () => {
    try {
      ViewKeyword.create("");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ViewErrorCode.KeywordEmpty);
      }
    }
  });

  it("throws KeywordEmpty for whitespace-only input", () => {
    try {
      ViewKeyword.create("   ");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ViewErrorCode.KeywordEmpty);
      }
    }
  });

  it("throws KeywordTooLong when trimmed length exceeds 200", () => {
    try {
      ViewKeyword.create("a".repeat(201));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ViewErrorCode.KeywordTooLong);
      }
    }
  });

  it("accepts a keyword exactly 200 characters long", () => {
    const kw = ViewKeyword.create("a".repeat(200));
    expect((kw as unknown as string).length).toBe(200);
  });

  it("trims surrounding whitespace", () => {
    const kw = ViewKeyword.create("  hello  ");
    expect(kw as unknown as string).toBe("hello");
  });
});

describe("ViewQuery", () => {
  it("collapses duplicate tagIds at construction time", () => {
    const tagA = "tag-a" as TagId;
    const tagB = "tag-b" as TagId;
    const query = ViewQuery.create({
      directoryId: null,
      tagIds: [tagA, tagB, tagA],
      dateRange: null,
      keyword: null,
      referencingNoteId: null,
    });
    expect(query.tagIds).toEqual([tagA, tagB]);
  });

  it("freezes tagIds so callers cannot mutate it post-construction", () => {
    const tagA = "tag-a" as TagId;
    const query = ViewQuery.create({
      directoryId: null,
      tagIds: [tagA],
      dateRange: null,
      keyword: null,
      referencingNoteId: null,
    });
    expect(Object.isFrozen(query.tagIds)).toBe(true);
  });

  it("empty() returns a no-filter query", () => {
    const query = ViewQuery.empty();
    expect(query.directoryId).toBeNull();
    expect(query.tagIds.length).toBe(0);
    expect(query.dateRange).toBeNull();
    expect(query.keyword).toBeNull();
    expect(query.referencingNoteId).toBeNull();
  });

  it("equals compares all axes structurally", () => {
    const dirId = "dir-1" as DirectoryId;
    const tag = "tag-1" as TagId;
    const note = "note-1" as NoteId;
    const kw = ViewKeyword.create("hello");
    const range = DateRange.create({ from: new Date(1), to: new Date(2) });

    const a = ViewQuery.create({
      directoryId: dirId,
      tagIds: [tag],
      dateRange: range,
      keyword: kw,
      referencingNoteId: note,
    });
    const b = ViewQuery.create({
      directoryId: dirId,
      tagIds: [tag],
      dateRange: DateRange.create({ from: new Date(1), to: new Date(2) }),
      keyword: kw,
      referencingNoteId: note,
    });
    expect(ViewQuery.equals(a, b)).toBe(true);
  });

  it("equals returns false when tagIds length differs", () => {
    const t1 = "tag-1" as TagId;
    const t2 = "tag-2" as TagId;
    const a = ViewQuery.create({
      directoryId: null,
      tagIds: [t1],
      dateRange: null,
      keyword: null,
      referencingNoteId: null,
    });
    const b = ViewQuery.create({
      directoryId: null,
      tagIds: [t1, t2],
      dateRange: null,
      keyword: null,
      referencingNoteId: null,
    });
    expect(ViewQuery.equals(a, b)).toBe(false);
  });

  it("equals returns false when tagIds order differs (structural)", () => {
    const t1 = "tag-1" as TagId;
    const t2 = "tag-2" as TagId;
    const a = ViewQuery.create({
      directoryId: null,
      tagIds: [t1, t2],
      dateRange: null,
      keyword: null,
      referencingNoteId: null,
    });
    const b = ViewQuery.create({
      directoryId: null,
      tagIds: [t2, t1],
      dateRange: null,
      keyword: null,
      referencingNoteId: null,
    });
    expect(ViewQuery.equals(a, b)).toBe(false);
  });

  it("equals returns false when dateRange null-state differs", () => {
    const range = DateRange.create({ from: new Date(1), to: null });
    const a = ViewQuery.create({
      directoryId: null,
      tagIds: [],
      dateRange: range,
      keyword: null,
      referencingNoteId: null,
    });
    const b = ViewQuery.create({
      directoryId: null,
      tagIds: [],
      dateRange: null,
      keyword: null,
      referencingNoteId: null,
    });
    expect(ViewQuery.equals(a, b)).toBe(false);
  });
});

describe("BrokenConditionMarker", () => {
  it("tag/directory/note factories produce the matching discriminator", () => {
    const tag = BrokenConditionMarker.tag("t" as TagId, T0);
    const dir = BrokenConditionMarker.directory("d" as DirectoryId, T0);
    const note = BrokenConditionMarker.note("n" as NoteId, T0);
    expect(tag.kind).toBe("tag");
    expect(dir.kind).toBe("directory");
    expect(note.kind).toBe("note");
  });

  it("createKind accepts the three valid kinds", () => {
    expect(BrokenConditionMarker.createKind("tag")).toBe("tag");
    expect(BrokenConditionMarker.createKind("directory")).toBe("directory");
    expect(BrokenConditionMarker.createKind("note")).toBe("note");
  });

  it("createKind throws InvalidBrokenMarkerKind for unknown", () => {
    try {
      BrokenConditionMarker.createKind("user");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ViewErrorCode.InvalidBrokenMarkerKind);
      }
    }
  });

  it("equals matches kind / id / lastSeenAt", () => {
    const a = BrokenConditionMarker.tag("x" as TagId, new Date(1));
    const b = BrokenConditionMarker.tag("x" as TagId, new Date(1));
    const c = BrokenConditionMarker.tag("x" as TagId, new Date(2));
    const d = BrokenConditionMarker.directory("x" as DirectoryId, new Date(1));
    expect(BrokenConditionMarker.equals(a, b)).toBe(true);
    expect(BrokenConditionMarker.equals(a, c)).toBe(false);
    expect(BrokenConditionMarker.equals(a, d)).toBe(false);
  });
});
