import { describe, expect, it } from "vitest";
import { type CreateSavedViewInput, createSavedView } from "../createSavedView";
import { setDefaultSavedView } from "../setDefaultSavedView";
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
    },
    displayMode: "list",
    calendarDateKey: "updated",
    sort: { by: "updatedAt", direction: "desc" },
    isDefault: false,
    ...overrides,
  };
}

describe("setDefaultSavedView", () => {
  it("with viewId=null and an existing default, clears the slot (no default remains)", async () => {
    const container = createViewTestContainer();
    await createSavedView({
      container,
      input: baseInput({ name: "Current", isDefault: true }),
    });

    await setDefaultSavedView({
      container,
      input: { actorUserId: OWNER, kind: "personal", viewId: null },
    });

    const all = container.savedViewRepository.list();
    expect(all.some((v) => v.isDefault)).toBe(false);
  });

  it("with viewId=null and no existing default, leaves repository unchanged", async () => {
    const container = createViewTestContainer();
    await createSavedView({
      container,
      input: baseInput({ name: "A" }),
    });

    await setDefaultSavedView({
      container,
      input: { actorUserId: OWNER, kind: "personal", viewId: null },
    });

    const all = container.savedViewRepository.list();
    expect(all.some((v) => v.isDefault)).toBe(false);
  });

  it("with a different existing default, unmarks the old default and marks the new one", async () => {
    const container = createViewTestContainer();
    const { view: oldDefault } = await createSavedView({
      container,
      input: baseInput({ name: "Old", isDefault: true }),
    });
    const { view: newDefault } = await createSavedView({
      container,
      input: baseInput({ name: "New", isDefault: false }),
    });

    await setDefaultSavedView({
      container,
      input: {
        actorUserId: OWNER,
        kind: "personal",
        viewId: newDefault.id,
      },
    });

    const all = container.savedViewRepository.list();
    const flaggedDefault = all.filter((v) => v.isDefault);
    expect(flaggedDefault).toHaveLength(1);
    expect(flaggedDefault[0]?.id as unknown as string).toBe(newDefault.id);

    const oldPersisted = await container.savedViewRepository.findById(
      oldDefault.id,
    );
    expect(oldPersisted?.entity.isDefault).toBe(false);
  });
});
