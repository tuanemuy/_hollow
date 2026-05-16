import { describe, expect, it } from "vitest";
import { isBusinessRuleError, isRehydrationError } from "@/core/domain/error";
import { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { ExportJob } from "../entity";
import { ExportErrorCode } from "../errorCode";
import {
  ExportOptions,
  type ExportScope,
  type ViewQuerySnapshot,
} from "../valueObject";

const T0 = new Date(0);
const at = (ms: number) => new Date(T0.getTime() + ms);

const ID_BASE = "00000000-0000-7000-8000-";
const rawId = (n: number): string =>
  `${ID_BASE}${n.toString(16).padStart(12, "0")}`;
const noteId = (n: number): NoteId => rawId(n + 1000) as NoteId;
const owner = (n: number): UserId => UserId.create(`owner-${n}`);

const defaultOptions = (
  override?: Partial<ReturnType<typeof ExportOptions.create>>,
) =>
  ExportOptions.create({
    includeFrontMatter: false,
    embedMedia: false,
    pdfPaperSize: null,
    ...override,
  });

const baseCreateInput = (
  n = 1,
  override?: Partial<{
    scope: ExportScope;
    targetNoteIds: readonly NoteId[];
    viewQuery: ViewQuerySnapshot | null;
    format: "html" | "markdown" | "pdf";
    options: ReturnType<typeof ExportOptions.create>;
  }>,
) => ({
  id: rawId(n),
  ownerId: owner(n),
  format: "html" as const,
  scope: "single" as ExportScope,
  targetNoteIds: [noteId(n)] as readonly NoteId[],
  viewQuery: null,
  options: defaultOptions(),
  ...override,
});

describe("ExportJob.create — happy path", () => {
  it("produces a pending job with the supplied id / scope / format / options", () => {
    const input = baseCreateInput(1);
    const { entity, eventDrafts } = ExportJob.create(input, T0);
    expect(entity.status).toBe("pending");
    expect(entity.id as unknown as string).toBe(input.id);
    expect(entity.ownerId).toBe(input.ownerId);
    expect(entity.format).toBe("html");
    expect(entity.scope).toBe("single");
    expect(entity.targetNoteIds).toEqual(input.targetNoteIds);
    expect(entity.viewQuery).toBeNull();
    expect(entity.options).toEqual(input.options);
    expect(entity.progress.processed).toBe(0);
    expect(entity.progress.total).toBe(0);
    expect(entity.failedNoteIds).toEqual([]);
    expect(entity.version).toBe(0);
    expect(entity.createdAt.getTime()).toBe(T0.getTime());
    expect(entity.updatedAt.getTime()).toBe(T0.getTime());

    expect(eventDrafts).toHaveLength(1);
    const draft = eventDrafts[0];
    if (!draft || draft.type !== "export.job.requested") {
      expect.fail("expected export.job.requested draft");
      return;
    }
    expect(draft.payload.exportJobId).toBe(entity.id);
    expect(draft.payload.ownerId).toBe(entity.ownerId);
    expect(draft.payload.format).toBe(entity.format);
    expect(draft.payload.scope).toBe(entity.scope);
    expect(draft.aggregateId).toBe(entity.id);
    expect(draft.occurredAt.getTime()).toBe(T0.getTime());
  });

  it("uses provided now for createdAt = updatedAt", () => {
    const { entity } = ExportJob.create(baseCreateInput(2), at(123));
    expect(entity.createdAt.getTime()).toBe(at(123).getTime());
    expect(entity.updatedAt.getTime()).toBe(at(123).getTime());
  });
});

describe("ExportJob.create — scope/target invariants", () => {
  it("scope='single' requires exactly one target and no viewQuery", () => {
    try {
      ExportJob.create(
        baseCreateInput(3, {
          scope: "single",
          targetNoteIds: [noteId(1), noteId(2)],
        }),
        T0,
      );
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.ScopeTargetMismatch);
      }
    }
  });

  it("scope='multiple' requires at least one target", () => {
    try {
      ExportJob.create(
        baseCreateInput(4, { scope: "multiple", targetNoteIds: [] }),
        T0,
      );
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.ScopeTargetMismatch);
      }
    }
  });

  it("scope='view' requires a viewQuery and no pre-resolved targets", () => {
    try {
      ExportJob.create(
        baseCreateInput(5, {
          scope: "view",
          targetNoteIds: [noteId(1)],
          viewQuery: null,
        }),
        T0,
      );
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.ScopeTargetMismatch);
      }
    }
  });
});

describe("ExportJob.create — pdf options invariant", () => {
  it("rejects format='pdf' without pdfPaperSize", () => {
    try {
      ExportJob.create(
        baseCreateInput(6, {
          format: "pdf",
          options: defaultOptions({ pdfPaperSize: null }),
        }),
        T0,
      );
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.InvalidPaperSize);
      }
    }
  });

  it("rejects non-pdf format with non-null pdfPaperSize", () => {
    try {
      ExportJob.create(
        baseCreateInput(7, {
          format: "html",
          options: defaultOptions({ pdfPaperSize: "A4" }),
        }),
        T0,
      );
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.InvalidPaperSize);
      }
    }
  });

  it("accepts format='pdf' with pdfPaperSize set", () => {
    const { entity } = ExportJob.create(
      baseCreateInput(8, {
        format: "pdf",
        options: defaultOptions({ pdfPaperSize: "A4" }),
      }),
      T0,
    );
    expect(entity.format).toBe("pdf");
    expect(entity.options.pdfPaperSize).toBe("A4");
  });
});

describe("ExportJob.startProcessing", () => {
  it("transitions pending → processing, sets total, emits started event, bumps version", () => {
    const { entity: pending } = ExportJob.create(baseCreateInput(10), T0);
    const { entity: started, eventDrafts } = ExportJob.startProcessing(
      pending,
      5,
      at(1),
    );
    expect(started.status).toBe("processing");
    expect(started.progress.total).toBe(5);
    expect(started.progress.processed).toBe(0);
    expect(started.version).toBe(pending.version + 1);
    expect(started.updatedAt.getTime()).toBe(at(1).getTime());

    expect(eventDrafts).toHaveLength(1);
    const draft = eventDrafts[0];
    if (!draft || draft.type !== "export.job.started") {
      expect.fail("expected export.job.started");
      return;
    }
    expect(draft.payload.total).toBe(5);
    expect(draft.payload.exportJobId).toBe(pending.id);
  });
});

describe("ExportJob.recordProgress", () => {
  it("updates processed count and bumps version (no event)", () => {
    const { entity: pending } = ExportJob.create(baseCreateInput(11), T0);
    const { entity: processing } = ExportJob.startProcessing(pending, 10, T0);
    const { entity: bumped, eventDrafts } = ExportJob.recordProgress(
      processing,
      3,
      at(1),
    );
    expect(bumped.progress.processed).toBe(3);
    expect(bumped.progress.total).toBe(10);
    expect(bumped.version).toBe(processing.version + 1);
    expect(eventDrafts).toHaveLength(0);
  });

  it("rejects processed > total", () => {
    const { entity: pending } = ExportJob.create(baseCreateInput(12), T0);
    const { entity: processing } = ExportJob.startProcessing(pending, 2, T0);
    expect(() => ExportJob.recordProgress(processing, 5, at(1))).toThrow();
  });
});

describe("ExportJob.recordFailedNote", () => {
  it("appends a new failed note id and bumps version", () => {
    const { entity: pending } = ExportJob.create(
      baseCreateInput(13, {
        scope: "multiple",
        targetNoteIds: [noteId(1), noteId(2), noteId(3)],
      }),
      T0,
    );
    const { entity: processing } = ExportJob.startProcessing(pending, 3, T0);
    const { entity: next } = ExportJob.recordFailedNote(
      processing,
      noteId(2),
      at(1),
    );
    expect(next.failedNoteIds).toEqual([noteId(2)]);
    expect(next.version).toBe(processing.version + 1);
  });

  it("is idempotent for an already-recorded note", () => {
    const { entity: pending } = ExportJob.create(
      baseCreateInput(14, {
        scope: "multiple",
        targetNoteIds: [noteId(1), noteId(2)],
      }),
      T0,
    );
    const { entity: processing } = ExportJob.startProcessing(pending, 2, T0);
    const { entity: once } = ExportJob.recordFailedNote(
      processing,
      noteId(1),
      at(1),
    );
    const { entity: twice, eventDrafts } = ExportJob.recordFailedNote(
      once,
      noteId(1),
      at(2),
    );
    expect(twice).toBe(once);
    expect(twice.version).toBe(once.version);
    expect(eventDrafts).toHaveLength(0);
  });
});

describe("ExportJob.complete", () => {
  it("transitions processing → completed with artifact and expiry", () => {
    const { entity: pending } = ExportJob.create(baseCreateInput(20), T0);
    const { entity: processing } = ExportJob.startProcessing(pending, 1, T0);
    const ttlSec = 60;
    const { entity: completed, eventDrafts } = ExportJob.complete(
      processing,
      "exports/owner-20/job.zip",
      4096,
      at(1_000),
      ttlSec,
    );
    expect(completed.status).toBe("completed");
    expect(completed.artifactKey).toBe("exports/owner-20/job.zip");
    expect(completed.artifactSize).toBe(4096);
    expect(completed.completedAt.getTime()).toBe(at(1_000).getTime());
    expect(completed.expiresAt.getTime()).toBe(
      at(1_000 + ttlSec * 1000).getTime(),
    );
    expect(completed.version).toBe(processing.version + 1);

    expect(eventDrafts).toHaveLength(1);
    const draft = eventDrafts[0];
    if (!draft || draft.type !== "export.job.completed") {
      expect.fail("expected export.job.completed");
      return;
    }
    expect(draft.payload.artifactKey).toBe(completed.artifactKey);
    expect(draft.payload.artifactSize).toBe(completed.artifactSize);
  });

  it("rejects invalid artifact key", () => {
    const { entity: pending } = ExportJob.create(baseCreateInput(21), T0);
    const { entity: processing } = ExportJob.startProcessing(pending, 1, T0);
    expect(() => ExportJob.complete(processing, "", 1, T0, 60)).toThrow();
  });
});

describe("ExportJob.fail", () => {
  it("transitions pending → failed with code + reason", () => {
    const { entity: pending } = ExportJob.create(baseCreateInput(30), T0);
    const { entity: failed, eventDrafts } = ExportJob.fail(
      pending,
      "pdf_render_error",
      "engine timeout",
      at(1),
    );
    expect(failed.status).toBe("failed");
    expect(failed.errorCode).toBe("pdf_render_error");
    expect(failed.errorReason).toBe("engine timeout");
    expect(failed.completedAt.getTime()).toBe(at(1).getTime());
    expect(failed.version).toBe(pending.version + 1);

    expect(eventDrafts).toHaveLength(1);
    const draft = eventDrafts[0];
    if (!draft || draft.type !== "export.job.failed") {
      expect.fail("expected export.job.failed");
      return;
    }
    expect(draft.payload.code).toBe("pdf_render_error");
    expect(draft.payload.reason).toBe("engine timeout");
  });

  it("transitions processing → failed", () => {
    const { entity: pending } = ExportJob.create(baseCreateInput(31), T0);
    const { entity: processing } = ExportJob.startProcessing(pending, 2, T0);
    const { entity: failed } = ExportJob.fail(
      processing,
      "code",
      "reason",
      at(1),
    );
    expect(failed.status).toBe("failed");
  });
});

describe("ExportJob.cancel", () => {
  it("transitions pending → cancelled", () => {
    const { entity: pending } = ExportJob.create(baseCreateInput(40), T0);
    const { entity: cancelled, eventDrafts } = ExportJob.cancel(pending, at(1));
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.completedAt.getTime()).toBe(at(1).getTime());
    expect(cancelled.version).toBe(pending.version + 1);

    const draft = eventDrafts[0];
    if (!draft || draft.type !== "export.job.cancelled") {
      expect.fail("expected export.job.cancelled");
      return;
    }
    expect(draft.payload.exportJobId).toBe(pending.id);
  });

  it("transitions processing → cancelled", () => {
    const { entity: pending } = ExportJob.create(baseCreateInput(41), T0);
    const { entity: processing } = ExportJob.startProcessing(pending, 1, T0);
    const { entity: cancelled } = ExportJob.cancel(processing, at(1));
    expect(cancelled.status).toBe("cancelled");
  });
});

describe("ExportJob.expire", () => {
  it("transitions completed → expired and emits an expired event", () => {
    const { entity: pending } = ExportJob.create(baseCreateInput(50), T0);
    const { entity: processing } = ExportJob.startProcessing(pending, 1, T0);
    const { entity: completed } = ExportJob.complete(
      processing,
      "key",
      1024,
      at(1),
      60,
    );
    const { entity: expired, eventDrafts } = ExportJob.expire(completed, at(2));
    expect(expired.status).toBe("expired");
    expect(expired.artifactKey).toBe(completed.artifactKey);
    expect(expired.artifactSize).toBe(completed.artifactSize);
    expect(expired.version).toBe(completed.version + 1);
    expect(eventDrafts).toHaveLength(1);
    expect(eventDrafts[0]?.type).toBe("export.job.expired");
  });
});

describe("ExportJob.assertOwnedBy", () => {
  it("passes when owner matches", () => {
    const { entity } = ExportJob.create(baseCreateInput(60), T0);
    expect(() => ExportJob.assertOwnedBy(entity, entity.ownerId)).not.toThrow();
  });

  it("throws Unauthorized when owner does not match", () => {
    const { entity } = ExportJob.create(baseCreateInput(61), T0);
    const intruder = UserId.create("intruder");
    try {
      ExportJob.assertOwnedBy(entity, intruder);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.Unauthorized);
      }
    }
  });
});

describe("ExportJob type guards", () => {
  it("isPending / isProcessing / isCompleted / isFailed / isCancelled / isExpired", () => {
    const { entity: pending } = ExportJob.create(baseCreateInput(70), T0);
    expect(ExportJob.isPending(pending)).toBe(true);

    const { entity: processing } = ExportJob.startProcessing(pending, 1, T0);
    expect(ExportJob.isProcessing(processing)).toBe(true);
    expect(ExportJob.isPending(processing)).toBe(false);

    const { entity: completed } = ExportJob.complete(
      processing,
      "k",
      1,
      at(1),
      60,
    );
    expect(ExportJob.isCompleted(completed)).toBe(true);

    const { entity: expired } = ExportJob.expire(completed, at(2));
    expect(ExportJob.isExpired(expired)).toBe(true);

    const { entity: failed } = ExportJob.fail(pending, "c", "r", at(1));
    expect(ExportJob.isFailed(failed)).toBe(true);

    const { entity: cancelled } = ExportJob.cancel(pending, at(1));
    expect(ExportJob.isCancelled(cancelled)).toBe(true);
  });
});

describe("ExportJob.illegalTransition", () => {
  it("throws IllegalTransition with a descriptive message", () => {
    try {
      ExportJob.illegalTransition("completed", "processing");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.IllegalTransition);
      }
    }
  });
});

describe("ExportJob.reconstruct", () => {
  const validRow = (
    n = 100,
    override: Partial<Parameters<typeof ExportJob.reconstruct>[0]> = {},
  ) => ({
    id: rawId(n),
    ownerId: "owner-x",
    format: "html",
    scope: "single",
    targetNoteIds: [noteId(n)],
    viewQuery: null,
    options: {
      includeFrontMatter: false,
      embedMedia: false,
      pdfPaperSize: null,
    },
    status: "pending",
    artifactKey: null,
    artifactSize: null,
    errorCode: null,
    errorReason: null,
    progress: { processed: 0, total: 0 },
    failedNoteIds: [],
    version: 0,
    createdAt: T0,
    updatedAt: T0,
    completedAt: null,
    expiresAt: null,
    ...override,
  });

  it("rebuilds a pending job from a row", () => {
    const row = validRow();
    const job = ExportJob.reconstruct(row);
    expect(job.status).toBe("pending");
    expect(job.id as unknown as string).toBe(row.id);
  });

  it("rebuilds a completed job from a row", () => {
    const job = ExportJob.reconstruct(
      validRow(101, {
        status: "completed",
        artifactKey: "k",
        artifactSize: 100,
        completedAt: at(1),
        expiresAt: at(2),
      }),
    );
    expect(job.status).toBe("completed");
    if (ExportJob.isCompleted(job)) {
      expect(job.artifactKey).toBe("k");
      expect(job.artifactSize).toBe(100);
    }
  });

  it("rebuilds a failed job from a row", () => {
    const job = ExportJob.reconstruct(
      validRow(102, {
        status: "failed",
        errorCode: "code",
        errorReason: "reason",
        completedAt: at(1),
      }),
    );
    expect(job.status).toBe("failed");
  });

  it("rebuilds a cancelled job from a row", () => {
    const job = ExportJob.reconstruct(
      validRow(103, { status: "cancelled", completedAt: at(1) }),
    );
    expect(job.status).toBe("cancelled");
  });

  it("rebuilds an expired job from a row", () => {
    const job = ExportJob.reconstruct(
      validRow(104, {
        status: "expired",
        artifactKey: "k",
        artifactSize: 50,
        completedAt: at(1),
        expiresAt: at(2),
      }),
    );
    expect(job.status).toBe("expired");
  });

  it("throws RehydrationError (not BusinessRuleError) for unknown status", () => {
    try {
      ExportJob.reconstruct(validRow(105, { status: "archived" }));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
      expect(isBusinessRuleError(error)).toBe(false);
    }
  });

  it("throws RehydrationError for completed status missing artifactKey", () => {
    try {
      ExportJob.reconstruct(
        validRow(106, {
          status: "completed",
          artifactKey: null,
          artifactSize: 100,
          completedAt: at(1),
          expiresAt: at(2),
        }),
      );
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError when scope='multiple' has zero targets", () => {
    try {
      ExportJob.reconstruct(
        validRow(107, { scope: "multiple", targetNoteIds: [] }),
      );
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError for pending with completedAt set", () => {
    try {
      ExportJob.reconstruct(validRow(108, { completedAt: at(1) }));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError for negative version", () => {
    try {
      ExportJob.reconstruct(validRow(109, { version: -1 }));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });
});
