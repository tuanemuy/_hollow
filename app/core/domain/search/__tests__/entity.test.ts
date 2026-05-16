import { describe, expect, it } from "vitest";
import { isBusinessRuleError, isRehydrationError } from "@/core/domain/error";
import { UserId } from "@/core/domain/identity/valueObject";
import { NoteId } from "@/core/domain/note/valueObject";
import { IndexJob, type NoteSnapshot, SearchDocument } from "../entity";
import { IndexJobAttempts } from "../valueObject";

const T0 = new Date(0);
const at = (ms: number) => new Date(T0.getTime() + ms);

const noteId = (n: number): NoteId =>
  NoteId.create(`00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`);
const userId = (n: number): UserId =>
  UserId.create(`00000000-0000-7000-9000-${n.toString(16).padStart(12, "0")}`);

function snapshot(override: Partial<NoteSnapshot> = {}): NoteSnapshot {
  return {
    noteId: noteId(1),
    ownerId: userId(1),
    visibility: "private",
    title: "Hello",
    plainBody: "world",
    tagNames: ["draft", "idea"],
    directoryPath: "/notes/inbox",
    frontMatterDate: null,
    updatedAt: at(100),
    ...override,
  };
}

describe("SearchDocument.fromSnapshot", () => {
  it("projects all snapshot fields and stamps indexedAt with the provided now", () => {
    const snap = snapshot({ frontMatterDate: at(50) });
    const doc = SearchDocument.fromSnapshot(snap, at(200));
    expect(doc.noteId).toBe(snap.noteId);
    expect(doc.ownerId).toBe(snap.ownerId);
    expect(doc.visibility).toBe(snap.visibility);
    expect(doc.title as unknown as string).toBe(snap.title);
    expect(doc.body as unknown as string).toBe(snap.plainBody);
    expect(doc.tagNames).toEqual(snap.tagNames);
    expect(doc.directoryPath as unknown as string).toBe(snap.directoryPath);
    expect(doc.updatedAt.getTime()).toBe(snap.updatedAt.getTime());
    expect(doc.indexedAt.getTime()).toBe(at(200).getTime());
  });

  it("uses frontMatterDate as dateForCalendar when present", () => {
    const snap = snapshot({ frontMatterDate: at(50), updatedAt: at(100) });
    const doc = SearchDocument.fromSnapshot(snap, at(200));
    expect(doc.dateForCalendar.getTime()).toBe(at(50).getTime());
  });

  it("falls back to updatedAt when frontMatterDate is null", () => {
    const snap = snapshot({ frontMatterDate: null, updatedAt: at(100) });
    const doc = SearchDocument.fromSnapshot(snap, at(200));
    expect(doc.dateForCalendar.getTime()).toBe(at(100).getTime());
  });

  it("rejects an over-long body via SearchBody.create", () => {
    const snap = snapshot({ plainBody: "a".repeat(1024 * 1024 + 1) });
    expect(() => SearchDocument.fromSnapshot(snap, T0)).toThrow();
  });

  it("copies tagNames defensively (mutating the snapshot must not affect the document)", () => {
    const tags = ["a"];
    const snap = snapshot({ tagNames: tags });
    const doc = SearchDocument.fromSnapshot(snap, T0);
    tags.push("b");
    expect(doc.tagNames).toEqual(["a"]);
  });
});

describe("SearchDocument.markRemoved", () => {
  it("returns a tombstone marker carrying noteId and removedAt", () => {
    const id = noteId(2);
    const tomb = SearchDocument.markRemoved(id, at(5));
    expect(tomb.tombstone).toBe(true);
    expect(tomb.noteId).toBe(id);
    expect(tomb.removedAt.getTime()).toBe(at(5).getTime());
  });
});

describe("SearchDocument.reconstruct", () => {
  const validRow = () => ({
    noteId: noteId(3),
    ownerId: userId(3) as unknown as string,
    visibility: "public",
    title: "stored",
    body: "stored body",
    tagNames: ["x"] as const,
    directoryPath: "/a/b",
    dateForCalendar: at(10),
    updatedAt: at(20),
    indexedAt: at(30),
  });

  it("rebuilds a SearchDocument from a well-formed row", () => {
    const doc = SearchDocument.reconstruct(validRow());
    expect(doc.title as unknown as string).toBe("stored");
    expect(doc.visibility).toBe("public");
    expect(doc.tagNames).toEqual(["x"]);
  });

  it("wraps stored-row violations in RehydrationError, not BusinessRuleError", () => {
    try {
      SearchDocument.reconstruct({ ...validRow(), visibility: "secret" });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
      expect(isBusinessRuleError(error)).toBe(false);
      if (isRehydrationError(error)) {
        expect(isBusinessRuleError(error.cause)).toBe(true);
      }
    }
  });

  it("throws RehydrationError when stored directoryPath is malformed", () => {
    try {
      SearchDocument.reconstruct({ ...validRow(), directoryPath: "no-slash" });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });
});

describe("IndexJob.create", () => {
  it("creates an upsert job carrying the snapshot, attempts=0 and now()=enqueuedAt", () => {
    const snap = snapshot();
    const job = IndexJob.create(
      { id: "job-1", noteId: snap.noteId, op: "upsert", snapshot: snap },
      at(7),
    );
    expect(job.id as unknown as string).toBe("job-1");
    expect(job.op).toBe("upsert");
    expect(job.snapshot).toBe(snap);
    expect(job.attempts as unknown as number).toBe(0);
    expect(job.lastError).toBeNull();
    expect(job.enqueuedAt.getTime()).toBe(at(7).getTime());
  });

  it("creates a delete job; snapshot is forced to null even if one is passed", () => {
    const snap = snapshot();
    const job = IndexJob.create(
      { id: "job-2", noteId: snap.noteId, op: "delete", snapshot: snap },
      at(1),
    );
    expect(job.op).toBe("delete");
    expect(job.snapshot).toBeNull();
  });
});

describe("IndexJob.recordAttempt", () => {
  const baseJob = () =>
    IndexJob.create(
      { id: "j", noteId: noteId(9), op: "delete", snapshot: null },
      at(0),
    );

  it("bumps attempts and stamps lastError on a failed attempt", () => {
    const j0 = baseJob();
    const j1 = IndexJob.recordAttempt(j0, "boom", at(1));
    expect(j1.attempts as unknown as number).toBe(1);
    expect(j1.lastError as unknown as string).toBe("boom");
  });

  it("clears lastError on a successful attempt (null)", () => {
    const j0 = IndexJob.recordAttempt(baseJob(), "boom", at(1));
    expect(j0.lastError as unknown as string).toBe("boom");
    const j1 = IndexJob.recordAttempt(j0, null, at(2));
    expect(j1.lastError).toBeNull();
    expect(j1.attempts as unknown as number).toBe(2);
  });

  it("preserves enqueuedAt across attempt transitions", () => {
    const j0 = baseJob();
    const j1 = IndexJob.recordAttempt(j0, "x", at(50));
    expect(j1.enqueuedAt.getTime()).toBe(j0.enqueuedAt.getTime());
  });
});

describe("IndexJob.reconstruct", () => {
  const validRow = () => ({
    id: "job-r",
    noteId: noteId(4),
    op: "upsert",
    snapshot: snapshot(),
    attempts: 2,
    lastError: "previous failure",
    enqueuedAt: at(0),
  });

  it("rebuilds an upsert job from a well-formed row", () => {
    const job = IndexJob.reconstruct(validRow());
    expect(job.op).toBe("upsert");
    expect(job.attempts as unknown as number).toBe(2);
    expect(job.lastError as unknown as string).toBe("previous failure");
    expect(job.snapshot).not.toBeNull();
  });

  it("drops the snapshot on a delete job even when persisted (defensive)", () => {
    const job = IndexJob.reconstruct({ ...validRow(), op: "delete" });
    expect(job.op).toBe("delete");
    expect(job.snapshot).toBeNull();
  });

  it("rejects malformed rows with RehydrationError", () => {
    try {
      IndexJob.reconstruct({ ...validRow(), op: "weird" });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("rejects negative attempts via RehydrationError", () => {
    try {
      IndexJob.reconstruct({ ...validRow(), attempts: -1 });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("accepts null lastError verbatim", () => {
    const job = IndexJob.reconstruct({ ...validRow(), lastError: null });
    expect(job.lastError).toBeNull();
  });
});

// Type-only assertion: IndexJobAttempts.zero is the unique "fresh" sentinel,
// used by `IndexJob.create`. Anchor it here so callers can rely on the
// post-create attempts being exactly the zero literal value.
describe("IndexJob.create attempts contract", () => {
  it("sets attempts to IndexJobAttempts.zero()", () => {
    const job = IndexJob.create(
      { id: "x", noteId: noteId(5), op: "upsert", snapshot: snapshot() },
      T0,
    );
    expect(job.attempts).toBe(IndexJobAttempts.zero());
  });
});
