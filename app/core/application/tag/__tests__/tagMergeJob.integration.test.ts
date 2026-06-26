import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import { isNotFoundError } from "@/core/application/errors";
import { isBusinessRuleError } from "@/core/domain/error";
import { TagMergeJobErrorCode } from "@/core/domain/tag/mergeJob/errorCode";
import {
  setupTestContainer,
  type TestContainer,
} from "../../__tests__/helpers";
import type { UnitOfWorkProvider } from "../../execution/unitOfWork";
import { enqueueTagMergeJob } from "../enqueueTagMergeJob";
import { getTagMergeJob } from "../getTagMergeJob";
import { runTagMergeJob } from "../runTagMergeJob";

const baseTime = new Date("2026-01-01T00:00:00.000Z");
const iso = (ms: number) => new Date(baseTime.getTime() + ms).toISOString();

const OWNER_A = "01950000-0000-7000-8000-00000000000a";
const OWNER_B = "01950000-0000-7000-8000-00000000000b";

const tagRawId = (n: number) =>
  `019d7000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const noteRawId = (n: number) =>
  `019d0000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const dirRawId = (n: number) =>
  `019dd000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const jobRawId = (n: number) =>
  `019d8000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;

async function seedUser(
  container: TestContainer,
  id: string,
  username: string,
) {
  await container.db.insert(schema.users).values({
    id,
    name: username,
    email: `${username}@example.com`,
    emailVerified: 1,
    createdAt: iso(0),
    updatedAt: iso(0),
    username,
    role: "member",
    banned: 0,
  });
}

async function seedDirectory(
  container: TestContainer,
  id: string,
  ownerId: string,
) {
  await container.db.insert(schema.directories).values({
    id,
    ownerId,
    parentId: null,
    name: "root",
    slug: `root-${id.slice(-6)}`,
    depth: 0,
    version: 0,
    createdAt: iso(0),
    updatedAt: iso(0),
  });
}

async function seedTag(
  container: TestContainer,
  id: string,
  ownerId: string,
  name: string,
) {
  await container.db.insert(schema.tags).values({
    id,
    ownerId,
    name,
    nameNormalized: name,
    version: 0,
    createdAt: iso(0),
    updatedAt: iso(0),
  });
}

async function seedNote(
  container: TestContainer,
  params: {
    id: string;
    ownerId: string;
    directoryId: string;
    tagIds?: readonly string[];
  },
) {
  await container.db.insert(schema.notes).values({
    id: params.id,
    ownerId: params.ownerId,
    directoryId: params.directoryId,
    slug: `note-${params.id.slice(-6)}`,
    title: "n",
    contentHtml: "body",
    frontMatterJson: "{}",
    status: "active",
    trashedAt: null,
    createdAt: iso(0),
    updatedAt: iso(0),
    editLockUserId: null,
    editLockAcquiredAt: null,
    editLockExpiresAt: null,
    version: 0,
  });
  for (const tagId of params.tagIds ?? []) {
    await container.db
      .insert(schema.noteTags)
      .values({ noteId: params.id, tagId });
  }
}

describe("runTagMergeJob — progress & idempotency", () => {
  const getContainer = setupTestContainer();

  it("counts every inspected note toward progress across several notes", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");
    await seedDirectory(container, dirRawId(1), OWNER_A);
    const sourceId = tagRawId(1);
    const targetId = tagRawId(2);
    await seedTag(container, sourceId, OWNER_A, "src");
    await seedTag(container, targetId, OWNER_A, "tgt");
    for (let i = 0; i < 3; i++) {
      await seedNote(container, {
        id: noteRawId(i + 1),
        ownerId: OWNER_A,
        directoryId: dirRawId(1),
        tagIds: [sourceId],
      });
    }

    const { job } = await enqueueTagMergeJob({
      container,
      input: {
        actorUserId: OWNER_A,
        sourceTagId: sourceId,
        targetTagId: targetId,
      },
    });
    const run = await runTagMergeJob({ container, input: { jobId: job.id } });

    expect(run.job?.status).toBe("completed");
    expect(run.job?.progress).toEqual({ processed: 3, total: 3 });
    const noteTagsAfter = await container.db.select().from(schema.noteTags);
    expect(noteTagsAfter.every((r) => r.tagId === targetId)).toBe(true);
    expect(noteTagsAfter).toHaveLength(3);
  });

  it("advances progress across multiple batches, persisting intermediate values (AC-2)", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");
    await seedDirectory(container, dirRawId(1), OWNER_A);
    const sourceId = tagRawId(1);
    const targetId = tagRawId(2);
    await seedTag(container, sourceId, OWNER_A, "src");
    await seedTag(container, targetId, OWNER_A, "tgt");
    const NOTE_COUNT = 5;
    for (let i = 0; i < NOTE_COUNT; i++) {
      await seedNote(container, {
        id: noteRawId(i + 1),
        ownerId: OWNER_A,
        directoryId: dirRawId(1),
        tagIds: [sourceId],
      });
    }

    const { job } = await enqueueTagMergeJob({
      container,
      input: {
        actorUserId: OWNER_A,
        sourceTagId: sourceId,
        targetTagId: targetId,
      },
    });

    // Observe the committed `progress_processed` after each UoW boundary by
    // wrapping the real provider — the D1 UoW underneath still does all the
    // work, so this is an observation decorator, not an in-memory fake.
    const committed: number[] = [];
    const realProvider = container.unitOfWorkProvider;
    const observing: UnitOfWorkProvider = {
      async run(fn) {
        const result = await realProvider.run(fn);
        const rows = await container.db
          .select()
          .from(schema.tagMergeJobs)
          .where(eq(schema.tagMergeJobs.id, job.id));
        const row = rows[0];
        if (row) committed.push(row.progressProcessed);
        return result;
      },
    };

    // pageSize 2 over 5 notes → 3 processing batches that each commit
    // independently, so progress walks 2 → 4 → 5 instead of jumping to 5.
    const run = await runTagMergeJob({
      container: { ...container, unitOfWorkProvider: observing },
      input: { jobId: job.id, pageSize: 2 },
    });

    expect(run.job?.status).toBe("completed");
    expect(run.job?.progress).toEqual({ processed: 5, total: 5 });

    // Intermediate progress rows (0 < processed < total) were persisted —
    // the determinate bar advanced through the middle, not just to 100%.
    const intermediates = committed.filter((p) => p > 0 && p < NOTE_COUNT);
    expect(intermediates).toContain(2);
    expect(intermediates).toContain(4);
    // Each batch committed forward only — progress never regressed.
    for (let i = 1; i < committed.length; i++) {
      expect(committed[i]).toBeGreaterThanOrEqual(committed[i - 1] ?? 0);
    }
    // Final state reaches total across the batch boundary.
    expect(committed.at(-1)).toBe(NOTE_COUNT);

    const noteTagsAfter = await container.db.select().from(schema.noteTags);
    expect(noteTagsAfter).toHaveLength(NOTE_COUNT);
    expect(noteTagsAfter.every((r) => r.tagId === targetId)).toBe(true);
  });

  it("resumes a crashed processing job across multiple batches, advancing forward only", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");
    await seedDirectory(container, dirRawId(1), OWNER_A);
    const sourceId = tagRawId(1);
    const targetId = tagRawId(2);
    await seedTag(container, sourceId, OWNER_A, "src");
    await seedTag(container, targetId, OWNER_A, "tgt");
    // note1 was merged before the crash (carries target); note2-5 still
    // carry source. total was fixed at 5, processed at 1 mid-flight.
    await seedNote(container, {
      id: noteRawId(1),
      ownerId: OWNER_A,
      directoryId: dirRawId(1),
      tagIds: [targetId],
    });
    for (let i = 2; i <= 5; i++) {
      await seedNote(container, {
        id: noteRawId(i),
        ownerId: OWNER_A,
        directoryId: dirRawId(1),
        tagIds: [sourceId],
      });
    }

    const jobId = jobRawId(1);
    await container.db.insert(schema.tagMergeJobs).values({
      id: jobId,
      ownerId: OWNER_A,
      sourceTagId: sourceId,
      targetTagId: targetId,
      status: "processing",
      progressProcessed: 1,
      progressTotal: 5,
      affectedNoteIdsJson: "[]",
      errorCode: null,
      errorReason: null,
      version: 1,
      createdAt: iso(0),
      updatedAt: iso(0),
      completedAt: null,
    });

    const committed: number[] = [];
    const realProvider = container.unitOfWorkProvider;
    const observing: UnitOfWorkProvider = {
      async run(fn) {
        const result = await realProvider.run(fn);
        const rows = await container.db
          .select()
          .from(schema.tagMergeJobs)
          .where(eq(schema.tagMergeJobs.id, jobId));
        const row = rows[0];
        if (row) committed.push(row.progressProcessed);
        return result;
      },
    };

    // 4 remaining notes, pageSize 2 → 2 resume batches.
    const run = await runTagMergeJob({
      container: { ...container, unitOfWorkProvider: observing },
      input: { jobId, pageSize: 2 },
    });

    expect(run.job?.status).toBe("completed");
    // Total preserved (not re-seeded to remaining 4); processed reaches it.
    expect(run.job?.progress).toEqual({ processed: 5, total: 5 });
    // Never dropped below the persisted starting processed of 1.
    expect(Math.min(...committed)).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < committed.length; i++) {
      expect(committed[i]).toBeGreaterThanOrEqual(committed[i - 1] ?? 0);
    }
    const noteTagsAfter = await container.db.select().from(schema.noteTags);
    expect(noteTagsAfter.every((r) => r.tagId === targetId)).toBe(true);
  });

  it("fails the job when note processing throws (status=failed with errorReason) (AC-6)", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");
    await seedDirectory(container, dirRawId(1), OWNER_A);
    const sourceId = tagRawId(1);
    const targetId = tagRawId(2);
    // Source tag exists (the note's note_tags row needs it for its FK).
    // Target tag is intentionally NOT created, so rewriting the note onto
    // it violates the note_tags → tags(id) foreign key when the batch's UoW
    // commits — a real, non-conflict/non-notfound failure that the runner's
    // catch must turn into a `failed` job.
    await seedTag(container, sourceId, OWNER_A, "src");
    await seedNote(container, {
      id: noteRawId(1),
      ownerId: OWNER_A,
      directoryId: dirRawId(1),
      tagIds: [sourceId],
    });

    const jobId = jobRawId(1);
    await container.db.insert(schema.tagMergeJobs).values({
      id: jobId,
      ownerId: OWNER_A,
      sourceTagId: sourceId,
      targetTagId: targetId,
      status: "pending",
      progressProcessed: 0,
      progressTotal: 0,
      affectedNoteIdsJson: "[]",
      errorCode: null,
      errorReason: null,
      version: 0,
      createdAt: iso(0),
      updatedAt: iso(0),
      completedAt: null,
    });

    const run = await runTagMergeJob({ container, input: { jobId } });

    expect(run.job?.status).toBe("failed");
    expect(run.job?.errorReason).toBeTruthy();
    const rows = await container.db
      .select()
      .from(schema.tagMergeJobs)
      .where(eq(schema.tagMergeJobs.id, jobId));
    expect(rows[0]?.status).toBe("failed");
    expect(rows[0]?.errorCode).toBe("tag_merge_run_failed");
    expect(rows[0]?.errorReason).toBeTruthy();
  });

  it("re-running a completed job is a no-op (idempotent)", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");
    await seedDirectory(container, dirRawId(1), OWNER_A);
    const sourceId = tagRawId(1);
    const targetId = tagRawId(2);
    await seedTag(container, sourceId, OWNER_A, "src");
    await seedTag(container, targetId, OWNER_A, "tgt");
    await seedNote(container, {
      id: noteRawId(1),
      ownerId: OWNER_A,
      directoryId: dirRawId(1),
      tagIds: [sourceId],
    });

    const { job } = await enqueueTagMergeJob({
      container,
      input: {
        actorUserId: OWNER_A,
        sourceTagId: sourceId,
        targetTagId: targetId,
      },
    });
    await runTagMergeJob({ container, input: { jobId: job.id } });
    const second = await runTagMergeJob({
      container,
      input: { jobId: job.id },
    });

    expect(second.job?.status).toBe("completed");
    const tagsAfter = await container.db.select().from(schema.tags);
    expect(tagsAfter).toHaveLength(1);
    expect(tagsAfter[0]?.id).toBe(targetId);
  });

  it("resumes a crashed processing job without re-seeding the total or going backward", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");
    await seedDirectory(container, dirRawId(1), OWNER_A);
    const sourceId = tagRawId(1);
    const targetId = tagRawId(2);
    await seedTag(container, sourceId, OWNER_A, "src");
    await seedTag(container, targetId, OWNER_A, "tgt");
    // note1 was already merged before the crash (carries only target);
    // note2 / note3 still carry source.
    await seedNote(container, {
      id: noteRawId(1),
      ownerId: OWNER_A,
      directoryId: dirRawId(1),
      tagIds: [targetId],
    });
    await seedNote(container, {
      id: noteRawId(2),
      ownerId: OWNER_A,
      directoryId: dirRawId(1),
      tagIds: [sourceId],
    });
    await seedNote(container, {
      id: noteRawId(3),
      ownerId: OWNER_A,
      directoryId: dirRawId(1),
      tagIds: [sourceId],
    });

    // Persist a processing job mid-flight: total fixed at 3, processed 1.
    const jobId = jobRawId(1);
    await container.db.insert(schema.tagMergeJobs).values({
      id: jobId,
      ownerId: OWNER_A,
      sourceTagId: sourceId,
      targetTagId: targetId,
      status: "processing",
      progressProcessed: 1,
      progressTotal: 3,
      affectedNoteIdsJson: "[]",
      errorCode: null,
      errorReason: null,
      version: 1,
      createdAt: iso(0),
      updatedAt: iso(0),
      completedAt: null,
    });

    const run = await runTagMergeJob({ container, input: { jobId } });

    expect(run.job?.status).toBe("completed");
    // Total preserved (not re-seeded to the remaining 2); processed reaches it.
    expect(run.job?.progress).toEqual({ processed: 3, total: 3 });
    const tagsAfter = await container.db.select().from(schema.tags);
    expect(tagsAfter.map((t) => t.id)).toEqual([targetId]);
    const noteTagsAfter = await container.db.select().from(schema.noteTags);
    expect(noteTagsAfter.every((r) => r.tagId === targetId)).toBe(true);
  });

  it("completes idempotently when the source tag was already deleted by a twin run", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");
    await seedDirectory(container, dirRawId(1), OWNER_A);
    const sourceId = tagRawId(1);
    const targetId = tagRawId(2);
    // Twin already completed: source tag deleted, the note carries target.
    await seedTag(container, targetId, OWNER_A, "tgt");
    await seedNote(container, {
      id: noteRawId(1),
      ownerId: OWNER_A,
      directoryId: dirRawId(1),
      tagIds: [targetId],
    });

    // A pending job that still references the now-deleted source tag.
    const jobId = jobRawId(2);
    await container.db.insert(schema.tagMergeJobs).values({
      id: jobId,
      ownerId: OWNER_A,
      sourceTagId: sourceId,
      targetTagId: targetId,
      status: "pending",
      progressProcessed: 0,
      progressTotal: 0,
      affectedNoteIdsJson: "[]",
      errorCode: null,
      errorReason: null,
      version: 0,
      createdAt: iso(0),
      updatedAt: iso(0),
      completedAt: null,
    });

    const run = await runTagMergeJob({ container, input: { jobId } });

    // Not failed: the merge is effectively done, so the job completes.
    expect(run.job?.status).toBe("completed");
  });
});

describe("getTagMergeJob — ownership", () => {
  const getContainer = setupTestContainer();

  it("returns the job for its owner and rejects another owner (IDOR)", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");
    await seedUser(container, OWNER_B, "beta");
    const sourceId = tagRawId(1);
    const targetId = tagRawId(2);
    await seedTag(container, sourceId, OWNER_A, "src");
    await seedTag(container, targetId, OWNER_A, "tgt");

    const { job } = await enqueueTagMergeJob({
      container,
      input: {
        actorUserId: OWNER_A,
        sourceTagId: sourceId,
        targetTagId: targetId,
      },
    });

    const owned = await getTagMergeJob({
      container,
      input: { actorUserId: OWNER_A, jobId: job.id },
    });
    expect(owned.job.id).toBe(job.id);
    expect(owned.job.status).toBe("pending");

    try {
      await getTagMergeJob({
        container,
        input: { actorUserId: OWNER_B, jobId: job.id },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(TagMergeJobErrorCode.Unauthorized);
      }
    }
  });

  it("throws NotFound for a jobId that does not exist (pruned/poll race)", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");

    // No job row is inserted: the `findById` lookup returns null before the
    // ownership check runs, so the absence — not the actor — is the verdict.
    // This guards the path a poller hits after a completed job is pruned.
    try {
      await getTagMergeJob({
        container,
        input: { actorUserId: OWNER_A, jobId: jobRawId(99) },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isNotFoundError(error)).toBe(true);
      if (isNotFoundError(error)) {
        expect(error.code).toBe("TAG_MERGE_JOB_NOT_FOUND");
      }
    }
  });
});
