import { describe, expect, it } from "vitest";
import { SystemError, SystemErrorCode } from "@/core/application/errors";
import { Version } from "@/core/domain/common/version";
import type { UserId } from "@/core/domain/identity/valueObject";
import {
  type PublicationVisibility,
  PublicationVisibility as PublicationVisibilityVO,
} from "@/core/domain/publication/valueObject";
import type { SavedView } from "@/core/domain/view/entity";
import {
  SavedViewId as SavedViewIdVO,
  SavedViewName as SavedViewNameVO,
  type ViewKind,
} from "@/core/domain/view/valueObject";
import { decodeQueryJson, encodeQueryJson } from "../savedViewRepository";

const VIEW_ID = "01938f00-0000-7000-8000-aaaaaaaaaaa1";

function viewWithVisibilityFilter(
  visibilityFilter: readonly PublicationVisibility[],
): SavedView {
  return {
    id: SavedViewIdVO.create(VIEW_ID),
    ownerId: "01938f00-0000-7000-8000-bbbbbbbbbbbb" as UserId,
    name: SavedViewNameVO.create("Test view"),
    kind: "personal" as ViewKind,
    query: {
      directoryId: null,
      tagIds: [],
      dateRange: null,
      keyword: null,
      referencingNoteId: null,
      visibilityFilter,
    },
    displayMode: "list",
    calendarDateKey: "updated",
    sort: { by: "updatedAt", direction: "desc" },
    isDefault: false,
    brokenConditions: [],
    version: Version.initial(),
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } satisfies SavedView;
}

describe("encodeQueryJson / decodeQueryJson — visibilityFilter (Issue #31)", () => {
  it("encodes and decodes a populated visibilityFilter round-trip", () => {
    const view = viewWithVisibilityFilter([
      PublicationVisibilityVO.create("public"),
      PublicationVisibilityVO.create("unlisted"),
    ]);
    const json = encodeQueryJson(view);
    const decoded = decodeQueryJson(json, VIEW_ID);
    expect(decoded.visibilityFilter).toEqual(["public", "unlisted"]);
  });

  it("encodes and decodes an empty visibilityFilter as []", () => {
    const view = viewWithVisibilityFilter([]);
    const json = encodeQueryJson(view);
    const decoded = decodeQueryJson(json, VIEW_ID);
    expect(decoded.visibilityFilter).toEqual([]);
  });

  // ADR-003: rows persisted before Issue #31 do not carry the
  // `visibilityFilter` key; decode must treat that as "no filter" so
  // existing SavedViews keep loading without a migration.
  it("treats a missing visibilityFilter key as [] (legacy row)", () => {
    const legacy = JSON.stringify({
      directoryId: null,
      tagIds: [],
      dateRange: null,
      keyword: null,
      referencingNoteId: null,
    });
    const decoded = decodeQueryJson(legacy, VIEW_ID);
    expect(decoded.visibilityFilter).toEqual([]);
  });

  it("throws DataIntegrityError when visibilityFilter is not an array", () => {
    const malformed = JSON.stringify({
      directoryId: null,
      tagIds: [],
      dateRange: null,
      keyword: null,
      referencingNoteId: null,
      visibilityFilter: 42,
    });
    try {
      decodeQueryJson(malformed, VIEW_ID);
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SystemError);
      expect((error as SystemError).code).toBe(
        SystemErrorCode.DataIntegrityError,
      );
    }
  });

  it("throws DataIntegrityError when visibilityFilter contains non-string elements", () => {
    const malformed = JSON.stringify({
      directoryId: null,
      tagIds: [],
      dateRange: null,
      keyword: null,
      referencingNoteId: null,
      visibilityFilter: ["public", 5],
    });
    try {
      decodeQueryJson(malformed, VIEW_ID);
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SystemError);
      expect((error as SystemError).code).toBe(
        SystemErrorCode.DataIntegrityError,
      );
    }
  });
});
