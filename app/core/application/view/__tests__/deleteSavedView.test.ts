import { describe, expect, it } from "vitest";
import { isForbiddenError, isNotFoundError } from "../../errors";
import { type CreateSavedViewInput, createSavedView } from "../createSavedView";
import { deleteSavedView } from "../deleteSavedView";
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

describe("deleteSavedView", () => {
  it("removes the view when invoked by its owner", async () => {
    const container = createViewTestContainer();
    const { view } = await createSavedView({
      container,
      input: baseInput(),
    });

    await deleteSavedView({
      container,
      input: { actorUserId: OWNER, viewId: view.id },
    });

    expect(container.savedViewRepository.list()).toHaveLength(0);
  });

  it("throws ForbiddenError when actor is not the owner", async () => {
    const container = createViewTestContainer();
    const { view } = await createSavedView({
      container,
      input: baseInput(),
    });

    try {
      await deleteSavedView({
        container,
        input: { actorUserId: OTHER, viewId: view.id },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isForbiddenError(error)).toBe(true);
    }

    // Row remains.
    expect(container.savedViewRepository.list()).toHaveLength(1);
  });

  it("throws NotFoundError for a missing view", async () => {
    const container = createViewTestContainer();
    try {
      await deleteSavedView({
        container,
        input: { actorUserId: OWNER, viewId: "missing" },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isNotFoundError(error)).toBe(true);
    }
  });
});
