import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import { ViewErrorCode } from "@/core/domain/view/errorCode";
import { type CreateSavedViewInput, createSavedView } from "../createSavedView";
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

describe("createSavedView", () => {
  it("creates and returns a fresh SavedView for normal input", async () => {
    const container = createViewTestContainer();
    const { view } = await createSavedView({
      container,
      input: baseInput(),
    });

    expect(view.name).toBe("Inbox");
    expect(view.kind).toBe("personal");
    expect(view.isDefault).toBe(false);
    expect(view.brokenConditions).toEqual([]);

    const persisted = container.savedViewRepository.list();
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.id as unknown as string).toBe(view.id);
  });

  it("throws BusinessRuleError('saved_view_name_conflict') when name collides for (owner, kind)", async () => {
    const container = createViewTestContainer();
    await createSavedView({ container, input: baseInput({ name: "Inbox" }) });

    try {
      await createSavedView({
        container,
        input: baseInput({ name: "inbox" }),
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ViewErrorCode.NameConflict);
      }
    }
  });

  it("when isDefault=true with an existing default, unmarks the previous one and marks the new view default", async () => {
    const container = createViewTestContainer();
    await createSavedView({
      container,
      input: baseInput({ name: "Old", isDefault: true }),
    });
    const { view: created } = await createSavedView({
      container,
      input: baseInput({ name: "New", isDefault: true }),
    });

    const all = container.savedViewRepository.list();
    const defaults = all.filter((v) => v.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.id as unknown as string).toBe(created.id);
  });

  it("flags a referenced tag as broken when the tag does not exist", async () => {
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

    expect(view.brokenConditions).toHaveLength(1);
    expect(view.brokenConditions[0]?.kind).toBe("tag");
    expect(view.brokenConditions[0]?.id).toBe("t-missing");
  });

  it("leaves brokenConditions empty when the referenced tag exists", async () => {
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
    expect(view.brokenConditions).toEqual([]);
  });

  it("persists a populated visibilityFilter through the usecase", async () => {
    const container = createViewTestContainer();
    const { view } = await createSavedView({
      container,
      input: baseInput({
        query: {
          directoryId: null,
          tagIds: [],
          dateRange: null,
          keyword: null,
          referencingNoteId: null,
          visibilityFilter: ["public"],
        },
      }),
    });
    expect(view.query.visibilityFilter).toEqual(["public"]);
    const persisted = container.savedViewRepository.list();
    expect(persisted[0]?.query.visibilityFilter).toEqual(["public"]);
  });

  it("rejects input with an unknown visibilityFilter value at the domain boundary", async () => {
    const container = createViewTestContainer();
    try {
      await createSavedView({
        container,
        input: baseInput({
          query: {
            directoryId: null,
            tagIds: [],
            dateRange: null,
            keyword: null,
            referencingNoteId: null,
            visibilityFilter: ["bogus" as never],
          },
        }),
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
    }
  });
});
