import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { isConflictError } from "@/core/application/errors";
import { UserId } from "@/core/domain/identity/valueObject";
import { Tag } from "@/core/domain/tag/entity";
import { TagEvents } from "@/core/domain/tag/events";
import { TagId, TagName } from "@/core/domain/tag/valueObject";
import * as schema from "../schema";
import { createTestContainer } from "./helpers";

// Drives the deferred-batch contract end to end: writes don't materialize
// until `run()` returns, outbox events ride the same atomic flush, and an
// OCC failure from any participating write rolls everything back —
// aggregate AND outbox.

// User fixture seeded via raw SQL so the tags FK constraint is satisfied
// without pulling in the full UoW / repository stack.
const TEST_USER_ID = UserId.create("0193e7d0-0002-7000-8000-100000000000");
const NOW_ISO = "2026-01-01T00:00:00.000Z";

describe("D1UnitOfWorkProvider (integration)", () => {
  const NOW = new Date("2026-01-01T00:00:00.000Z");
  let counter = 0;
  const nextTagId = () => {
    counter += 1;
    return TagId.create(
      `0193e7d0-${counter.toString(16).padStart(4, "0")}-7000-8000-200000000000`,
    );
  };
  const nextTagName = (suffix: number) => TagName.create(`tag-${suffix}`);

  async function seedUser(
    container: ReturnType<typeof createTestContainer>,
  ): Promise<void> {
    await container.db.run(
      sql`INSERT OR IGNORE INTO users (id, name, email, email_verified, created_at, updated_at, username, role, banned)
          VALUES (${TEST_USER_ID}, 'test', 'test@example.com', 0, ${NOW_ISO}, ${NOW_ISO}, 'test', 'member', 0)`,
    );
  }

  it("defers all writes until run() resolves (no row visible mid-callback)", async () => {
    const container = createTestContainer();
    await seedUser(container);
    const tagId = nextTagId();
    const tag = Tag.create(
      { id: tagId, ownerId: TEST_USER_ID, name: nextTagName(counter) },
      NOW,
    );

    let midRunRows: unknown[] = [];
    await container.unitOfWorkProvider.run(async ({ tagRepository }) => {
      await tagRepository.insert(tag);
      // Side-channel read against the binding directly: the batch has
      // not been flushed yet, so the row must not be visible.
      midRunRows = await container.db.select().from(schema.tags);
    });

    expect(midRunRows).toHaveLength(0);

    const afterRows = await container.db.select().from(schema.tags);
    expect(afterRows).toHaveLength(1);
  });

  it("persists collected outbox events atomically with the aggregate write", async () => {
    const container = createTestContainer();
    await seedUser(container);
    const tagId = nextTagId();
    const tag = Tag.create(
      { id: tagId, ownerId: TEST_USER_ID, name: nextTagName(counter) },
      NOW,
    );

    await container.unitOfWorkProvider.run(
      async ({ tagRepository, collectEvents }) => {
        await tagRepository.insert(tag);
        collectEvents([TagEvents.deleted(tagId, NOW)]);
      },
    );

    const tagRows = await container.db.select().from(schema.tags);
    const outboxRows = await container.db.select().from(schema.outboxEvents);
    expect(tagRows).toHaveLength(1);
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0]?.eventType).toBe("tag.deleted");
    expect(outboxRows[0]?.aggregateId).toBe(tagId);
  });

  it("rolls back outbox events when the aggregate write hits an OCC failure", async () => {
    const container = createTestContainer();
    await seedUser(container);
    const tagId = nextTagId();
    const tag = Tag.create(
      { id: tagId, ownerId: TEST_USER_ID, name: nextTagName(counter) },
      NOW,
    );
    await container.unitOfWorkProvider.run(async ({ tagRepository }) => {
      await tagRepository.insert(tag);
    });

    // Capture v=0 token, advance the row to v=1 by renaming, then re-use
    // the stale token together with `collectEvents`. The OCC guard must
    // abort the batch, reverting both the would-be UPDATE and the outbox INSERT.
    const found = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) => tagRepository.findById(tagId),
    );
    if (!found) return;
    const renamed = Tag.rename(found.entity, TagName.create("renamed"), NOW);
    await container.unitOfWorkProvider.run(async ({ tagRepository }) => {
      await tagRepository.save(renamed, found.expectedVersion);
    });
    // Row is now at v=1; `found.expectedVersion` is stale.

    let caught: unknown;
    try {
      await container.unitOfWorkProvider.run(
        async ({ tagRepository, collectEvents }) => {
          await tagRepository.save(renamed, found.expectedVersion);
          collectEvents([TagEvents.deleted(tagId, NOW)]);
        },
      );
    } catch (error) {
      caught = error;
    }
    expect(isConflictError(caught)).toBe(true);

    // Neither prior UoW collected events (only the inserts ran), so the
    // outbox must be empty — the failing UoW's `collectEvents` was rolled
    // back along with its UPDATE.
    const outboxRows = await container.db.select().from(schema.outboxEvents);
    expect(outboxRows).toHaveLength(0);
  });

  it("returns the callback's value on successful commit", async () => {
    const container = createTestContainer();
    await seedUser(container);
    const tagId = nextTagId();
    const tag = Tag.create(
      { id: tagId, ownerId: TEST_USER_ID, name: nextTagName(counter) },
      NOW,
    );

    const id = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) => {
        await tagRepository.insert(tag);
        return tag.id;
      },
    );
    expect(id).toBe(tag.id);
  });

  it("supports a read-only UoW (no writes / no batch flush)", async () => {
    const container = createTestContainer();
    const result = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.findById("nonexistent-id" as TagId),
    );
    expect(result).toBeNull();
  });
});
