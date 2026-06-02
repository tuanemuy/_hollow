import { describe, expect, it } from "vitest";
import { isForbiddenError, isNotFoundError } from "@/core/application/errors";
import { type CreateSavedViewInput, createSavedView } from "../createSavedView";
import { repairSavedView } from "../repairSavedView";
import { createViewTestContainer } from "./fakes/container";

const OWNER = "00000000-0000-7000-8000-aaaa00000001";
const OTHER = "00000000-0000-7000-8000-aaaa00000002";

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

describe("repairSavedView", () => {
  it("strips broken references from the query and clears the markers", async () => {
    const container = createViewTestContainer({
      existingTagIds: ["t-keep" as never],
    });
    const { view: created } = await createSavedView({
      container,
      input: baseInput({
        query: {
          directoryId: null,
          tagIds: ["t-keep", "t-missing"],
          dateRange: null,
          keyword: "todo",
          referencingNoteId: "n-missing",
          visibilityFilter: ["public"],
        },
      }),
    });
    // Two broken refs detected at creation time.
    expect(created.brokenConditions.length).toBeGreaterThan(0);

    const { view: repaired } = await repairSavedView({
      container,
      input: { actorUserId: OWNER, viewId: created.id as unknown as string },
    });

    expect(repaired.brokenConditions).toHaveLength(0);
    expect(repaired.query.tagIds).toEqual(["t-keep"]);
    expect(repaired.query.referencingNoteId).toBeNull();
    // Unbreakable axes are preserved.
    expect(repaired.query.keyword).toBe("todo");
    expect(repaired.query.visibilityFilter).toEqual(["public"]);

    const persisted = await container.savedViewRepository.findById(
      created.id as unknown as string,
    );
    expect(persisted?.entity.brokenConditions).toHaveLength(0);
  });

  it("is a no-op (no version bump) when there is nothing to repair", async () => {
    const container = createViewTestContainer({
      existingTagIds: ["t-1" as never],
    });
    const { view: created } = await createSavedView({
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
    expect(created.brokenConditions).toHaveLength(0);

    const before = await container.savedViewRepository.findById(
      created.id as unknown as string,
    );

    const { view: repaired } = await repairSavedView({
      container,
      input: { actorUserId: OWNER, viewId: created.id as unknown as string },
    });

    expect(repaired.query.tagIds).toEqual(["t-1"]);
    const after = await container.savedViewRepository.findById(
      created.id as unknown as string,
    );
    // No persistence happened: the version is unchanged.
    expect(after?.entity.version).toBe(before?.entity.version);
  });

  it("throws ForbiddenError when the actor does not own the view", async () => {
    const container = createViewTestContainer();
    const { view: created } = await createSavedView({
      container,
      input: baseInput(),
    });
    try {
      await repairSavedView({
        container,
        input: { actorUserId: OTHER, viewId: created.id as unknown as string },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isForbiddenError(error)).toBe(true);
    }
  });

  it("throws NotFoundError for an unknown viewId", async () => {
    const container = createViewTestContainer();
    try {
      await repairSavedView({
        container,
        input: { actorUserId: OWNER, viewId: "missing" },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isNotFoundError(error)).toBe(true);
    }
  });
});
