import { describe, expect, it } from "vitest";
import { isForbiddenError, isNotFoundError } from "@/core/application/errors";
import { type CreateSavedViewInput, createSavedView } from "../createSavedView";
import { duplicateSavedView } from "../duplicateSavedView";
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

describe("duplicateSavedView", () => {
  it("duplicates with a 'のコピー' name, inherits query/displayMode/sort, and is not default", async () => {
    const container = createViewTestContainer({ existingTagIds: [] });
    const { view: original } = await createSavedView({
      container,
      input: baseInput({
        name: "Inbox",
        isDefault: true,
        displayMode: "tile",
        sort: { by: "title", direction: "asc" },
        query: {
          directoryId: null,
          tagIds: [],
          dateRange: null,
          keyword: "todo",
          referencingNoteId: null,
          visibilityFilter: ["public"],
        },
      }),
    });

    const { view: copy } = await duplicateSavedView({
      container,
      input: { actorUserId: OWNER, viewId: original.id as unknown as string },
    });

    expect(copy.name).toBe("Inbox のコピー");
    expect(copy.id).not.toBe(original.id);
    expect(copy.isDefault).toBe(false);
    expect(copy.displayMode).toBe("tile");
    expect(copy.sort).toEqual({ by: "title", direction: "asc" });
    expect(copy.query.keyword).toBe("todo");
    expect(copy.query.visibilityFilter).toEqual(["public"]);

    expect(container.savedViewRepository.list()).toHaveLength(2);
  });

  it("appends an incrementing ordinal when copy names collide", async () => {
    const container = createViewTestContainer();
    const { view: original } = await createSavedView({
      container,
      input: baseInput({ name: "Inbox" }),
    });

    const { view: first } = await duplicateSavedView({
      container,
      input: { actorUserId: OWNER, viewId: original.id as unknown as string },
    });
    expect(first.name).toBe("Inbox のコピー");

    const { view: second } = await duplicateSavedView({
      container,
      input: { actorUserId: OWNER, viewId: original.id as unknown as string },
    });
    expect(second.name).toBe("Inbox のコピー 2");

    const { view: third } = await duplicateSavedView({
      container,
      input: { actorUserId: OWNER, viewId: original.id as unknown as string },
    });
    expect(third.name).toBe("Inbox のコピー 3");
  });

  it("truncates the original name so the copy name stays within the 60-char limit", async () => {
    const container = createViewTestContainer();
    // 60-char name (max). " のコピー" is 5 chars, so the original must be
    // truncated to fit.
    const longName = "あ".repeat(60);
    const { view: original } = await createSavedView({
      container,
      input: baseInput({ name: longName }),
    });

    const { view: copy } = await duplicateSavedView({
      container,
      input: { actorUserId: OWNER, viewId: original.id as unknown as string },
    });

    expect(copy.name.length).toBeLessThanOrEqual(60);
    expect(copy.name.endsWith(" のコピー")).toBe(true);
  });

  it("carries broken conditions into the duplicate (missing tag is flagged)", async () => {
    const container = createViewTestContainer();
    const { view: original } = await createSavedView({
      container,
      input: baseInput({
        name: "WithBroken",
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
    expect(original.brokenConditions).toHaveLength(1);

    const { view: copy } = await duplicateSavedView({
      container,
      input: { actorUserId: OWNER, viewId: original.id as unknown as string },
    });
    expect(copy.brokenConditions).toHaveLength(1);
    expect(copy.brokenConditions[0]?.kind).toBe("tag");
    expect(copy.brokenConditions[0]?.id).toBe("t-missing");
  });

  it("throws ForbiddenError when the actor does not own the view", async () => {
    const container = createViewTestContainer();
    const { view: original } = await createSavedView({
      container,
      input: baseInput({ name: "Inbox" }),
    });

    try {
      await duplicateSavedView({
        container,
        input: { actorUserId: OTHER, viewId: original.id as unknown as string },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isForbiddenError(error)).toBe(true);
    }
  });

  it("throws NotFoundError for an unknown viewId", async () => {
    const container = createViewTestContainer();
    try {
      await duplicateSavedView({
        container,
        input: { actorUserId: OWNER, viewId: "missing" },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isNotFoundError(error)).toBe(true);
    }
  });
});
