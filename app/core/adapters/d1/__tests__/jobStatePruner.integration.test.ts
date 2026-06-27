import { describe, expect, it } from "vitest";
import { D1JobStatePruner } from "../repositories/jobStatePruner";
import * as schema from "../schema";
import { createTestContainer, type TestContainer } from "./helpers";

/**
 * Real-D1 integration for `D1JobStatePruner` (Issue #783).
 *
 * Seeds rows at each status and `updated_at` age directly (bypassing the
 * aggregate repositories, which is the point — the pruner is a
 * non-transactional bulk DELETE) and pins the terminal-filter boundary:
 *
 * - tag_merge: old `completed` / `failed` deleted; recent terminal kept;
 *   old `pending` / `processing` kept.
 * - export: old `failed` / `cancelled` / `expired` deleted; old
 *   `completed` **kept** (live artifact, ADR-003); recent terminal kept;
 *   old `pending` / `processing` kept.
 * - The returned `{ deleted }` count matches the rows removed.
 */

const OWNER = "01950000-0000-7000-8000-0000000007a3";
const CUTOFF = new Date("2026-06-20T00:00:00.000Z");
const OLD = "2026-06-10T00:00:00.000Z"; // before cutoff
const RECENT = "2026-06-25T00:00:00.000Z"; // after cutoff

async function seedOwner(container: TestContainer): Promise<void> {
  await container.db.insert(schema.users).values({
    id: OWNER,
    name: "Prune Test",
    email: `${OWNER}@example.com`,
    emailVerified: 0,
    createdAt: OLD,
    updatedAt: OLD,
    username: `p-${OWNER.slice(-6)}`,
    role: "member",
    banned: 0,
  });
}

let exportSeq = 0;
async function seedExportJob(
  container: TestContainer,
  status: string,
  updatedAt: string,
): Promise<string> {
  exportSeq += 1;
  const id = `019d1000-0000-7000-8000-${exportSeq.toString(16).padStart(12, "0")}`;
  await container.db.insert(schema.exportJobs).values({
    id,
    ownerId: OWNER,
    format: "html",
    scope: "single",
    optionsJson: "{}",
    status,
    // `completed`/`expired` carry an artifact in production; seed one so a
    // regression that prunes `completed` would visibly orphan it.
    artifactKey:
      status === "completed" || status === "expired"
        ? `${OWNER}/export/${id}`
        : null,
    createdAt: OLD,
    updatedAt,
  });
  return id;
}

let mergeSeq = 0;
async function seedTagMergeJob(
  container: TestContainer,
  status: string,
  updatedAt: string,
): Promise<string> {
  mergeSeq += 1;
  const id = `019d2000-0000-7000-8000-${mergeSeq.toString(16).padStart(12, "0")}`;
  await container.db.insert(schema.tagMergeJobs).values({
    id,
    ownerId: OWNER,
    sourceTagId: "019d3000-0000-7000-8000-000000000001",
    targetTagId: "019d3000-0000-7000-8000-000000000002",
    status,
    createdAt: OLD,
    updatedAt,
  });
  return id;
}

async function remainingExportIds(container: TestContainer): Promise<string[]> {
  const rows = await container.db
    .select({ id: schema.exportJobs.id })
    .from(schema.exportJobs);
  return rows.map((r) => r.id);
}

async function remainingTagMergeIds(
  container: TestContainer,
): Promise<string[]> {
  const rows = await container.db
    .select({ id: schema.tagMergeJobs.id })
    .from(schema.tagMergeJobs);
  return rows.map((r) => r.id);
}

describe("D1JobStatePruner integration", () => {
  describe("pruneTerminalTagMergeJobs", () => {
    it("deletes old completed/failed, keeps recent terminal and old non-terminal", async () => {
      const container = createTestContainer();
      await seedOwner(container);
      const pruner = new D1JobStatePruner(container.db);

      const oldCompleted = await seedTagMergeJob(container, "completed", OLD);
      const oldFailed = await seedTagMergeJob(container, "failed", OLD);
      const recentCompleted = await seedTagMergeJob(
        container,
        "completed",
        RECENT,
      );
      const oldPending = await seedTagMergeJob(container, "pending", OLD);
      const oldProcessing = await seedTagMergeJob(container, "processing", OLD);

      const { deleted } = await pruner.pruneTerminalTagMergeJobs(CUTOFF);

      expect(deleted).toBe(2);
      const remaining = await remainingTagMergeIds(container);
      expect(remaining.sort()).toEqual(
        [recentCompleted, oldPending, oldProcessing].sort(),
      );
      expect(remaining).not.toContain(oldCompleted);
      expect(remaining).not.toContain(oldFailed);
    });

    it("is a no-op when nothing is past the cutoff", async () => {
      const container = createTestContainer();
      await seedOwner(container);
      const pruner = new D1JobStatePruner(container.db);
      await seedTagMergeJob(container, "completed", RECENT);

      const { deleted } = await pruner.pruneTerminalTagMergeJobs(CUTOFF);
      expect(deleted).toBe(0);
      expect(await remainingTagMergeIds(container)).toHaveLength(1);
    });
  });

  describe("pruneTerminalExportJobs", () => {
    it("deletes old failed/cancelled/expired, keeps old completed and recent/non-terminal", async () => {
      const container = createTestContainer();
      await seedOwner(container);
      const pruner = new D1JobStatePruner(container.db);

      const oldFailed = await seedExportJob(container, "failed", OLD);
      const oldCancelled = await seedExportJob(container, "cancelled", OLD);
      const oldExpired = await seedExportJob(container, "expired", OLD);
      const oldCompleted = await seedExportJob(container, "completed", OLD);
      const recentFailed = await seedExportJob(container, "failed", RECENT);
      const oldPending = await seedExportJob(container, "pending", OLD);
      const oldProcessing = await seedExportJob(container, "processing", OLD);

      const { deleted } = await pruner.pruneTerminalExportJobs(CUTOFF);

      expect(deleted).toBe(3);
      const remaining = await remainingExportIds(container);
      // `completed` is excluded by the predicate however old it is, so its
      // live artifact is never orphaned (ADR-003).
      expect(remaining.sort()).toEqual(
        [oldCompleted, recentFailed, oldPending, oldProcessing].sort(),
      );
      expect(remaining).not.toContain(oldFailed);
      expect(remaining).not.toContain(oldCancelled);
      expect(remaining).not.toContain(oldExpired);
    });

    it("keeps an old completed export regardless of age", async () => {
      const container = createTestContainer();
      await seedOwner(container);
      const pruner = new D1JobStatePruner(container.db);
      const veryOld = "2020-01-01T00:00:00.000Z";
      const id = await seedExportJob(container, "completed", veryOld);

      const { deleted } = await pruner.pruneTerminalExportJobs(CUTOFF);
      expect(deleted).toBe(0);
      expect(await remainingExportIds(container)).toEqual([id]);
    });
  });
});
