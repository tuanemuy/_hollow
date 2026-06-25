import { describe, expect, it } from "vitest";
import { isConflictError } from "@/core/application/errors";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { TagMergeJob } from "@/core/domain/tag/mergeJob/entity";
import type { TagId } from "@/core/domain/tag/valueObject";
import * as schema from "../schema";
import { createTestContainer, type TestContainer } from "./helpers";

const TZ = new Date("2026-03-01T00:00:00.000Z").toISOString();

async function seedUser(container: TestContainer, id: string): Promise<UserId> {
  await container.db.insert(schema.users).values({
    id,
    name: "Merge Test",
    email: `${id}@example.com`,
    emailVerified: 0,
    createdAt: TZ,
    updatedAt: TZ,
    username: `m-${id.slice(-6)}`,
    role: "member",
    banned: 0,
  });
  return id as UserId;
}

const OWNER = "01950000-0000-7000-8000-00000000000a";
const SOURCE = "019d7000-0000-7000-8000-000000000001" as unknown as TagId;
const TARGET = "019d7000-0000-7000-8000-000000000002" as unknown as TagId;

async function insertPendingJob(
  container: TestContainer,
  ownerId: UserId,
): Promise<string> {
  const id = container.idGenerator.next();
  const now = container.clock.now();
  await container.unitOfWorkProvider.run(
    async ({ tagMergeJobRepository, collectEvents }) => {
      const { entity, eventDrafts } = TagMergeJob.create(
        { id, ownerId, sourceTagId: SOURCE, targetTagId: TARGET },
        now,
      );
      await tagMergeJobRepository.insert(entity);
      collectEvents(eventDrafts);
    },
  );
  return id;
}

describe("D1TagMergeJobRepository integration", () => {
  it("round-trips affectedNoteIds JSON through complete", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container, OWNER);
    const id = await insertPendingJob(container, owner);
    const noteId = "019d0000-0000-7000-8000-000000000001" as unknown as NoteId;

    await container.unitOfWorkProvider.run(
      async ({ tagMergeJobRepository }) => {
        const found = await tagMergeJobRepository.findById(id);
        if (found === null || !TagMergeJob.isPending(found.entity)) {
          throw new Error("not pending");
        }
        const started = TagMergeJob.startProcessing(
          found.entity,
          1,
          container.clock.now(),
        );
        await tagMergeJobRepository.save(started, found.expectedVersion);
      },
    );
    await container.unitOfWorkProvider.run(
      async ({ tagMergeJobRepository }) => {
        const found = await tagMergeJobRepository.findById(id);
        if (found === null || !TagMergeJob.isProcessing(found.entity)) {
          throw new Error("not processing");
        }
        const completed = TagMergeJob.complete(
          found.entity,
          [noteId],
          container.clock.now(),
        );
        await tagMergeJobRepository.save(completed, found.expectedVersion);
      },
    );

    const reread = await container.unitOfWorkProvider.run(
      ({ tagMergeJobRepository }) => tagMergeJobRepository.findById(id),
    );
    expect(reread?.entity.status).toBe("completed");
    if (reread !== null && TagMergeJob.isCompleted(reread.entity)) {
      expect(reread.entity.affectedNoteIds).toEqual([noteId]);
    }
  });

  it("raises a ConflictError on a stale-version save (OCC)", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container, OWNER);
    const id = await insertPendingJob(container, owner);

    // Capture a stale v0 token.
    const stale = await container.unitOfWorkProvider.run(
      ({ tagMergeJobRepository }) => tagMergeJobRepository.findById(id),
    );
    if (stale === null || !TagMergeJob.isPending(stale.entity)) {
      throw new Error("not pending");
    }
    const stalePending = stale.entity;

    // Advance the row to v1.
    await container.unitOfWorkProvider.run(
      async ({ tagMergeJobRepository }) => {
        const found = await tagMergeJobRepository.findById(id);
        if (found === null || !TagMergeJob.isPending(found.entity)) {
          throw new Error("not pending");
        }
        const started = TagMergeJob.startProcessing(
          found.entity,
          5,
          container.clock.now(),
        );
        await tagMergeJobRepository.save(started, found.expectedVersion);
      },
    );

    // The stale token now mismatches → OCC conflict.
    let caught: unknown = null;
    try {
      await container.unitOfWorkProvider.run(
        async ({ tagMergeJobRepository }) => {
          const started = TagMergeJob.startProcessing(
            stalePending,
            3,
            container.clock.now(),
          );
          await tagMergeJobRepository.save(started, stale.expectedVersion);
        },
      );
    } catch (error) {
      caught = error;
    }
    expect(isConflictError(caught)).toBe(true);
  });

  it("returns null for a missing job", async () => {
    const container = createTestContainer();
    const found = await container.unitOfWorkProvider.run(
      ({ tagMergeJobRepository }) =>
        tagMergeJobRepository.findById("019d8000-0000-7000-8000-0000000000ff"),
    );
    expect(found).toBeNull();
  });
});
