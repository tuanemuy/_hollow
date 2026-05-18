import { describe, expect, it } from "vitest";
import { isForbiddenError, isNotFoundError } from "../../errors";
import { type CreateSavedViewInput, createSavedView } from "../createSavedView";
import { validateSavedView } from "../validateSavedView";
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

describe("validateSavedView", () => {
  it("returns brokenConditions for a referenced-tag-missing view", async () => {
    const container = createViewTestContainer();
    const { view } = await createSavedView({
      container,
      input: baseInput({
        query: {
          directoryId: null,
          tagIds: ["t-missing"],
          dateRange: null,
          keyword: null,
          referencingNoteId: null,
          visibilityFilter: [],
        },
      }),
    });

    const { brokenConditions } = await validateSavedView({
      container,
      input: { actorUserId: OWNER, viewId: view.id },
    });

    expect(brokenConditions).toHaveLength(1);
    expect(brokenConditions[0]?.kind).toBe("tag");
    expect(brokenConditions[0]?.id).toBe("t-missing");
  });

  it("throws ForbiddenError when actor is not the owner", async () => {
    const container = createViewTestContainer();
    const { view } = await createSavedView({
      container,
      input: baseInput(),
    });

    try {
      await validateSavedView({
        container,
        input: { actorUserId: OTHER, viewId: view.id },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isForbiddenError(error)).toBe(true);
    }
  });

  it("throws NotFoundError for a missing view", async () => {
    const container = createViewTestContainer();
    try {
      await validateSavedView({
        container,
        input: { actorUserId: OWNER, viewId: "missing" },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isNotFoundError(error)).toBe(true);
    }
  });
});
