import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { occGuard, outboxEvents, tags } from "../schema";

// Phase-1 hypothesis check: does the `_occ_guard` CHECK-constraint trick
// actually abort an entire D1 batch when an OCC-guarded UPDATE matches
// zero rows?
//
// The deferred-batch UoW design hinges on this. If D1 happens to commit
// the batch despite the CHECK violation (or if `changes()` does not
// reflect the prior statement's row count inside a batch), the whole
// approach is unworkable and we need a different abort mechanism.
//
// These tests pin the contract end-to-end against a real Workers /
// Miniflare D1 binding.

// User fixture seeded via raw SQL so the tags FK constraint is satisfied
// without pulling in the full UoW / repository stack.
const TEST_USER_ID = "0193e7d0-0001-7000-8000-100000000000";
const NOW_ISO = "2026-01-01T00:00:00.000Z";

async function seedUser(db: ReturnType<typeof drizzle>): Promise<void> {
  await db.run(
    sql`INSERT OR IGNORE INTO users (id, name, email, email_verified, created_at, updated_at, username, role, banned)
        VALUES (${TEST_USER_ID}, 'test', 'test@example.com', 0, ${NOW_ISO}, ${NOW_ISO}, 'test', 'member', 0)`,
  );
}

describe("OCC guard via _occ_guard CHECK constraint", () => {
  it("aborts the entire batch when the guarded UPDATE matches zero rows", async () => {
    const db = drizzle(env.DB, { schema: { tags, occGuard } });
    await seedUser(db);

    const now = NOW_ISO;
    await db.insert(tags).values({
      id: "tag-1",
      ownerId: TEST_USER_ID,
      name: "original",
      nameNormalized: "original",
      version: 0,
      createdAt: now,
      updatedAt: now,
    });

    // Stale version: row is at v=0, attempt to advance from v=99 → v=100.
    // The UPDATE will match zero rows, the guard INSERT will violate the
    // CHECK constraint, and the entire batch must roll back.
    const stalePreviousVersion = 99;
    const promise = db.batch([
      db
        .update(tags)
        .set({ name: "should-not-stick", version: 100, updatedAt: now })
        .where(
          sql`${tags.id} = 'tag-1' AND ${tags.version} = ${stalePreviousVersion}`,
        ),
      db.run(
        sql`INSERT INTO _occ_guard (n) SELECT changes() WHERE changes() = 0`,
      ),
    ]);

    await expect(promise).rejects.toThrow();

    // Row must be untouched. If the batch silently succeeded despite the
    // UPDATE matching zero rows, this read would still see v=0 / "original"
    // — which is the same observation, so we also assert the row count
    // and the absence of stray guard rows below.
    const rows = await db.select().from(tags);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "tag-1",
      name: "original",
      version: 0,
    });

    // The guard INSERT must have rolled back too — no stray rows.
    const guardRows = await db.select().from(occGuard);
    expect(guardRows).toHaveLength(0);
  });

  it("commits the batch when the guarded UPDATE matches a row", async () => {
    const db = drizzle(env.DB, { schema: { tags, occGuard } });
    await seedUser(db);

    const now = NOW_ISO;
    await db.insert(tags).values({
      id: "tag-2",
      ownerId: TEST_USER_ID,
      name: "original",
      nameNormalized: "original",
      version: 0,
      createdAt: now,
      updatedAt: now,
    });

    // Matching version → UPDATE touches 1 row → guard SELECT yields no
    // rows → INSERT is a no-op → batch commits cleanly with the guard
    // table left empty.
    await db.batch([
      db
        .update(tags)
        .set({
          name: "updated",
          nameNormalized: "updated",
          version: 1,
          updatedAt: now,
        })
        .where(sql`${tags.id} = 'tag-2' AND ${tags.version} = 0`),
      db.run(
        sql`INSERT INTO _occ_guard (n) SELECT changes() WHERE changes() = 0`,
      ),
    ]);

    const rows = await db.select().from(tags);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "tag-2",
      name: "updated",
      version: 1,
    });

    const guardRows = await db.select().from(occGuard);
    expect(guardRows).toHaveLength(0);
  });

  it("rolls back co-batched INSERTs when a later OCC-guarded UPDATE fails", async () => {
    const db = drizzle(env.DB, { schema: { tags, occGuard } });
    await seedUser(db);

    const now = NOW_ISO;
    await db.insert(tags).values({
      id: "tag-3",
      ownerId: TEST_USER_ID,
      name: "original",
      nameNormalized: "original",
      version: 0,
      createdAt: now,
      updatedAt: now,
    });

    // Simulates: aggregate save (UPDATE with stale version) plus an
    // outbox event INSERT in the same batch. The outbox row must NOT
    // be persisted when the OCC check fails — this is the property
    // that makes "writes ⇔ outbox" atomicity hold under D1.
    const promise = db.batch([
      db.insert(outboxEvents).values({
        id: "evt-1",
        eventType: "tag.deleted",
        aggregateId: "tag-3",
        payload: {},
        occurredAt: new Date(0),
        createdAt: new Date(0),
      }),
      db
        .update(tags)
        .set({ name: "should-not-stick", version: 100, updatedAt: now })
        .where(sql`${tags.id} = 'tag-3' AND ${tags.version} = 99`),
      db.run(
        sql`INSERT INTO _occ_guard (n) SELECT changes() WHERE changes() = 0`,
      ),
    ]);

    await expect(promise).rejects.toThrow();

    const outboxRows = await db.select().from(outboxEvents);
    expect(outboxRows).toHaveLength(0);
  });
});
