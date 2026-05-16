import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
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

const NOW = new Date(0);
const at = (ms: number) => new Date(NOW.getTime() + ms);

const ID_BASE = "00000000-0000-7000-8000-";
let counter = 0;
const rawId = (): string => {
  counter += 1;
  return `${ID_BASE}${counter.toString(16).padStart(12, "0")}`;
};

const nameArb = fc.stringMatching(/^[a-z]{1,30}$/);

function freshView(
  name = "Inbox",
  isDefault = false,
  query: ViewQuery = ViewQuery.empty(),
) {
  return SavedView.create(
    {
      id: rawId(),
      ownerId: "owner-1" as UserId,
      name: SavedViewName.create(name),
      kind: ViewKind.create("personal"),
      query,
      displayMode: DisplayMode.create("list"),
      calendarDateKey: CalendarDateKey.create("updated"),
      sort: ViewSort.create({
        by: SortBy.create("updatedAt"),
        direction: SortDirection.create("desc"),
      }),
      isDefault,
    },
    NOW,
  );
}

describe("SavedView.rename (property)", () => {
  it("renaming to the same trimmed name is a no-op", () => {
    fc.assert(
      fc.property(
        nameArb,
        fc.integer({ min: 0, max: 4 }),
        fc.integer({ min: 0, max: 4 }),
        (body, left, right) => {
          const view = freshView(body);
          const padded = `${" ".repeat(left)}${body}${" ".repeat(right)}`;
          const next = SavedView.rename(
            view,
            SavedViewName.create(padded),
            at(10),
          );
          expect(next).toBe(view);
          expect(next.version).toBe(view.version);
        },
      ),
    );
  });

  it("version bump iff name actually differs (case-insensitive)", () => {
    fc.assert(
      fc.property(nameArb, nameArb, (a, b) => {
        const view = freshView(a);
        const next = SavedView.rename(view, SavedViewName.create(b), at(1));
        if (a.toLowerCase() === b.toLowerCase()) {
          expect(next.version).toBe(view.version);
        } else {
          expect(next.version).toBe(view.version + 1);
        }
      }),
    );
  });
});

describe("SavedView.markDefault / unmarkDefault (property)", () => {
  it("mark then unmark returns isDefault to its original state", () => {
    fc.assert(
      fc.property(fc.boolean(), (startDefault) => {
        const view = freshView("inbox", startDefault);
        const marked = SavedView.markDefault(view, at(1));
        const unmarked = SavedView.unmarkDefault(marked, at(2));
        expect(unmarked.isDefault).toBe(false);
      }),
    );
  });

  it("markDefault is idempotent for already-default views", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (delta) => {
        const view = freshView("inbox", true);
        const same = SavedView.markDefault(view, at(delta));
        expect(same).toBe(view);
      }),
    );
  });
});

describe("SavedView.markBroken (property)", () => {
  it("collapses to a unique (kind, id) set", () => {
    const tagArb = fc.stringMatching(/^t[0-9]{1,3}$/);
    fc.assert(
      fc.property(
        fc.array(tagArb, { minLength: 1, maxLength: 8 }),
        (rawIds) => {
          const view = freshView();
          const markers = rawIds.map((id) =>
            BrokenConditionMarker.tag(id as TagId, at(1)),
          );
          const next = SavedView.markBroken(view, markers, at(1));
          const ids = new Set(next.brokenConditions.map((m) => m.id));
          expect(next.brokenConditions.length).toBe(ids.size);
        },
      ),
    );
  });

  it("idempotent: re-applying the same batch leaves the entity untouched", () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^t[0-9]{1,3}$/), {
          minLength: 1,
          maxLength: 5,
        }),
        (rawIds) => {
          const view = freshView();
          const markers = rawIds.map((id) =>
            BrokenConditionMarker.tag(id as TagId, at(1)),
          );
          const after1 = SavedView.markBroken(view, markers, at(1));
          const after2 = SavedView.markBroken(after1, markers, at(1));
          expect(after2).toBe(after1);
        },
      ),
    );
  });
});

describe("SavedView.repairBrokenConditions (property)", () => {
  it("after repair, query no longer references any broken tag id", () => {
    const tagArb = fc.stringMatching(/^t[0-9]{1,3}$/);
    fc.assert(
      fc.property(
        fc.array(tagArb, { minLength: 1, maxLength: 8 }),
        fc.array(tagArb, { minLength: 1, maxLength: 5 }),
        (tagIds, brokenIds) => {
          const tags = tagIds.map((t) => t as TagId);
          const query = ViewQuery.create({
            directoryId: null,
            tagIds: tags,
            dateRange: null,
            keyword: null,
            referencingNoteId: null,
          });
          const view = freshView("inbox", false, query);
          const markers = brokenIds.map((id) =>
            BrokenConditionMarker.tag(id as TagId, at(1)),
          );
          const withBroken = SavedView.markBroken(view, markers, at(1));
          const repaired = SavedView.repairBrokenConditions(withBroken, at(2));
          const brokenSet = new Set(brokenIds);
          for (const remaining of repaired.query.tagIds) {
            expect(brokenSet.has(remaining as unknown as string)).toBe(false);
          }
          expect(repaired.brokenConditions.length).toBe(0);
        },
      ),
    );
  });

  it("repair clears directoryId when it appears in brokenConditions", () => {
    fc.assert(
      fc.property(fc.boolean(), (broken) => {
        const dirId = "d-1" as DirectoryId;
        const query = ViewQuery.create({
          directoryId: dirId,
          tagIds: [],
          dateRange: null,
          keyword: null,
          referencingNoteId: null,
        });
        const view = freshView("inbox", false, query);
        const markers = broken
          ? [BrokenConditionMarker.directory(dirId, at(1))]
          : [];
        const withBroken = SavedView.markBroken(view, markers, at(1));
        const repaired = SavedView.repairBrokenConditions(withBroken, at(2));
        if (broken) {
          expect(repaired.query.directoryId).toBeNull();
        } else {
          expect(repaired.query.directoryId).toBe(dirId);
        }
      }),
    );
  });

  it("repair clears referencingNoteId when it appears in brokenConditions", () => {
    fc.assert(
      fc.property(fc.boolean(), (broken) => {
        const noteId = "n-1" as NoteId;
        const query = ViewQuery.create({
          directoryId: null,
          tagIds: [],
          dateRange: null,
          keyword: null,
          referencingNoteId: noteId,
        });
        const view = freshView("inbox", false, query);
        const markers = broken
          ? [BrokenConditionMarker.note(noteId, at(1))]
          : [];
        const withBroken = SavedView.markBroken(view, markers, at(1));
        const repaired = SavedView.repairBrokenConditions(withBroken, at(2));
        if (broken) {
          expect(repaired.query.referencingNoteId).toBeNull();
        } else {
          expect(repaired.query.referencingNoteId).toBe(noteId);
        }
      }),
    );
  });
});
