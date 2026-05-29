import { describe, expect, it } from "vitest";
import { type CreateSavedViewInput, createSavedView } from "../createSavedView";
import { handleDirectoryDeletedEvent } from "../handleDirectoryDeletedEvent";
import { handleNotePurgedEvent } from "../handleNotePurgedEvent";
import { handleTagDeletedEvent } from "../handleTagDeletedEvent";
import { createViewTestContainer } from "./fakes/container";

const OWNER = "00000000-0000-7000-8000-aaaa00000001";

function baseInput(
  overrides: Partial<CreateSavedViewInput> = {},
): CreateSavedViewInput {
  return {
    actorUserId: OWNER,
    name: "Inbox",
    kind: "personal",
    query: {
      directoryId: null,
      tagIds: [],
      dateRange: null,
      keyword: null,
      referencingNoteId: null,
      visibilityFilter: [],
    },
    displayMode: "list",
    calendarDateKey: "updated",
    sort: { by: "updatedAt", direction: "desc" },
    isDefault: false,
    ...overrides,
  };
}

describe("handleTagDeletedEvent", () => {
  it("marks every view that references the tag as broken", async () => {
    const container = createViewTestContainer({
      existingTagIds: ["t-1" as never, "t-2" as never],
    });
    const { view: a } = await createSavedView({
      container,
      input: baseInput({
        name: "RefT1",
        query: {
          directoryId: null,
          tagIds: ["t-1"],
          dateRange: null,
          keyword: null,
          referencingNoteId: null,
          visibilityFilter: [],
        },
      }),
    });
    const { view: b } = await createSavedView({
      container,
      input: baseInput({
        name: "RefT2",
        query: {
          directoryId: null,
          tagIds: ["t-2"],
          dateRange: null,
          keyword: null,
          referencingNoteId: null,
          visibilityFilter: [],
        },
      }),
    });

    await handleTagDeletedEvent({
      container,
      input: { tagId: "t-1" },
    });

    const persistedA = await container.savedViewRepository.findById(a.id);
    const persistedB = await container.savedViewRepository.findById(b.id);
    expect(persistedA?.entity.brokenConditions).toHaveLength(1);
    expect(persistedA?.entity.brokenConditions[0]?.kind).toBe("tag");
    expect(persistedA?.entity.brokenConditions[0]?.id).toBe("t-1");
    expect(persistedB?.entity.brokenConditions).toHaveLength(0);
  });

  it("is idempotent for the same tagId", async () => {
    const container = createViewTestContainer({
      existingTagIds: ["t-1" as never],
    });
    const { view } = await createSavedView({
      container,
      input: baseInput({
        query: {
          directoryId: null,
          tagIds: ["t-1"],
          dateRange: null,
          keyword: null,
          referencingNoteId: null,
          visibilityFilter: [],
        },
      }),
    });

    await handleTagDeletedEvent({ container, input: { tagId: "t-1" } });
    await handleTagDeletedEvent({ container, input: { tagId: "t-1" } });

    const persisted = await container.savedViewRepository.findById(view.id);
    expect(persisted?.entity.brokenConditions).toHaveLength(1);
  });
});

describe("handleDirectoryDeletedEvent", () => {
  it("marks views referencing the directory as broken", async () => {
    const container = createViewTestContainer({
      existingDirIds: ["d-1" as never],
    });
    const { view } = await createSavedView({
      container,
      input: baseInput({
        query: {
          directoryId: "d-1",
          tagIds: [],
          dateRange: null,
          keyword: null,
          referencingNoteId: null,
          visibilityFilter: [],
        },
      }),
    });

    await handleDirectoryDeletedEvent({
      container,
      input: { directoryId: "d-1" },
    });

    const persisted = await container.savedViewRepository.findById(view.id);
    expect(persisted?.entity.brokenConditions).toHaveLength(1);
    expect(persisted?.entity.brokenConditions[0]?.kind).toBe("directory");
    expect(persisted?.entity.brokenConditions[0]?.id).toBe("d-1");
  });

  it("is idempotent for the same directoryId (re-delivery is a no-op)", async () => {
    const container = createViewTestContainer({
      existingDirIds: ["d-1" as never],
    });
    const { view } = await createSavedView({
      container,
      input: baseInput({
        query: {
          directoryId: "d-1",
          tagIds: [],
          dateRange: null,
          keyword: null,
          referencingNoteId: null,
          visibilityFilter: [],
        },
      }),
    });

    await handleDirectoryDeletedEvent({
      container,
      input: { directoryId: "d-1" },
    });
    await handleDirectoryDeletedEvent({
      container,
      input: { directoryId: "d-1" },
    });

    const persisted = await container.savedViewRepository.findById(view.id);
    expect(persisted?.entity.brokenConditions).toHaveLength(1);
  });
});

describe("handleNotePurgedEvent", () => {
  it("marks views whose referencingNoteId matches as broken", async () => {
    const container = createViewTestContainer({
      existingNoteIds: ["n-1" as never],
    });
    const { view } = await createSavedView({
      container,
      input: baseInput({
        query: {
          directoryId: null,
          tagIds: [],
          dateRange: null,
          keyword: null,
          referencingNoteId: "n-1",
          visibilityFilter: [],
        },
      }),
    });

    await handleNotePurgedEvent({ container, input: { noteId: "n-1" } });

    const persisted = await container.savedViewRepository.findById(view.id);
    expect(persisted?.entity.brokenConditions).toHaveLength(1);
    expect(persisted?.entity.brokenConditions[0]?.kind).toBe("note");
    expect(persisted?.entity.brokenConditions[0]?.id).toBe("n-1");
  });
});
