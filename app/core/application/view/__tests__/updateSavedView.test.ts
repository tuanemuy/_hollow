import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import { ViewErrorCode } from "@/core/domain/view/errorCode";
import { isForbiddenError, isNotFoundError } from "../../errors";
import { type CreateSavedViewInput, createSavedView } from "../createSavedView";
import { updateSavedView } from "../updateSavedView";
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

describe("updateSavedView", () => {
  it("applies a normal rename update", async () => {
    const container = createViewTestContainer();
    const { view: created } = await createSavedView({
      container,
      input: baseInput({ name: "Inbox" }),
    });

    const { view: updated } = await updateSavedView({
      container,
      input: {
        actorUserId: OWNER,
        viewId: created.id,
        name: "Renamed",
      },
    });

    expect(updated.name).toBe("Renamed");

    const persisted = await container.savedViewRepository.findById(created.id);
    expect(persisted?.entity.name as unknown as string).toBe("Renamed");
    expect(persisted?.entity.version).toBe(1);
  });

  it("throws NameConflict when renaming to an existing name in the same (owner, kind)", async () => {
    const container = createViewTestContainer();
    await createSavedView({ container, input: baseInput({ name: "Old" }) });
    const { view: target } = await createSavedView({
      container,
      input: baseInput({ name: "Other" }),
    });

    try {
      await updateSavedView({
        container,
        input: {
          actorUserId: OWNER,
          viewId: target.id,
          name: "Old",
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ViewErrorCode.NameConflict);
      }
    }
  });

  it("throws ForbiddenError when actor is not the owner", async () => {
    const container = createViewTestContainer();
    const { view: created } = await createSavedView({
      container,
      input: baseInput({ name: "Mine" }),
    });

    try {
      await updateSavedView({
        container,
        input: {
          actorUserId: OTHER,
          viewId: created.id,
          name: "Hijacked",
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isForbiddenError(error)).toBe(true);
    }
  });

  it("throws NotFoundError when the view does not exist", async () => {
    const container = createViewTestContainer();
    try {
      await updateSavedView({
        container,
        input: {
          actorUserId: OWNER,
          viewId: "missing-id",
          name: "X",
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isNotFoundError(error)).toBe(true);
    }
  });

  it("applies a populated visibilityFilter through query update", async () => {
    const container = createViewTestContainer();
    const { view: created } = await createSavedView({
      container,
      input: baseInput(),
    });

    const { view: updated } = await updateSavedView({
      container,
      input: {
        actorUserId: OWNER,
        viewId: created.id,
        query: {
          directoryId: null,
          tagIds: [],
          dateRange: null,
          keyword: null,
          referencingNoteId: null,
          visibilityFilter: ["unlisted", "public"],
        },
      },
    });

    expect(updated.query.visibilityFilter).toEqual(["unlisted", "public"]);
  });

  it("edits the full query (keyword + tags) and re-detects broken conditions", async () => {
    const container = createViewTestContainer({
      existingTagIds: ["t-1" as never],
    });
    const { view: created } = await createSavedView({
      container,
      input: baseInput(),
    });

    const { view: updated } = await updateSavedView({
      container,
      input: {
        actorUserId: OWNER,
        viewId: created.id,
        query: {
          directoryId: null,
          tagIds: ["t-1", "t-missing"],
          dateRange: null,
          keyword: "todo",
          referencingNoteId: null,
          visibilityFilter: [],
        },
      },
    });

    expect(updated.query.keyword).toBe("todo");
    expect(updated.query.tagIds).toEqual(["t-1", "t-missing"]);
    // The missing tag is flagged broken by the post-update re-scan.
    expect(updated.brokenConditions).toHaveLength(1);
    expect(updated.brokenConditions[0]?.id).toBe("t-missing");
    expect(updated.brokenConditions[0]?.lastSeenName).toBe("");
  });

  it("rejects an update whose visibilityFilter contains an unknown value", async () => {
    const container = createViewTestContainer();
    const { view: created } = await createSavedView({
      container,
      input: baseInput(),
    });

    try {
      await updateSavedView({
        container,
        input: {
          actorUserId: OWNER,
          viewId: created.id,
          query: {
            directoryId: null,
            tagIds: [],
            dateRange: null,
            keyword: null,
            referencingNoteId: null,
            visibilityFilter: ["bogus" as never],
          },
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
    }
  });
});
