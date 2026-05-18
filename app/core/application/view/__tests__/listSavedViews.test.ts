import { describe, expect, it } from "vitest";
import { type CreateSavedViewInput, createSavedView } from "../createSavedView";
import { listSavedViews } from "../listSavedViews";
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

describe("listSavedViews", () => {
  it("returns the actor's personal views and refreshes brokenConditions", async () => {
    const container = createViewTestContainer();
    await createSavedView({
      container,
      input: baseInput({ name: "A", kind: "personal" }),
    });
    await createSavedView({
      container,
      input: baseInput({ name: "B", kind: "personal" }),
    });
    await createSavedView({
      container,
      input: baseInput({ name: "Pub", kind: "public" }),
    });

    const { views } = await listSavedViews({
      container,
      input: { actorUserId: OWNER, kind: "personal" },
    });

    expect(views).toHaveLength(2);
    const names = views.map((v) => v.name).sort();
    expect(names).toEqual(["A", "B"]);
  });

  it("returns the public views when kind=public", async () => {
    const container = createViewTestContainer();
    await createSavedView({
      container,
      input: baseInput({ name: "P-1", kind: "public" }),
    });

    const { views } = await listSavedViews({
      container,
      input: { actorUserId: OWNER, kind: "public" },
    });
    expect(views).toHaveLength(1);
    expect(views[0]?.kind).toBe("public");
  });

  it("re-detects broken references and surfaces them in the DTOs", async () => {
    // Seed a tag-existing universe so creation does not flag the tag.
    const container = createViewTestContainer({
      existingTagIds: ["t-1" as never],
    });
    const { view } = await createSavedView({
      container,
      input: baseInput({
        name: "WithTag",
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
    expect(view.brokenConditions).toEqual([]);

    // Simulate the tag disappearing by rebuilding the container without
    // the tag id. We reuse the same savedViewRepository so the view
    // persists across "containers" — easier than rewiring stubs.
    const container2 = createViewTestContainer();
    // Re-seed: copy the only persisted row over.
    for (const v of container.savedViewRepository.list()) {
      container2.savedViewRepository.seed(v);
    }

    const { views } = await listSavedViews({
      container: container2,
      input: { actorUserId: OWNER, kind: "personal" },
    });
    expect(views).toHaveLength(1);
    expect(views[0]?.brokenConditions).toHaveLength(1);
    expect(views[0]?.brokenConditions[0]?.kind).toBe("tag");
  });
});
