import { describe, expect, it } from "vitest";
import type { Directory } from "@/core/domain/directory/entity";
import type { DirectoryRepository } from "@/core/domain/directory/ports/directoryRepository";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import { isBusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { Note } from "@/core/domain/note/entity";
import type { NoteRepository } from "@/core/domain/note/ports/noteRepository";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { Tag } from "@/core/domain/tag/entity";
import type { TagRepository } from "@/core/domain/tag/ports/tagRepository";
import type { TagId } from "@/core/domain/tag/valueObject";
import { SavedView } from "../entity";
import { ViewErrorCode } from "../errorCode";
import { SavedViewService } from "../service";
import {
  CalendarDateKey,
  DisplayMode,
  SavedViewName,
  SortBy,
  SortDirection,
  ViewKind,
  ViewQuery,
  ViewSort,
} from "../valueObject";
import { InMemorySavedViewRepository } from "./fakes/savedViewRepository";

const T0 = new Date(0);
const ID_BASE = "00000000-0000-7000-8000-";
let idCounter = 0;
const rawId = () => {
  idCounter += 1;
  return `${ID_BASE}${idCounter.toString(16).padStart(12, "0")}`;
};

function makeView(opts: {
  name: string;
  ownerId?: UserId;
  kind?: "personal" | "public";
  isDefault?: boolean;
  query?: ViewQuery;
}) {
  return SavedView.create(
    {
      id: rawId(),
      ownerId: opts.ownerId ?? ("owner-1" as UserId),
      name: SavedViewName.create(opts.name),
      kind: ViewKind.create(opts.kind ?? "personal"),
      query: opts.query ?? ViewQuery.empty(),
      displayMode: DisplayMode.create("list"),
      calendarDateKey: CalendarDateKey.create("updated"),
      sort: ViewSort.create({
        by: SortBy.create("updatedAt"),
        direction: SortDirection.create("desc"),
      }),
      isDefault: opts.isDefault ?? false,
    },
    T0,
  );
}

// Lightweight read-only stubs for cross-aggregate lookups. We only need the
// methods that `SavedViewService.detectBrokenConditions` actually calls;
// everything else is left unimplemented and surfaces as a typing/test bug
// if a refactor drifts.
function makeDirRepo(existingIds: readonly DirectoryId[]): DirectoryRepository {
  const set = new Set<string>(existingIds);
  return {
    async findById(id: DirectoryId) {
      if (!set.has(id)) return null;
      const stub = { id } as unknown as Directory;
      return {
        entity: stub,
        expectedVersion: 0 as never,
      };
    },
  } as unknown as DirectoryRepository;
}

function makeTagRepo(existingIds: readonly TagId[]): TagRepository {
  const present = new Set<string>(existingIds);
  return {
    async findByIds(ids: readonly TagId[]) {
      return ids
        .filter((id) => present.has(id))
        .map((id) => ({ id }) as unknown as Tag);
    },
  } as unknown as TagRepository;
}

function makeNoteRepo(existingIds: readonly NoteId[]): NoteRepository {
  const set = new Set<string>(existingIds);
  return {
    async findById(id: NoteId) {
      if (!set.has(id)) return null;
      const stub = { id } as unknown as Note;
      return { entity: stub, expectedVersion: 0 as never };
    },
  } as unknown as NoteRepository;
}

describe("SavedViewService.assertNameUnique", () => {
  it("passes when there is no existing view with the same name", async () => {
    const repo = new InMemorySavedViewRepository();
    await expect(
      SavedViewService.assertNameUnique(
        "owner-1" as UserId,
        ViewKind.create("personal"),
        SavedViewName.create("Inbox"),
        null,
        repo,
      ),
    ).resolves.toBeUndefined();
  });

  it("throws NameConflict when another view of the same (owner, kind) has the name", async () => {
    const repo = new InMemorySavedViewRepository();
    await repo.insert(makeView({ name: "Inbox" }));

    try {
      await SavedViewService.assertNameUnique(
        "owner-1" as UserId,
        ViewKind.create("personal"),
        SavedViewName.create("inbox"),
        null,
        repo,
      );
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ViewErrorCode.NameConflict);
      }
    }
  });

  it("passes when the colliding view is the one being renamed (exceptId match)", async () => {
    const repo = new InMemorySavedViewRepository();
    const view = makeView({ name: "Inbox" });
    await repo.insert(view);

    await expect(
      SavedViewService.assertNameUnique(
        view.ownerId,
        view.kind,
        SavedViewName.create("Inbox"),
        view.id,
        repo,
      ),
    ).resolves.toBeUndefined();
  });

  it("isolates uniqueness by (owner, kind) — same name allowed across kinds", async () => {
    const repo = new InMemorySavedViewRepository();
    await repo.insert(makeView({ name: "Shared", kind: "personal" }));

    await expect(
      SavedViewService.assertNameUnique(
        "owner-1" as UserId,
        ViewKind.create("public"),
        SavedViewName.create("Shared"),
        null,
        repo,
      ),
    ).resolves.toBeUndefined();
  });
});

describe("SavedViewService.ensureSingleDefault", () => {
  it("returns silently when there is no existing default for (owner, kind)", async () => {
    const repo = new InMemorySavedViewRepository();
    await expect(
      SavedViewService.ensureSingleDefault(
        "owner-1" as UserId,
        ViewKind.create("personal"),
        null,
        T0,
        repo,
      ),
    ).resolves.toBeUndefined();
  });

  it("returns silently when the existing default is the same view as `targetId`", async () => {
    const repo = new InMemorySavedViewRepository();
    const view = makeView({ name: "Default", isDefault: true });
    await repo.insert(view);

    await SavedViewService.ensureSingleDefault(
      view.ownerId,
      view.kind,
      view.id,
      T0,
      repo,
    );
    const refound = await repo.findById(view.id);
    expect(refound?.entity.isDefault).toBe(true);
  });

  it("unmarks the existing default when a different view is becoming default", async () => {
    const repo = new InMemorySavedViewRepository();
    const oldDefault = makeView({ name: "OldDefault", isDefault: true });
    const newDefault = makeView({ name: "NewDefault", isDefault: false });
    await repo.insert(oldDefault);
    await repo.insert(newDefault);

    await SavedViewService.ensureSingleDefault(
      oldDefault.ownerId,
      oldDefault.kind,
      newDefault.id,
      T0,
      repo,
    );

    const afterOld = await repo.findById(oldDefault.id);
    expect(afterOld?.entity.isDefault).toBe(false);
  });

  it("unmarks the existing default when `targetId` is null (clearing the slot)", async () => {
    const repo = new InMemorySavedViewRepository();
    const oldDefault = makeView({ name: "OldDefault", isDefault: true });
    await repo.insert(oldDefault);

    await SavedViewService.ensureSingleDefault(
      oldDefault.ownerId,
      oldDefault.kind,
      null,
      T0,
      repo,
    );
    const after = await repo.findById(oldDefault.id);
    expect(after?.entity.isDefault).toBe(false);
  });
});

describe("SavedViewService.detectBrokenConditions", () => {
  it("returns an empty list when every reference resolves", async () => {
    const dirId = "d-1" as DirectoryId;
    const tagId = "t-1" as TagId;
    const noteId = "n-1" as NoteId;
    const query = ViewQuery.create({
      directoryId: dirId,
      tagIds: [tagId],
      dateRange: null,
      keyword: null,
      referencingNoteId: noteId,
      visibilityFilter: [],
    });
    const view = makeView({ name: "All", query });

    const markers = await SavedViewService.detectBrokenConditions(view, T0, {
      dirRepo: makeDirRepo([dirId]),
      tagRepo: makeTagRepo([tagId]),
      noteRepo: makeNoteRepo([noteId]),
    });
    expect(markers).toEqual([]);
  });

  it("flags a missing directory", async () => {
    const dirId = "d-missing" as DirectoryId;
    const query = ViewQuery.create({
      directoryId: dirId,
      tagIds: [],
      dateRange: null,
      keyword: null,
      referencingNoteId: null,
      visibilityFilter: [],
    });
    const view = makeView({ name: "Dir", query });
    const markers = await SavedViewService.detectBrokenConditions(view, T0, {
      dirRepo: makeDirRepo([]),
      tagRepo: makeTagRepo([]),
      noteRepo: makeNoteRepo([]),
    });
    expect(markers.length).toBe(1);
    expect(markers[0]?.kind).toBe("directory");
    expect(markers[0]?.id).toBe(dirId);
  });

  it("flags every missing tag", async () => {
    const tagA = "t-a" as TagId;
    const tagB = "t-b" as TagId;
    const tagC = "t-c" as TagId;
    const query = ViewQuery.create({
      directoryId: null,
      tagIds: [tagA, tagB, tagC],
      dateRange: null,
      keyword: null,
      referencingNoteId: null,
      visibilityFilter: [],
    });
    const view = makeView({ name: "Tags", query });
    const markers = await SavedViewService.detectBrokenConditions(view, T0, {
      dirRepo: makeDirRepo([]),
      tagRepo: makeTagRepo([tagB]),
      noteRepo: makeNoteRepo([]),
    });
    const ids = markers.filter((m) => m.kind === "tag").map((m) => m.id);
    expect(ids).toEqual([tagA, tagC]);
  });

  it("flags a missing referencingNoteId", async () => {
    const noteId = "n-x" as NoteId;
    const query = ViewQuery.create({
      directoryId: null,
      tagIds: [],
      dateRange: null,
      keyword: null,
      referencingNoteId: noteId,
      visibilityFilter: [],
    });
    const view = makeView({ name: "Note", query });
    const markers = await SavedViewService.detectBrokenConditions(view, T0, {
      dirRepo: makeDirRepo([]),
      tagRepo: makeTagRepo([]),
      noteRepo: makeNoteRepo([]),
    });
    expect(markers.length).toBe(1);
    expect(markers[0]?.kind).toBe("note");
    expect(markers[0]?.id).toBe(noteId);
  });
});
