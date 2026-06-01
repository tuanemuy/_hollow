import { describe, expect, it } from "vitest";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import { SavedView } from "@/core/domain/view/entity";
import {
  BrokenConditionMarker,
  CalendarDateKey,
  DisplayMode,
  SavedViewName,
  SortBy,
  SortDirection,
  ViewKind,
  ViewQuery,
} from "@/core/domain/view/valueObject";
import * as schema from "../schema";
import { createTestContainer, type TestContainer } from "./helpers";

/**
 * Integration coverage for the `lastSeenName` field added to
 * `broken_conditions_json` (Issue #405 ADR-A). The column is plain JSON
 * text, so the change is migration-free; these tests assert the
 * round-trip through `encode/decodeBrokenConditionsJson` against real D1
 * plus the backward-compatible fallback for legacy rows missing the key.
 */

const TZ = new Date("2026-06-02T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7f0-${block}-7000-8000-0000000000${tail}`;
};

async function seedUser(container: TestContainer): Promise<UserId> {
  const id = nextId(0x01);
  await container.db.insert(schema.users).values({
    id,
    name: "View Test",
    email: `${id}@example.com`,
    emailVerified: 0,
    image: null,
    createdAt: TZ,
    updatedAt: TZ,
    username: `v-${id.slice(9, 13)}`,
    displayUsername: null,
    role: "member",
    banned: 0,
    banReason: null,
    banExpires: null,
    bio: null,
    avatarMediaId: null,
  });
  return id as UserId;
}

function buildView(id: string, ownerId: UserId, now: Date): SavedView {
  return SavedView.create(
    {
      id,
      ownerId,
      name: SavedViewName.create("Broken View"),
      kind: ViewKind.create("personal"),
      query: ViewQuery.create({
        directoryId: null,
        tagIds: ["t-missing" as TagId],
        dateRange: null,
        keyword: null,
        referencingNoteId: null,
        visibilityFilter: [],
      }),
      displayMode: DisplayMode.create("list"),
      calendarDateKey: CalendarDateKey.create("updated"),
      sort: {
        by: SortBy.create("updatedAt"),
        direction: SortDirection.create("desc"),
      },
    },
    now,
  );
}

describe("D1SavedViewRepository — broken_conditions_json lastSeenName", () => {
  it("round-trips lastSeenName through insert + findById", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const now = new Date(TZ);
    const viewId = nextId(0x02);

    await container.unitOfWorkProvider.run(async ({ savedViewRepository }) => {
      const view = buildView(viewId, owner, now);
      const broken = SavedView.markBroken(
        view,
        [BrokenConditionMarker.tag("t-missing" as TagId, "Research", now)],
        now,
      );
      await savedViewRepository.insert(broken);
    });

    const found = await container.unitOfWorkProvider.run(
      async ({ savedViewRepository }) => savedViewRepository.findById(viewId),
    );

    expect(found).not.toBeNull();
    expect(found?.entity.brokenConditions).toHaveLength(1);
    expect(found?.entity.brokenConditions[0]?.kind).toBe("tag");
    expect(found?.entity.brokenConditions[0]?.id).toBe("t-missing");
    expect(found?.entity.brokenConditions[0]?.lastSeenName).toBe("Research");
  });

  it("decodes a legacy broken_conditions_json row (no lastSeenName) with an empty-string fallback", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const viewId = nextId(0x03);

    // Simulate a row persisted before Issue #405: the marker JSON carries
    // no `lastSeenName` key.
    await container.db.insert(schema.savedViews).values({
      id: viewId,
      ownerId: owner,
      name: "Legacy View",
      kind: "personal",
      queryJson: JSON.stringify({
        directoryId: null,
        tagIds: ["t-missing"],
        dateRange: null,
        keyword: null,
        referencingNoteId: null,
        visibilityFilter: [],
      }),
      displayMode: "list",
      calendarDateKey: "updated",
      sortJson: JSON.stringify({ by: "updatedAt", direction: "desc" }),
      isDefault: 0,
      brokenConditionsJson: JSON.stringify([
        { kind: "tag", id: "t-missing", lastSeenAt: TZ },
      ]),
      version: 0,
      createdAt: TZ,
      updatedAt: TZ,
    });

    const found = await container.unitOfWorkProvider.run(
      async ({ savedViewRepository }) => savedViewRepository.findById(viewId),
    );

    expect(found).not.toBeNull();
    expect(found?.entity.brokenConditions).toHaveLength(1);
    expect(found?.entity.brokenConditions[0]?.lastSeenName).toBe("");
  });
});
