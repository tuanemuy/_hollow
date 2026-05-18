import { describe, expect, it } from "vitest";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import { isRehydrationError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import { SavedView } from "../entity";
import {
  BrokenConditionMarker,
  CalendarDateKey,
  DisplayMode,
  SavedViewName,
  SortBy,
  SortDirection,
  ViewKind,
  ViewQuery,
  ViewSort,
} from "../valueObject";

const T0 = new Date(0);
const at = (ms: number) => new Date(T0.getTime() + ms);

const ID_BASE = "00000000-0000-7000-8000-";
const rawId = (n: number) => `${ID_BASE}${n.toString(16).padStart(12, "0")}`;
const owner = (n: number) =>
  `00000000-0000-7000-8000-aaaa${n.toString(16).padStart(8, "0")}` as UserId;

function freshSort(): ViewSort {
  return ViewSort.create({
    by: SortBy.create("updatedAt"),
    direction: SortDirection.create("desc"),
  });
}

function freshView(
  overrides: Partial<{
    id: string;
    ownerId: UserId;
    name: string;
    kind: "personal" | "public";
    query: ViewQuery;
    isDefault: boolean;
    now: Date;
  }> = {},
) {
  return SavedView.create(
    {
      id: overrides.id ?? rawId(1),
      ownerId: overrides.ownerId ?? owner(1),
      name: SavedViewName.create(overrides.name ?? "Inbox"),
      kind: ViewKind.create(overrides.kind ?? "personal"),
      query: overrides.query ?? ViewQuery.empty(),
      displayMode: DisplayMode.create("list"),
      calendarDateKey: CalendarDateKey.create("updated"),
      sort: freshSort(),
      isDefault: overrides.isDefault ?? false,
    },
    overrides.now ?? T0,
  );
}

describe("SavedView.create", () => {
  it("creates a fresh view with version 0 and empty brokenConditions", () => {
    const view = freshView();
    expect(view.version).toBe(0);
    expect(view.brokenConditions.length).toBe(0);
    expect(view.isDefault).toBe(false);
    expect(view.createdAt.getTime()).toBe(view.updatedAt.getTime());
  });

  it("respects isDefault override", () => {
    const view = freshView({ isDefault: true });
    expect(view.isDefault).toBe(true);
  });

  it("uses the provided id and now", () => {
    const view = freshView({ id: rawId(42), now: at(123) });
    expect(view.id as unknown as string).toBe(rawId(42));
    expect(view.createdAt.getTime()).toBe(at(123).getTime());
    expect(view.updatedAt.getTime()).toBe(at(123).getTime());
  });
});

describe("SavedView.rename", () => {
  it("updates name and bumps version when the name changes", () => {
    const view = freshView({ name: "Old" });
    const next = SavedView.rename(view, SavedViewName.create("New"), at(5));
    expect(next.name as unknown as string).toBe("New");
    expect(next.version).toBe(view.version + 1);
    expect(next.updatedAt.getTime()).toBe(at(5).getTime());
  });

  it("is idempotent when the new name equals the existing one (case-insensitive)", () => {
    const view = freshView({ name: "Inbox" });
    const same = SavedView.rename(view, SavedViewName.create("INBOX"), at(5));
    expect(same).toBe(view);
    expect(same.version).toBe(view.version);
    expect(same.updatedAt.getTime()).toBe(view.updatedAt.getTime());
  });
});

describe("SavedView.updateQuery", () => {
  it("updates query and bumps version when query differs", () => {
    const view = freshView();
    const nextQuery = ViewQuery.create({
      directoryId: "d-1" as DirectoryId,
      tagIds: [],
      dateRange: null,
      keyword: null,
      referencingNoteId: null,
      visibilityFilter: [],
    });
    const next = SavedView.updateQuery(view, nextQuery, at(2));
    expect(next.query.directoryId).toBe("d-1");
    expect(next.version).toBe(view.version + 1);
  });

  it("is idempotent when the new query is structurally equal", () => {
    const view = freshView();
    const same = SavedView.updateQuery(view, ViewQuery.empty(), at(2));
    expect(same).toBe(view);
  });
});

describe("SavedView.setDisplayMode", () => {
  it("updates displayMode + calendarDateKey and bumps version", () => {
    const view = freshView();
    const next = SavedView.setDisplayMode(
      view,
      DisplayMode.create("calendar"),
      CalendarDateKey.create("created"),
      at(1),
    );
    expect(next.displayMode).toBe("calendar");
    expect(next.calendarDateKey).toBe("created");
    expect(next.version).toBe(view.version + 1);
  });

  it("is idempotent when both mode and calendarDateKey are unchanged", () => {
    const view = freshView();
    const same = SavedView.setDisplayMode(
      view,
      DisplayMode.create("list"),
      CalendarDateKey.create("updated"),
      at(1),
    );
    expect(same).toBe(view);
  });
});

describe("SavedView.setSort", () => {
  it("updates sort and bumps version", () => {
    const view = freshView();
    const sort = ViewSort.create({
      by: SortBy.create("title"),
      direction: SortDirection.create("asc"),
    });
    const next = SavedView.setSort(view, sort, at(1));
    expect(next.sort.by).toBe("title");
    expect(next.sort.direction).toBe("asc");
    expect(next.version).toBe(view.version + 1);
  });

  it("is idempotent when sort is unchanged", () => {
    const view = freshView();
    const same = SavedView.setSort(view, freshSort(), at(1));
    expect(same).toBe(view);
  });
});

describe("SavedView.markDefault / unmarkDefault", () => {
  it("markDefault flips false → true with a version bump", () => {
    const view = freshView();
    const marked = SavedView.markDefault(view, at(1));
    expect(marked.isDefault).toBe(true);
    expect(marked.version).toBe(view.version + 1);
  });

  it("markDefault is idempotent when already default", () => {
    const view = freshView({ isDefault: true });
    const same = SavedView.markDefault(view, at(1));
    expect(same).toBe(view);
  });

  it("unmarkDefault flips true → false with a version bump", () => {
    const view = freshView({ isDefault: true });
    const unmarked = SavedView.unmarkDefault(view, at(1));
    expect(unmarked.isDefault).toBe(false);
    expect(unmarked.version).toBe(view.version + 1);
  });

  it("unmarkDefault is idempotent when not default", () => {
    const view = freshView();
    const same = SavedView.unmarkDefault(view, at(1));
    expect(same).toBe(view);
  });
});

describe("SavedView.markBroken", () => {
  it("appends new markers and bumps version", () => {
    const view = freshView();
    const marker = BrokenConditionMarker.tag("t-1" as TagId, at(1));
    const next = SavedView.markBroken(view, [marker], at(1));
    expect(next.brokenConditions.length).toBe(1);
    expect(next.brokenConditions[0]?.id).toBe("t-1");
    expect(next.version).toBe(view.version + 1);
  });

  it("collapses (kind, id) so re-marking the same reference replaces it with the newer lastSeenAt", () => {
    const view = freshView();
    const old = BrokenConditionMarker.tag("t-1" as TagId, at(1));
    const newer = BrokenConditionMarker.tag("t-1" as TagId, at(10));
    const after1 = SavedView.markBroken(view, [old], at(1));
    const after2 = SavedView.markBroken(after1, [newer], at(10));
    expect(after2.brokenConditions.length).toBe(1);
    expect(after2.brokenConditions[0]?.lastSeenAt.getTime()).toBe(
      at(10).getTime(),
    );
  });

  it("is idempotent when re-marking the same (kind, id, lastSeenAt) batch", () => {
    const view = freshView();
    const marker = BrokenConditionMarker.tag("t-1" as TagId, at(1));
    const after1 = SavedView.markBroken(view, [marker], at(1));
    const after2 = SavedView.markBroken(after1, [marker], at(1));
    expect(after2).toBe(after1);
  });

  it("returns the same instance when given an empty marker list and there are no existing markers", () => {
    const view = freshView();
    const same = SavedView.markBroken(view, [], at(1));
    expect(same).toBe(view);
  });
});

describe("SavedView.repairBrokenConditions", () => {
  it("returns the same instance when no markers are present", () => {
    const view = freshView();
    const same = SavedView.repairBrokenConditions(view, at(1));
    expect(same).toBe(view);
  });

  it("strips referenced tags / directory / referencingNoteId and clears markers", () => {
    const dirId = "d-1" as DirectoryId;
    const tagA = "t-a" as TagId;
    const tagB = "t-b" as TagId;
    const noteId = "n-1" as NoteId;
    const query = ViewQuery.create({
      directoryId: dirId,
      tagIds: [tagA, tagB],
      dateRange: null,
      keyword: null,
      referencingNoteId: noteId,
      visibilityFilter: [],
    });
    const view = freshView({ query });
    const withBroken = SavedView.markBroken(
      view,
      [
        BrokenConditionMarker.tag(tagA, at(1)),
        BrokenConditionMarker.directory(dirId, at(1)),
        BrokenConditionMarker.note(noteId, at(1)),
      ],
      at(1),
    );
    const repaired = SavedView.repairBrokenConditions(withBroken, at(2));
    expect(repaired.query.directoryId).toBeNull();
    expect(repaired.query.tagIds).toEqual([tagB]);
    expect(repaired.query.referencingNoteId).toBeNull();
    expect(repaired.brokenConditions.length).toBe(0);
    expect(repaired.version).toBe(withBroken.version + 1);
  });

  it("preserves a non-empty visibilityFilter across repair (visibility cannot be broken)", () => {
    const query = ViewQuery.create({
      directoryId: null,
      tagIds: ["t-a" as TagId],
      dateRange: null,
      keyword: null,
      referencingNoteId: null,
      visibilityFilter: ["public"],
    });
    const view = freshView({ query });
    const withBroken = SavedView.markBroken(
      view,
      [BrokenConditionMarker.tag("t-a" as TagId, at(1))],
      at(1),
    );
    const repaired = SavedView.repairBrokenConditions(withBroken, at(2));
    expect(repaired.query.tagIds).toEqual([]);
    expect(repaired.query.visibilityFilter).toEqual(["public"]);
  });
});

describe("SavedView.reconstruct", () => {
  const validRow = () => ({
    id: rawId(100),
    ownerId: owner(1) as unknown as string,
    name: "Inbox",
    kind: "personal",
    query: {
      directoryId: null,
      tagIds: [] as readonly string[],
      dateRange: null,
      keyword: null,
      referencingNoteId: null,
      visibilityFilter: [],
    },
    displayMode: "list",
    calendarDateKey: "updated",
    sort: { by: "updatedAt", direction: "desc" },
    isDefault: false,
    brokenConditions: [] as ReadonlyArray<{
      kind: string;
      id: string;
      lastSeenAt: Date;
    }>,
    version: 2,
    createdAt: T0,
    updatedAt: at(1),
  });

  it("rebuilds a SavedView from a well-formed row", () => {
    const view = SavedView.reconstruct(validRow());
    expect(view.name as unknown as string).toBe("Inbox");
    expect(view.kind).toBe("personal");
    expect(view.version).toBe(2);
  });

  it("rebuilds with non-empty brokenConditions correctly", () => {
    const row = validRow();
    const reconstructed = SavedView.reconstruct({
      ...row,
      brokenConditions: [
        { kind: "tag", id: "t-1", lastSeenAt: at(5) },
        { kind: "directory", id: "d-1", lastSeenAt: at(6) },
        { kind: "note", id: "n-1", lastSeenAt: at(7) },
      ],
    });
    expect(reconstructed.brokenConditions.length).toBe(3);
    expect(reconstructed.brokenConditions[0]?.kind).toBe("tag");
    expect(reconstructed.brokenConditions[1]?.kind).toBe("directory");
    expect(reconstructed.brokenConditions[2]?.kind).toBe("note");
  });

  it("throws RehydrationError when stored kind is unknown", () => {
    try {
      SavedView.reconstruct({ ...validRow(), kind: "private" });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError when stored name violates length invariant", () => {
    try {
      SavedView.reconstruct({ ...validRow(), name: "" });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError when stored brokenMarker kind is unknown", () => {
    try {
      SavedView.reconstruct({
        ...validRow(),
        brokenConditions: [{ kind: "user", id: "x", lastSeenAt: at(1) }],
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError when stored version is negative", () => {
    try {
      SavedView.reconstruct({ ...validRow(), version: -1 });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("rebuilds visibilityFilter values through PublicationVisibility validation", () => {
    const row = validRow();
    const reconstructed = SavedView.reconstruct({
      ...row,
      query: {
        ...row.query,
        visibilityFilter: ["public", "unlisted"],
      },
    });
    expect(reconstructed.query.visibilityFilter).toEqual([
      "public",
      "unlisted",
    ]);
  });

  it("throws RehydrationError when stored visibilityFilter contains an unknown value", () => {
    const row = validRow();
    try {
      SavedView.reconstruct({
        ...row,
        query: {
          ...row.query,
          visibilityFilter: ["bogus"],
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });
});
