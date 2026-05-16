import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { PublicationVisibility } from "@/core/domain/publication/valueObject";
import { ExportJob } from "../entity";
import { ExportErrorCode } from "../errorCode";
import { ExportService } from "../service";
import { type ExportLimits, ExportOptions } from "../valueObject";

const T0 = new Date(0);

const noteId = (n: number): NoteId => `note-${n}` as NoteId;
const owner = (raw: string): UserId => UserId.create(raw);

const makeJob = (overrides: {
  ownerId?: UserId;
  scope?: "single" | "multiple" | "view";
  targetNoteIds?: readonly NoteId[];
}) => {
  const ownerId = overrides.ownerId ?? owner("owner-1");
  const scope = overrides.scope ?? "multiple";
  const targetNoteIds = overrides.targetNoteIds ?? [noteId(1), noteId(2)];
  const { entity } = ExportJob.create(
    {
      id: "00000000-0000-7000-8000-000000000001",
      ownerId,
      format: "html",
      scope,
      targetNoteIds: scope === "view" ? [] : targetNoteIds,
      viewQuery:
        scope === "view"
          ? {
              directoryId: null,
              tagIds: [],
              dateRange: null,
              keyword: null,
              referencingNoteId: null,
            }
          : null,
      options: ExportOptions.create({
        includeFrontMatter: false,
        embedMedia: false,
        pdfPaperSize: null,
      }),
    },
    T0,
  );
  return entity;
};

describe("ExportService.assertCanAccess", () => {
  it("anonymous + single public note: allowed", () => {
    const id = noteId(1);
    expect(() =>
      ExportService.assertCanAccess({
        viewerOwnerId: null,
        targetNoteIds: [id],
        visibilityMap: new Map<NoteId, PublicationVisibility>([[id, "public"]]),
        ownerMap: new Map<NoteId, UserId>([[id, owner("o1")]]),
      }),
    ).not.toThrow();
  });

  it("anonymous + single private note: Unauthorized", () => {
    const id = noteId(2);
    try {
      ExportService.assertCanAccess({
        viewerOwnerId: null,
        targetNoteIds: [id],
        visibilityMap: new Map<NoteId, PublicationVisibility>([
          [id, "private"],
        ]),
        ownerMap: new Map<NoteId, UserId>([[id, owner("o1")]]),
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.Unauthorized);
      }
    }
  });

  it("anonymous + single unlisted note: Unauthorized (anonymous requires public)", () => {
    const id = noteId(3);
    try {
      ExportService.assertCanAccess({
        viewerOwnerId: null,
        targetNoteIds: [id],
        visibilityMap: new Map<NoteId, PublicationVisibility>([
          [id, "unlisted"],
        ]),
        ownerMap: new Map<NoteId, UserId>([[id, owner("o1")]]),
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
    }
  });

  it("anonymous + multiple notes: Unauthorized (bulk requires viewer)", () => {
    try {
      ExportService.assertCanAccess({
        viewerOwnerId: null,
        targetNoteIds: [noteId(1), noteId(2)],
        visibilityMap: new Map<NoteId, PublicationVisibility>([
          [noteId(1), "public"],
          [noteId(2), "public"],
        ]),
        ownerMap: new Map<NoteId, UserId>([
          [noteId(1), owner("o1")],
          [noteId(2), owner("o2")],
        ]),
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.Unauthorized);
      }
    }
  });

  it("authenticated + single owned note: allowed", () => {
    const id = noteId(4);
    const viewer = owner("o1");
    expect(() =>
      ExportService.assertCanAccess({
        viewerOwnerId: viewer,
        targetNoteIds: [id],
        visibilityMap: new Map<NoteId, PublicationVisibility>([
          [id, "private"],
        ]),
        ownerMap: new Map<NoteId, UserId>([[id, viewer]]),
      }),
    ).not.toThrow();
  });

  it("authenticated + single public note owned by another: allowed", () => {
    const id = noteId(5);
    expect(() =>
      ExportService.assertCanAccess({
        viewerOwnerId: owner("viewer"),
        targetNoteIds: [id],
        visibilityMap: new Map<NoteId, PublicationVisibility>([[id, "public"]]),
        ownerMap: new Map<NoteId, UserId>([[id, owner("other")]]),
      }),
    ).not.toThrow();
  });

  it("authenticated + single unlisted note owned by another: allowed", () => {
    const id = noteId(6);
    expect(() =>
      ExportService.assertCanAccess({
        viewerOwnerId: owner("viewer"),
        targetNoteIds: [id],
        visibilityMap: new Map<NoteId, PublicationVisibility>([
          [id, "unlisted"],
        ]),
        ownerMap: new Map<NoteId, UserId>([[id, owner("other")]]),
      }),
    ).not.toThrow();
  });

  it("authenticated + single private note owned by another: Unauthorized", () => {
    const id = noteId(7);
    try {
      ExportService.assertCanAccess({
        viewerOwnerId: owner("viewer"),
        targetNoteIds: [id],
        visibilityMap: new Map<NoteId, PublicationVisibility>([
          [id, "private"],
        ]),
        ownerMap: new Map<NoteId, UserId>([[id, owner("other")]]),
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.Unauthorized);
      }
    }
  });

  it("authenticated + bulk fully owned: allowed", () => {
    const viewer = owner("viewer");
    expect(() =>
      ExportService.assertCanAccess({
        viewerOwnerId: viewer,
        targetNoteIds: [noteId(1), noteId(2)],
        visibilityMap: new Map<NoteId, PublicationVisibility>([
          [noteId(1), "private"],
          [noteId(2), "public"],
        ]),
        ownerMap: new Map<NoteId, UserId>([
          [noteId(1), viewer],
          [noteId(2), viewer],
        ]),
      }),
    ).not.toThrow();
  });

  it("authenticated + bulk containing a note owned by someone else: Unauthorized", () => {
    const viewer = owner("viewer");
    try {
      ExportService.assertCanAccess({
        viewerOwnerId: viewer,
        targetNoteIds: [noteId(1), noteId(2)],
        visibilityMap: new Map<NoteId, PublicationVisibility>([
          [noteId(1), "public"],
          [noteId(2), "public"],
        ]),
        ownerMap: new Map<NoteId, UserId>([
          [noteId(1), viewer],
          [noteId(2), owner("other")],
        ]),
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.Unauthorized);
      }
    }
  });

  it("authenticated + missing visibility entry treated as not viewable", () => {
    const id = noteId(8);
    const viewer = owner("viewer");
    try {
      ExportService.assertCanAccess({
        viewerOwnerId: viewer,
        targetNoteIds: [id],
        visibilityMap: new Map(),
        ownerMap: new Map<NoteId, UserId>([[id, owner("other")]]),
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
    }
  });
});

describe("ExportService.enforceQuota", () => {
  const limits: ExportLimits = { maxConcurrentJobs: 3, maxJobsPerDay: 10 };
  const job = makeJob({});

  it("allows usage below both caps", () => {
    expect(() => ExportService.enforceQuota(job, 0, limits)).not.toThrow();
    expect(() => ExportService.enforceQuota(job, 2, limits)).not.toThrow();
  });

  it("rejects when usage equals concurrent cap", () => {
    try {
      ExportService.enforceQuota(job, 3, limits);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.QuotaExceeded);
      }
    }
  });

  it("rejects when usage exceeds either cap", () => {
    try {
      ExportService.enforceQuota(job, 10, limits);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.QuotaExceeded);
      }
    }
  });
});
