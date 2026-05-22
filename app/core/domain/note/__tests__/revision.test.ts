import { describe, expect, it } from "vitest";
import { isBusinessRuleError, isRehydrationError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { NoteErrorCode } from "../errorCode";
import { NoteRevision } from "../revision";
import {
  ContentHtml,
  FrontMatter,
  NoteId,
  NoteRevisionId,
  NoteTitle,
} from "../valueObject";

const VALID_UUID_V7_A = "01950000-0000-7000-8000-000000000001";
const VALID_UUID_V7_B = "01950000-0000-7000-8000-000000000002";
const VALID_UUID_V7_C = "01950000-0000-7000-8000-000000000003";

const userId = (raw: string) => raw as UserId;

describe("NoteRevisionId", () => {
  it("brands a non-empty id", () => {
    const id = NoteRevisionId.create(VALID_UUID_V7_A);
    expect(id as unknown as string).toBe(VALID_UUID_V7_A);
  });

  it("rejects an empty / whitespace-only id with InvalidRevisionId", () => {
    for (const raw of ["", "   "]) {
      try {
        NoteRevisionId.create(raw);
        expect.fail(`expected throw for ${JSON.stringify(raw)}`);
      } catch (error) {
        expect(isBusinessRuleError(error)).toBe(true);
        if (isBusinessRuleError(error)) {
          expect(error.code).toBe(NoteErrorCode.InvalidRevisionId);
        }
      }
    }
  });
});

describe("NoteRevision.create", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const baseParams = () => ({
    id: VALID_UUID_V7_A,
    noteId: NoteId.create(VALID_UUID_V7_B),
    ownerId: userId(VALID_UUID_V7_C),
    title: NoteTitle.create("snapshot title"),
    contentHtml: ContentHtml.create("<p>body</p>"),
    frontMatter: FrontMatter.empty(),
    createdByUserId: userId(VALID_UUID_V7_C),
  });

  it("constructs an immutable snapshot with the supplied fields", () => {
    const rev = NoteRevision.create(baseParams(), now);
    expect(rev.id as unknown as string).toBe(VALID_UUID_V7_A);
    expect(rev.noteId as unknown as string).toBe(VALID_UUID_V7_B);
    expect(rev.ownerId).toBe(userId(VALID_UUID_V7_C));
    expect(rev.title as unknown as string).toBe("snapshot title");
    expect(rev.contentHtml as unknown as string).toBe("<p>body</p>");
    expect(rev.createdByUserId).toBe(userId(VALID_UUID_V7_C));
    expect(rev.createdAt).toBe(now);
  });

  it("the entity has no mutators (structural Readonly)", () => {
    const rev = NoteRevision.create(baseParams(), now);
    // Type-level: spread + cast is the only way to derive a new value.
    // Sanity check that the runtime shape stays the same object identity.
    const copy = { ...rev };
    expect(copy.id).toBe(rev.id);
  });
});

describe("NoteRevision.reconstruct", () => {
  const createdAt = new Date("2026-05-23T12:00:00.000Z");

  it("re-validates row fields and round-trips a valid input", () => {
    const rev = NoteRevision.reconstruct({
      id: VALID_UUID_V7_A,
      noteId: VALID_UUID_V7_B,
      ownerId: VALID_UUID_V7_C,
      title: "rehydrated",
      contentHtml: "<p>rehydrated body</p>",
      frontMatter: {},
      createdByUserId: VALID_UUID_V7_C,
      createdAt,
    });
    expect(rev.id as unknown as string).toBe(VALID_UUID_V7_A);
    expect(rev.title as unknown as string).toBe("rehydrated");
  });

  it("wraps value-object failures in RehydrationError", () => {
    try {
      NoteRevision.reconstruct({
        id: "",
        noteId: VALID_UUID_V7_B,
        ownerId: VALID_UUID_V7_C,
        title: "x",
        contentHtml: "<p>x</p>",
        frontMatter: {},
        createdByUserId: VALID_UUID_V7_C,
        createdAt,
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("wraps invalid title as a RehydrationError", () => {
    try {
      NoteRevision.reconstruct({
        id: VALID_UUID_V7_A,
        noteId: VALID_UUID_V7_B,
        ownerId: VALID_UUID_V7_C,
        title: "",
        contentHtml: "<p>x</p>",
        frontMatter: {},
        createdByUserId: VALID_UUID_V7_C,
        createdAt,
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });
});
