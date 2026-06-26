import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import { TagMergeJob } from "../entity";
import { TagMergeJobErrorCode } from "../errorCode";

const T0 = new Date(0);
const at = (ms: number) => new Date(T0.getTime() + ms);

const ID_BASE = "00000000-0000-7000-8000-";
const rawId = (n: number) => `${ID_BASE}${n.toString(16).padStart(12, "0")}`;
const owner = (n: number): UserId => UserId.create(`owner-${n}`);
const tag = (n: number): TagId => rawId(n + 100) as unknown as TagId;
const note = (n: number): NoteId => rawId(n + 1000) as unknown as NoteId;

const createInput = (n = 1) => ({
  id: rawId(n),
  ownerId: owner(n),
  sourceTagId: tag(1),
  targetTagId: tag(2),
});

describe("TagMergeJob.create", () => {
  it("produces a pending job at 0/0 and emits tag.merge.requested", () => {
    const { entity, eventDrafts } = TagMergeJob.create(createInput(1), T0);
    expect(entity.status).toBe("pending");
    expect(entity.progress).toEqual({ processed: 0, total: 0 });
    expect(entity.affectedNoteIds).toBeNull();
    expect(entity.version as unknown as number).toBe(0);
    expect(eventDrafts).toHaveLength(1);
    expect(eventDrafts[0]?.type).toBe("tag.merge.requested");
    expect(eventDrafts[0]?.payload).toEqual({ jobId: entity.id });
  });
});

describe("TagMergeJob lifecycle", () => {
  it("startProcessing (pending-only) seeds the total and advances version", () => {
    const { entity } = TagMergeJob.create(createInput(1), T0);
    const processing = TagMergeJob.startProcessing(entity, 5, at(1));
    expect(processing.status).toBe("processing");
    expect(processing.progress).toEqual({ processed: 0, total: 5 });
    expect(processing.version as unknown as number).toBe(1);
  });

  it("recordProgress keeps the existing total and only moves processed", () => {
    const { entity } = TagMergeJob.create(createInput(1), T0);
    const processing = TagMergeJob.startProcessing(entity, 5, at(1));
    const advanced = TagMergeJob.recordProgress(processing, 3, at(2));
    expect(advanced.progress).toEqual({ processed: 3, total: 5 });
  });

  it("recordProgress allows a stationary processed (equal to current)", () => {
    const { entity } = TagMergeJob.create(createInput(1), T0);
    const processing = TagMergeJob.startProcessing(entity, 5, at(1));
    const advanced = TagMergeJob.recordProgress(processing, 3, at(2));
    const stationary = TagMergeJob.recordProgress(advanced, 3, at(3));
    expect(stationary.progress).toEqual({ processed: 3, total: 5 });
  });

  it("recordProgress rejects a regressing processed (bar must not move backward)", () => {
    const { entity } = TagMergeJob.create(createInput(1), T0);
    const processing = TagMergeJob.startProcessing(entity, 5, at(1));
    const advanced = TagMergeJob.recordProgress(processing, 3, at(2));
    try {
      TagMergeJob.recordProgress(advanced, 2, at(3));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(TagMergeJobErrorCode.InvalidProgress);
      }
    }
  });

  it("recordProgress rejects processed beyond the persisted total", () => {
    const { entity } = TagMergeJob.create(createInput(1), T0);
    const processing = TagMergeJob.startProcessing(entity, 2, at(1));
    try {
      TagMergeJob.recordProgress(processing, 3, at(2));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(TagMergeJobErrorCode.InvalidProgress);
      }
    }
  });

  it("complete records affected ids and completedAt", () => {
    const { entity } = TagMergeJob.create(createInput(1), T0);
    const processing = TagMergeJob.startProcessing(entity, 2, at(1));
    const completed = TagMergeJob.complete(
      processing,
      [note(1), note(2)],
      at(3),
    );
    expect(completed.status).toBe("completed");
    expect(completed.affectedNoteIds).toEqual([note(1), note(2)]);
    expect(completed.completedAt).toEqual(at(3));
  });

  it("fail records errorCode / errorReason", () => {
    const { entity } = TagMergeJob.create(createInput(1), T0);
    const failed = TagMergeJob.fail(entity, "boom", "it broke", at(1));
    expect(failed.status).toBe("failed");
    expect(failed.errorCode).toBe("boom");
    expect(failed.errorReason).toBe("it broke");
    expect(failed.completedAt).toEqual(at(1));
  });
});

describe("TagMergeJob.assertOwnedBy", () => {
  it("passes for the owner", () => {
    const { entity } = TagMergeJob.create(createInput(1), T0);
    expect(() => TagMergeJob.assertOwnedBy(entity, owner(1))).not.toThrow();
  });

  it("rejects a different owner (IDOR guard)", () => {
    const { entity } = TagMergeJob.create(createInput(1), T0);
    try {
      TagMergeJob.assertOwnedBy(entity, owner(2));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(TagMergeJobErrorCode.Unauthorized);
      }
    }
  });
});

describe("TagMergeJob.reconstruct", () => {
  it("round-trips a completed job", () => {
    const job = TagMergeJob.reconstruct({
      id: rawId(1),
      ownerId: owner(1),
      sourceTagId: tag(1),
      targetTagId: tag(2),
      status: "completed",
      progress: { processed: 4, total: 4 },
      affectedNoteIds: [note(1)],
      errorCode: null,
      errorReason: null,
      version: 3,
      createdAt: T0,
      updatedAt: at(5),
      completedAt: at(5),
    });
    expect(job.status).toBe("completed");
    if (TagMergeJob.isCompleted(job)) {
      expect(job.affectedNoteIds).toEqual([note(1)]);
    }
  });

  it("rejects a completed row missing completedAt as a rehydration error", () => {
    expect(() =>
      TagMergeJob.reconstruct({
        id: rawId(1),
        ownerId: owner(1),
        sourceTagId: tag(1),
        targetTagId: tag(2),
        status: "completed",
        progress: { processed: 1, total: 1 },
        affectedNoteIds: [],
        errorCode: null,
        errorReason: null,
        version: 1,
        createdAt: T0,
        updatedAt: at(1),
        completedAt: null,
      }),
    ).toThrow();
  });
});
