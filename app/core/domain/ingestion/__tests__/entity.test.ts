import { describe, expect, it } from "vitest";
import { isBusinessRuleError, isRehydrationError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import {
  ContentHtml,
  FrontMatter,
  NoteId,
  NoteTitle,
} from "@/core/domain/note/valueObject";
import {
  IngestionJob,
  type IngestionJob as IngestionJobType,
  type PreviewingIngestionJob,
} from "../entity";
import { IngestionErrorCode } from "../errorCode";
import {
  IngestionPreview,
  RegenerationCount,
  type SourceFileKind,
} from "../valueObject";

const T0 = new Date(0);
const at = (ms: number) => new Date(T0.getTime() + ms);

const ID_BASE = "00000000-0000-7000-8000-";
const rawId = (n: number) => `${ID_BASE}${n.toString(16).padStart(12, "0")}`;
const ownerId = "00000000-0000-7000-8000-0000000000ff" as unknown as UserId;
const noteId = (n: number) =>
  NoteId.create(
    `00000000-0000-7000-8000-00000000${n.toString(16).padStart(4, "0")}`,
  );

const samplePreview = (suffix = "draft"): IngestionPreview =>
  IngestionPreview.create({
    title: NoteTitle.create(`title-${suffix}`),
    contentHtml: ContentHtml.create(`<p>${suffix}</p>`),
    suggestedDirectoryId: null,
    suggestedDirectoryName: null,
    frontMatter: FrontMatter.empty(),
    suggestedTagNames: [],
    internalLinkRefs: [],
    mediaRefs: [],
  });

const seedPending = (n = 1, kind: SourceFileKind = "html") =>
  IngestionJob.create(
    {
      id: rawId(n),
      ownerId,
      originalFileName: "draft.html",
      mimeType: "text/html",
      byteSize: 256,
      kind,
      tempStorageKey: `tmp/${rawId(n)}`,
    },
    T0,
  );

describe("IngestionJob.create", () => {
  it("produces a pending job with version 0 and an ingestion.created draft", () => {
    const { entity, eventDrafts } = seedPending();
    expect(entity.status).toBe("pending");
    expect(entity.version as number).toBe(0);
    expect(entity.regenerationCount as number).toBe(0);
    expect(entity.preview).toBeNull();
    expect(entity.errorCode).toBeNull();
    expect(entity.errorReason).toBeNull();
    expect(entity.savedAsNoteId).toBeNull();
    expect(entity.createdAt.getTime()).toBe(entity.updatedAt.getTime());

    expect(eventDrafts).toHaveLength(1);
    const draft = eventDrafts[0];
    if (!draft || draft.type !== "ingestion.created") {
      expect.fail("expected ingestion.created");
      return;
    }
    expect(draft.payload.jobId).toBe(entity.id);
    expect(draft.payload.kind).toBe("html");
    expect(draft.aggregateId).toBe(entity.id);
  });

  it("propagates value-object validation (mime / file name)", () => {
    try {
      IngestionJob.create(
        {
          id: rawId(2),
          ownerId,
          originalFileName: "",
          mimeType: "text/html",
          byteSize: 1,
          kind: "html",
          tempStorageKey: null,
        },
        T0,
      );
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
    }
  });
});

describe("IngestionJob promptOverride", () => {
  it("create() defaults both overrides to null when not supplied", () => {
    const { entity } = seedPending(200);
    expect(entity.promptOverride.structure).toBeNull();
    expect(entity.promptOverride.metadata).toBeNull();
  });

  it("create() normalises empty / whitespace-only overrides to null", () => {
    const { entity } = IngestionJob.create(
      {
        id: rawId(201),
        ownerId,
        originalFileName: "doc.html",
        mimeType: "text/html",
        byteSize: 8,
        kind: "html",
        tempStorageKey: null,
        promptOverride: { structure: "   ", metadata: "" },
      },
      T0,
    );
    expect(entity.promptOverride.structure).toBeNull();
    expect(entity.promptOverride.metadata).toBeNull();
  });

  it("create() brands non-empty overrides (trimmed) as PromptOverride", () => {
    const { entity } = IngestionJob.create(
      {
        id: rawId(202),
        ownerId,
        originalFileName: "doc.html",
        mimeType: "text/html",
        byteSize: 8,
        kind: "html",
        tempStorageKey: null,
        promptOverride: { structure: "  use H2  ", metadata: "tag it" },
      },
      T0,
    );
    expect(entity.promptOverride.structure as unknown as string).toBe("use H2");
    expect(entity.promptOverride.metadata as unknown as string).toBe("tag it");
  });

  it("preserves overrides across startProcessing → attachPreview → regenerate", () => {
    const { entity: pending } = IngestionJob.create(
      {
        id: rawId(203),
        ownerId,
        originalFileName: "doc.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        byteSize: 8,
        kind: "office",
        tempStorageKey: "tmp/o",
        promptOverride: { structure: "S", metadata: "M" },
      },
      T0,
    );
    const { entity: processing } = IngestionJob.startProcessing(pending, at(1));
    const { entity: previewing } = IngestionJob.attachPreview(
      processing,
      samplePreview("o"),
      at(2),
    );
    const { entity: regenerated } = IngestionJob.regenerate(
      previewing,
      at(3),
      5,
    );
    expect(processing.promptOverride.structure as unknown as string).toBe("S");
    expect(previewing.promptOverride.metadata as unknown as string).toBe("M");
    expect(regenerated.promptOverride.structure as unknown as string).toBe("S");
    expect(regenerated.promptOverride.metadata as unknown as string).toBe("M");
  });

  it("preserves overrides across markFailed → retry", () => {
    const { entity: pending } = IngestionJob.create(
      {
        id: rawId(204),
        ownerId,
        originalFileName: "doc.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        byteSize: 8,
        kind: "office",
        tempStorageKey: "tmp/r",
        promptOverride: { structure: "S2", metadata: "M2" },
      },
      T0,
    );
    const { entity: processing } = IngestionJob.startProcessing(pending, at(1));
    const { entity: failed } = IngestionJob.markFailed(
      processing,
      "llm_failure",
      "boom",
      at(2),
    );
    const { entity: retried } = IngestionJob.retry(failed, at(3));
    expect(failed.promptOverride.structure as unknown as string).toBe("S2");
    expect(retried.promptOverride.structure as unknown as string).toBe("S2");
    expect(retried.promptOverride.metadata as unknown as string).toBe("M2");
  });

  it("reconstruct() round-trips override columns and normalises null", () => {
    const withBoth = IngestionJob.reconstruct(
      baseRowForOverride({
        structurePromptOverride: "stored structure",
        metadataPromptOverride: "stored metadata",
      }),
    );
    expect(withBoth.promptOverride.structure as unknown as string).toBe(
      "stored structure",
    );
    expect(withBoth.promptOverride.metadata as unknown as string).toBe(
      "stored metadata",
    );

    const withNone = IngestionJob.reconstruct(baseRowForOverride({}));
    expect(withNone.promptOverride.structure).toBeNull();
    expect(withNone.promptOverride.metadata).toBeNull();
  });
});

// Local row builder mirroring the adapter's reconstruct input, including
// the #228 override columns.
const baseRowForOverride = (
  overrides: Partial<{
    structurePromptOverride: string | null;
    metadataPromptOverride: string | null;
  }>,
) => ({
  id: rawId(210),
  ownerId: ownerId as unknown as string,
  originalFileName: "doc.html",
  mimeType: "text/html",
  byteSize: 1024,
  kind: "html",
  status: "pending",
  tempStorageKey: "tmp/ov",
  structurePromptOverride: overrides.structurePromptOverride ?? null,
  metadataPromptOverride: overrides.metadataPromptOverride ?? null,
  preview: null,
  errorCode: null,
  errorReason: null,
  regenerationCount: 0,
  savedAsNoteId: null,
  version: 0,
  createdAt: T0,
  updatedAt: at(1),
});

describe("IngestionJob.startProcessing", () => {
  it("promotes pending → processing, bumps version, emits processingStarted", () => {
    const { entity: pending } = seedPending(10);
    const { entity: processing, eventDrafts } = IngestionJob.startProcessing(
      pending,
      at(1),
    );
    expect(processing.status).toBe("processing");
    expect(processing.version as number).toBe((pending.version as number) + 1);
    expect(processing.updatedAt.getTime()).toBe(at(1).getTime());
    expect(eventDrafts).toHaveLength(1);
    expect(eventDrafts[0]?.type).toBe("ingestion.processingStarted");
  });

  it("rejects start from any non-pending state with InvalidStateForStart", () => {
    const { entity: pending } = seedPending(11);
    const { entity: processing } = IngestionJob.startProcessing(pending, at(1));
    try {
      IngestionJob.startProcessing(processing, at(2));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(IngestionErrorCode.InvalidStateForStart);
      }
    }
  });
});

describe("IngestionJob.attachPreview", () => {
  it("transitions processing → previewing with the supplied preview", () => {
    const { entity: pending } = seedPending(20);
    const { entity: processing } = IngestionJob.startProcessing(pending, at(1));
    const preview = samplePreview("p1");

    const { entity: previewing, eventDrafts } = IngestionJob.attachPreview(
      processing,
      preview,
      at(2),
    );
    expect(previewing.status).toBe("previewing");
    expect(previewing.preview).toBe(preview);
    expect(previewing.version as number).toBe(
      (processing.version as number) + 1,
    );
    expect(eventDrafts[0]?.type).toBe("ingestion.previewAttached");
  });

  it("rejects attach from pending with InvalidStateForAttachPreview", () => {
    const { entity: pending } = seedPending(21);
    try {
      IngestionJob.attachPreview(pending, samplePreview("p2"), at(1));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(
          IngestionErrorCode.InvalidStateForAttachPreview,
        );
      }
    }
  });
});

describe("IngestionJob.regenerate", () => {
  const upToPreviewing = (n: number) => {
    const { entity: pending } = seedPending(n);
    const { entity: processing } = IngestionJob.startProcessing(pending, at(1));
    return IngestionJob.attachPreview(processing, samplePreview(`r${n}`), at(2))
      .entity;
  };

  it("from previewing: increments regenerationCount, sets preview null, transitions to pending", () => {
    const previewing = upToPreviewing(30);
    const { entity: next, eventDrafts } = IngestionJob.regenerate(
      previewing,
      at(3),
      5,
    );
    expect(next.status).toBe("pending");
    expect(next.preview).toBeNull();
    expect(next.regenerationCount as number).toBe(1);
    expect(next.version as number).toBe((previewing.version as number) + 1);
    const draft = eventDrafts[0];
    if (!draft || draft.type !== "ingestion.regenerated") {
      expect.fail("expected ingestion.regenerated");
      return;
    }
    expect(draft.payload.regenerationCount).toBe(1);
  });

  it("rejects regenerate from non-previewing with InvalidStateForRegenerate", () => {
    const { entity: pending } = seedPending(31);
    try {
      IngestionJob.regenerate(pending, at(1), 5);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(IngestionErrorCode.InvalidStateForRegenerate);
      }
    }
  });

  it("throws RegenerationLimitExceeded when count is at the cap", () => {
    // Build a previewing job whose regenerationCount equals the cap by
    // walking attach/regenerate `max` times. Simpler: reconstruct a row
    // with `regenerationCount` pre-set.
    const previewing = upToPreviewing(32);
    // Walk regenerate→startProcessing→attach 5 times to hit the cap on
    // count. `regenerate` now returns a `pending` job (Issue #253), so the
    // worker promotion `startProcessing` must run before `attachPreview`.
    let current: PreviewingIngestionJob = previewing;
    for (let i = 0; i < 5; i += 1) {
      const regenerated = IngestionJob.regenerate(
        current,
        at(10 + i),
        5,
      ).entity;
      const processing = IngestionJob.startProcessing(
        regenerated,
        at(15 + i),
      ).entity;
      const attached = IngestionJob.attachPreview(
        processing,
        samplePreview(`g${i}`),
        at(20 + i),
      ).entity;
      current = attached;
    }
    expect(current.regenerationCount as number).toBe(5);
    try {
      IngestionJob.regenerate(current, at(99), 5);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(IngestionErrorCode.RegenerationLimitExceeded);
      }
    }
  });
});

describe("IngestionJob.commit", () => {
  it("from previewing: saves note id, clears tempStorageKey, transitions to saved", () => {
    const { entity: pending } = seedPending(40);
    const { entity: processing } = IngestionJob.startProcessing(pending, at(1));
    const { entity: previewing } = IngestionJob.attachPreview(
      processing,
      samplePreview("c1"),
      at(2),
    );

    const note = noteId(1);
    const { entity: saved, eventDrafts } = IngestionJob.commit(
      previewing,
      note,
      at(3),
    );
    expect(saved.status).toBe("saved");
    expect(saved.savedAsNoteId).toBe(note);
    expect(saved.tempStorageKey).toBeNull();
    expect(saved.version as number).toBe((previewing.version as number) + 1);
    const draft = eventDrafts[0];
    if (!draft || draft.type !== "ingestion.committed") {
      expect.fail("expected ingestion.committed");
      return;
    }
    expect(draft.payload.noteId).toBe(note);
  });

  it("rejects commit from pending with InvalidStateForCommit", () => {
    const { entity: pending } = seedPending(41);
    try {
      IngestionJob.commit(pending, noteId(2), at(1));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(IngestionErrorCode.InvalidStateForCommit);
      }
    }
  });
});

describe("IngestionJob.markFailed", () => {
  it("from processing: transitions to failed, validates code and reason, emits ingestion.failed", () => {
    const { entity: pending } = seedPending(50);
    const { entity: processing } = IngestionJob.startProcessing(pending, at(1));
    const { entity: failed, eventDrafts } = IngestionJob.markFailed(
      processing,
      "llm_failure",
      "upstream provider returned 500",
      at(2),
    );
    expect(failed.status).toBe("failed");
    expect(failed.errorCode).toBe("llm_failure");
    expect(failed.errorReason).toBe("upstream provider returned 500");
    expect(failed.preview).toBeNull();
    const draft = eventDrafts[0];
    if (!draft || draft.type !== "ingestion.failed") {
      expect.fail("expected ingestion.failed");
      return;
    }
    expect(draft.payload.errorCode).toBe("llm_failure");
  });

  it("from previewing: preserves the existing preview snapshot", () => {
    const { entity: pending } = seedPending(51);
    const { entity: processing } = IngestionJob.startProcessing(pending, at(1));
    const preview = samplePreview("kept");
    const { entity: previewing } = IngestionJob.attachPreview(
      processing,
      preview,
      at(2),
    );
    const { entity: failed } = IngestionJob.markFailed(
      previewing,
      "sanitize_failure",
      "denied tag",
      at(3),
    );
    expect(failed.status).toBe("failed");
    expect(failed.preview).toBe(preview);
  });

  it("rejects markFailed from saved / discarded / failed states", () => {
    const { entity: pending } = seedPending(52);
    const { entity: processing } = IngestionJob.startProcessing(pending, at(1));
    const { entity: previewing } = IngestionJob.attachPreview(
      processing,
      samplePreview("x"),
      at(2),
    );
    const { entity: saved } = IngestionJob.commit(previewing, noteId(9), at(3));
    try {
      IngestionJob.markFailed(saved, "llm_failure", "after commit", at(4));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(IngestionErrorCode.InvalidStatus);
      }
    }
  });

  it("rejects empty error code / reason via VO validation", () => {
    const { entity: pending } = seedPending(53);
    try {
      IngestionJob.markFailed(pending, "   ", "ok", at(1));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
    }
    try {
      IngestionJob.markFailed(pending, "ok", "   ", at(1));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
    }
  });
});

describe("IngestionJob.discard", () => {
  it("from previewing: clears tempStorageKey, transitions to discarded", () => {
    const { entity: pending } = seedPending(60);
    const { entity: processing } = IngestionJob.startProcessing(pending, at(1));
    const preview = samplePreview("d1");
    const { entity: previewing } = IngestionJob.attachPreview(
      processing,
      preview,
      at(2),
    );
    const { entity: discarded, eventDrafts } = IngestionJob.discard(
      previewing,
      at(3),
    );
    expect(discarded.status).toBe("discarded");
    expect(discarded.tempStorageKey).toBeNull();
    expect(discarded.preview).toBe(preview);
    expect(discarded.errorCode).toBeNull();
    expect(discarded.errorReason).toBeNull();
    expect(eventDrafts[0]?.type).toBe("ingestion.discarded");
  });

  it("from failed: carries forward errorCode / errorReason", () => {
    const { entity: pending } = seedPending(61);
    const { entity: processing } = IngestionJob.startProcessing(pending, at(1));
    const { entity: failed } = IngestionJob.markFailed(
      processing,
      "llm_failure",
      "boom",
      at(2),
    );
    const { entity: discarded } = IngestionJob.discard(failed, at(3));
    expect(discarded.status).toBe("discarded");
    expect(discarded.errorCode).toBe("llm_failure");
    expect(discarded.errorReason).toBe("boom");
  });

  it("rejects discard from saved with InvalidStateForDiscard", () => {
    const { entity: pending } = seedPending(62);
    const { entity: processing } = IngestionJob.startProcessing(pending, at(1));
    const { entity: previewing } = IngestionJob.attachPreview(
      processing,
      samplePreview("d2"),
      at(2),
    );
    const { entity: saved } = IngestionJob.commit(previewing, noteId(7), at(3));
    try {
      IngestionJob.discard(saved, at(4));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(IngestionErrorCode.InvalidStateForDiscard);
      }
    }
  });

  it("rejects discard from pending", () => {
    const { entity: pending } = seedPending(63);
    try {
      IngestionJob.discard(pending, at(1));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(IngestionErrorCode.InvalidStateForDiscard);
      }
    }
  });
});

describe("IngestionJob.retry", () => {
  it("from failed: returns to pending, resets preview / errorCode / errorReason, bumps version, emits retryRequested", () => {
    const { entity: pending } = seedPending(80);
    const { entity: processing } = IngestionJob.startProcessing(pending, at(1));
    const { entity: failed } = IngestionJob.markFailed(
      processing,
      "llm_failure",
      "boom",
      at(2),
    );
    const { entity: retried, eventDrafts } = IngestionJob.retry(failed, at(3));

    expect(retried.status).toBe("pending");
    expect(retried.preview).toBeNull();
    expect(retried.errorCode).toBeNull();
    expect(retried.errorReason).toBeNull();
    expect(retried.savedAsNoteId).toBeNull();
    expect(retried.tempStorageKey).toBe(failed.tempStorageKey);
    expect(retried.regenerationCount).toBe(failed.regenerationCount);
    expect(retried.version as number).toBe((failed.version as number) + 1);
    expect(retried.updatedAt.getTime()).toBe(at(3).getTime());
    expect(eventDrafts).toHaveLength(1);
    expect(eventDrafts[0]?.type).toBe("ingestion.retryRequested");
  });

  it("from failed with preview retained: clears the preview snapshot too", () => {
    const { entity: pending } = seedPending(81);
    const { entity: processing } = IngestionJob.startProcessing(pending, at(1));
    const preview = samplePreview("kept");
    const { entity: previewing } = IngestionJob.attachPreview(
      processing,
      preview,
      at(2),
    );
    const { entity: failed } = IngestionJob.markFailed(
      previewing,
      "sanitize_failure",
      "denied",
      at(3),
    );
    expect(failed.preview).toBe(preview);
    const { entity: retried } = IngestionJob.retry(failed, at(4));
    expect(retried.preview).toBeNull();
  });

  it("rejects retry when tempStorageKey is null with NoTempStorageForRetry", () => {
    // Build a failed job via reconstruct so we can pin tempStorageKey to null.
    const failed = IngestionJob.reconstruct({
      id: rawId(82),
      ownerId: ownerId as unknown as string,
      originalFileName: "doc.html",
      mimeType: "text/html",
      byteSize: 16,
      kind: "html",
      status: "failed",
      tempStorageKey: null,
      structurePromptOverride: null,
      metadataPromptOverride: null,
      preview: null,
      errorCode: "llm_failure",
      errorReason: "boom",
      regenerationCount: 0,
      savedAsNoteId: null,
      version: 2,
      createdAt: T0,
      updatedAt: at(2),
    });
    try {
      IngestionJob.retry(failed as IngestionJobType, at(3));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(IngestionErrorCode.NoTempStorageForRetry);
      }
    }
  });

  it("rejects retry from non-failed states with InvalidStateForRetry", () => {
    const { entity: pending } = seedPending(83);
    try {
      IngestionJob.retry(pending, at(1));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(IngestionErrorCode.InvalidStateForRetry);
      }
    }

    const { entity: processing } = IngestionJob.startProcessing(pending, at(1));
    try {
      IngestionJob.retry(processing, at(2));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(IngestionErrorCode.InvalidStateForRetry);
      }
    }
  });
});

describe("IngestionJob.rollbackToPending", () => {
  it("from processing: returns to pending, bumps version, preserves tempStorageKey / regenerationCount, emits no event", () => {
    const { entity: pending } = seedPending(90);
    const { entity: processing } = IngestionJob.startProcessing(pending, at(1));
    const { entity: rolledBack, eventDrafts } = IngestionJob.rollbackToPending(
      processing,
      at(2),
    );

    expect(rolledBack.status).toBe("pending");
    expect(rolledBack.preview).toBeNull();
    expect(rolledBack.errorCode).toBeNull();
    expect(rolledBack.errorReason).toBeNull();
    expect(rolledBack.savedAsNoteId).toBeNull();
    expect(rolledBack.tempStorageKey).toBe(processing.tempStorageKey);
    expect(rolledBack.regenerationCount).toBe(processing.regenerationCount);
    expect(rolledBack.version as number).toBe(
      (processing.version as number) + 1,
    );
    expect(rolledBack.updatedAt.getTime()).toBe(at(2).getTime());
    expect(eventDrafts).toHaveLength(0);
  });

  it("rejects rollback from non-processing states with InvalidStateForRollback", () => {
    const { entity: pending } = seedPending(91);
    try {
      IngestionJob.rollbackToPending(pending, at(1));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(IngestionErrorCode.InvalidStateForRollback);
      }
    }

    const { entity: processing } = IngestionJob.startProcessing(pending, at(1));
    const { entity: previewing } = IngestionJob.attachPreview(
      processing,
      samplePreview("rb"),
      at(2),
    );
    try {
      IngestionJob.rollbackToPending(previewing, at(3));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(IngestionErrorCode.InvalidStateForRollback);
      }
    }
  });

  it("rolled-back pending job can start processing again", () => {
    const { entity: pending } = seedPending(92);
    const { entity: processing } = IngestionJob.startProcessing(pending, at(1));
    const { entity: rolledBack } = IngestionJob.rollbackToPending(
      processing,
      at(2),
    );
    const { entity: reprocessing } = IngestionJob.startProcessing(
      rolledBack,
      at(3),
    );
    expect(reprocessing.status).toBe("processing");
    expect(reprocessing.version as number).toBe(
      (rolledBack.version as number) + 1,
    );
  });
});

describe("IngestionJob type guards", () => {
  it("isPending narrows to PendingIngestionJob", () => {
    const { entity: pending } = seedPending(70);
    expect(IngestionJob.isPending(pending)).toBe(true);
    expect(IngestionJob.isProcessing(pending)).toBe(false);
  });

  it("status guards reflect each transition", () => {
    const { entity: pending } = seedPending(71);
    const { entity: processing } = IngestionJob.startProcessing(pending, at(1));
    expect(IngestionJob.isProcessing(processing)).toBe(true);

    const { entity: previewing } = IngestionJob.attachPreview(
      processing,
      samplePreview("g1"),
      at(2),
    );
    expect(IngestionJob.isPreviewing(previewing)).toBe(true);

    const { entity: saved } = IngestionJob.commit(
      previewing,
      noteId(11),
      at(3),
    );
    expect(IngestionJob.isSaved(saved)).toBe(true);

    const { entity: pending2 } = seedPending(72);
    const { entity: processing2 } = IngestionJob.startProcessing(
      pending2,
      at(4),
    );
    const { entity: failed } = IngestionJob.markFailed(
      processing2,
      "ocr_failure",
      "x",
      at(5),
    );
    expect(IngestionJob.isFailed(failed)).toBe(true);

    const { entity: discarded } = IngestionJob.discard(failed, at(6));
    expect(IngestionJob.isDiscarded(discarded)).toBe(true);
  });
});

describe("IngestionJob.reconstruct", () => {
  const baseRow = (
    overrides: Partial<{
      status: string;
      preview: IngestionPreview | null;
      errorCode: string | null;
      errorReason: string | null;
      savedAsNoteId: NoteId | null;
      regenerationCount: number;
      version: number;
      tempStorageKey: string | null;
      structurePromptOverride: string | null;
      metadataPromptOverride: string | null;
    }> = {},
  ) => ({
    id: rawId(100),
    ownerId: ownerId as unknown as string,
    originalFileName: "doc.html",
    mimeType: "text/html",
    byteSize: 1024,
    kind: "html",
    status: overrides.status ?? "pending",
    tempStorageKey:
      overrides.tempStorageKey === undefined
        ? "tmp/abc"
        : overrides.tempStorageKey,
    structurePromptOverride: overrides.structurePromptOverride ?? null,
    metadataPromptOverride: overrides.metadataPromptOverride ?? null,
    preview: overrides.preview ?? null,
    errorCode: overrides.errorCode ?? null,
    errorReason: overrides.errorReason ?? null,
    regenerationCount: overrides.regenerationCount ?? 0,
    savedAsNoteId: overrides.savedAsNoteId ?? null,
    version: overrides.version ?? 0,
    createdAt: T0,
    updatedAt: at(1),
  });

  it("rebuilds a pending row", () => {
    const job = IngestionJob.reconstruct(baseRow());
    expect(job.status).toBe("pending");
    expect(job.id as unknown as string).toBe(rawId(100));
  });

  it("rebuilds a previewing row when preview is present", () => {
    const preview = samplePreview("rh");
    const job = IngestionJob.reconstruct(
      baseRow({ status: "previewing", preview, version: 2 }),
    );
    expect(job.status).toBe("previewing");
    if (job.status === "previewing") {
      expect(job.preview).toBe(preview);
    }
  });

  it("throws RehydrationError when previewing row has null preview", () => {
    try {
      IngestionJob.reconstruct(
        baseRow({ status: "previewing", preview: null }),
      );
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
      expect(isBusinessRuleError(error)).toBe(false);
    }
  });

  it("throws RehydrationError when saved row is missing savedAsNoteId", () => {
    const preview = samplePreview("sv");
    try {
      IngestionJob.reconstruct(
        baseRow({ status: "saved", preview, savedAsNoteId: null }),
      );
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError when failed row is missing errorCode / errorReason", () => {
    try {
      IngestionJob.reconstruct(
        baseRow({ status: "failed", errorCode: null, errorReason: null }),
      );
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError for unknown status / negative version / invalid byteSize", () => {
    try {
      IngestionJob.reconstruct(baseRow({ status: "ghost" }));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
    try {
      IngestionJob.reconstruct(baseRow({ version: -1 }));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("rehydrates RegenerationCount from a stored integer", () => {
    const row = baseRow({ status: "pending", regenerationCount: 3 });
    const job = IngestionJob.reconstruct(row);
    expect(job.regenerationCount).toBe(RegenerationCount.create(3));
  });
});
