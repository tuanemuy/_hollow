import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { NoteErrorCode } from "../errorCode";
import {
  ContentHtml,
  ContentMd,
  EditLock,
  FrontMatter,
  type FrontMatterRecord,
  InternalLinkRef,
  MAX_EDIT_LOCK_TTL_SECONDS,
  NoteId,
  NoteSlug,
  NoteStatus,
  NoteTitle,
} from "../valueObject";

const VALID_UUID_V7 = "01950000-0000-7000-8000-000000000001";
const userId = (raw: string) => raw as UserId;

describe("NoteId", () => {
  it("trims and brands a non-empty id", () => {
    const id = NoteId.create(`  ${VALID_UUID_V7}  `);
    expect(id as unknown as string).toBe(VALID_UUID_V7);
  });

  it("throws InvalidId when empty or whitespace", () => {
    for (const raw of ["", "   ", "\t\n"]) {
      try {
        NoteId.create(raw);
        expect.fail(`expected throw for ${JSON.stringify(raw)}`);
      } catch (error) {
        expect(isBusinessRuleError(error)).toBe(true);
        if (isBusinessRuleError(error)) {
          expect(error.code).toBe(NoteErrorCode.InvalidId);
        }
      }
    }
  });
});

describe("NoteSlug", () => {
  it("accepts a valid kebab-case slug", () => {
    const slug = NoteSlug.create("hello-world-2");
    expect(slug as unknown as string).toBe("hello-world-2");
  });

  it("rejects empty / too-long / invalid-shape inputs", () => {
    const cases: Array<{ raw: string; code: string }> = [
      { raw: "", code: NoteErrorCode.SlugEmpty },
      { raw: "a".repeat(121), code: NoteErrorCode.SlugTooLong },
      { raw: "-leading", code: NoteErrorCode.InvalidSlug },
      { raw: "Has Space", code: NoteErrorCode.InvalidSlug },
      { raw: "UPPER", code: NoteErrorCode.InvalidSlug },
    ];
    for (const { raw, code } of cases) {
      try {
        NoteSlug.create(raw);
        expect.fail(`expected throw for ${JSON.stringify(raw)}`);
      } catch (error) {
        expect(isBusinessRuleError(error)).toBe(true);
        if (isBusinessRuleError(error)) {
          expect(error.code).toBe(code);
        }
      }
    }
  });

  it("equality is structural (string-equal)", () => {
    const a = NoteSlug.create("foo");
    const b = NoteSlug.create("foo");
    const c = NoteSlug.create("bar");
    expect(NoteSlug.equals(a, b)).toBe(true);
    expect(NoteSlug.equals(a, c)).toBe(false);
  });
});

describe("NoteTitle", () => {
  it("trims input and brands the result", () => {
    const title = NoteTitle.create("   hello   ");
    expect(title as unknown as string).toBe("hello");
  });

  it("rejects empty / whitespace-only with TitleEmpty", () => {
    for (const raw of ["", "   "]) {
      try {
        NoteTitle.create(raw);
        expect.fail("should have thrown");
      } catch (error) {
        expect(isBusinessRuleError(error)).toBe(true);
        if (isBusinessRuleError(error)) {
          expect(error.code).toBe(NoteErrorCode.TitleEmpty);
        }
      }
    }
  });

  it("rejects > 200 chars with TitleTooLong", () => {
    try {
      NoteTitle.create("a".repeat(201));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(NoteErrorCode.TitleTooLong);
      }
    }
  });

  it("accepts a title at exactly 200 chars", () => {
    const title = NoteTitle.create("a".repeat(200));
    expect((title as unknown as string).length).toBe(200);
  });
});

describe("ContentHtml", () => {
  it("accepts payloads within the 1 MiB cap", () => {
    const html = ContentHtml.create("<p>hello</p>");
    expect(html as unknown as string).toBe("<p>hello</p>");
  });

  it("rejects payloads above 1 MiB with ContentTooLarge", () => {
    const big = "a".repeat(1024 * 1024 + 1);
    try {
      ContentHtml.create(big);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(NoteErrorCode.ContentTooLarge);
      }
    }
  });
});

describe("ContentMd", () => {
  it("rejects oversized markdown", () => {
    const big = "a".repeat(1024 * 1024 + 1);
    try {
      ContentMd.create(big);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(NoteErrorCode.ContentTooLarge);
      }
    }
  });
});

describe("NoteStatus", () => {
  it("accepts 'active' and 'trashed'", () => {
    expect(NoteStatus.create("active")).toBe("active");
    expect(NoteStatus.create("trashed")).toBe("trashed");
  });

  it("rejects any other label", () => {
    try {
      NoteStatus.create("archived");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(NoteErrorCode.InvalidStatus);
      }
    }
  });
});

describe("FrontMatter", () => {
  it("empty() returns a record without keys", () => {
    const fm = FrontMatter.empty();
    expect(Object.keys(fm)).toHaveLength(0);
  });

  it("accepts a flat ASCII-keyed record with primitives / string arrays", () => {
    const raw: FrontMatterRecord = {
      title: "T",
      n: 1,
      ok: true,
      tags: ["a", "b"],
    };
    const fm = FrontMatter.create(raw);
    expect(fm).toEqual(raw);
  });

  it("accepts nested records up to depth 3", () => {
    const raw: FrontMatterRecord = {
      a: { b: "leaf" },
    };
    expect(() => FrontMatter.create(raw)).not.toThrow();
  });

  it("rejects nested records beyond depth 3", () => {
    const raw: FrontMatterRecord = {
      a: { b: { c: "tooDeep" } },
    };
    try {
      FrontMatter.create(raw);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(NoteErrorCode.FrontMatterTooDeep);
      }
    }
  });

  it("rejects non-ASCII keys", () => {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: deliberate non-ASCII test input
      FrontMatter.create({ ["タイトル" as any]: "x" });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(NoteErrorCode.FrontMatterKeyInvalid);
      }
    }
  });

  it("rejects non-string array entries", () => {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: deliberate invalid input
      FrontMatter.create({ a: [1, 2] as any });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(NoteErrorCode.FrontMatterInvalidValue);
      }
    }
  });

  it("rejects payloads above 64 KiB", () => {
    const big = "a".repeat(64 * 1024);
    try {
      FrontMatter.create({ blob: big });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(NoteErrorCode.FrontMatterTooLarge);
      }
    }
  });

  it("equality ignores key order", () => {
    const a = FrontMatter.create({ a: 1, b: 2 });
    const b = FrontMatter.create({ b: 2, a: 1 });
    expect(FrontMatter.equals(a, b)).toBe(true);
  });
});

describe("InternalLinkRef", () => {
  it("rejects an unknown kind", () => {
    try {
      InternalLinkRef.create({
        // biome-ignore lint/suspicious/noExplicitAny: probe invalid kind
        kind: "weird" as any,
        target: "x",
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(NoteErrorCode.InternalLinkInvalidKind);
      }
    }
  });

  it("kind=id requires a UUIDv7 target", () => {
    try {
      InternalLinkRef.create({ kind: "id", target: "not-uuid" });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(NoteErrorCode.InternalLinkInvalidTarget);
      }
    }
    const ok = InternalLinkRef.create({ kind: "id", target: VALID_UUID_V7 });
    expect(ok.target).toBe(VALID_UUID_V7);
  });

  it("kind=title trims and bounds length", () => {
    const ref = InternalLinkRef.create({
      kind: "title",
      target: "  Other Note  ",
    });
    expect(ref.target).toBe("Other Note");

    try {
      InternalLinkRef.create({ kind: "title", target: "" });
      expect.fail("empty title accepted");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
    }
    try {
      InternalLinkRef.create({ kind: "title", target: "a".repeat(201) });
      expect.fail("over-long title accepted");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
    }
  });

  it("equals compares only kind + target", () => {
    const a = InternalLinkRef.create({ kind: "title", target: "x" });
    const b = InternalLinkRef.create({
      kind: "title",
      target: "x",
      displayText: "different",
    });
    expect(InternalLinkRef.equals(a, b)).toBe(true);
  });

  it("withResolved updates the resolved id without touching kind/target", () => {
    const ref = InternalLinkRef.create({ kind: "title", target: "x" });
    const noteId = NoteId.create(VALID_UUID_V7);
    const next = InternalLinkRef.withResolved(ref, noteId);
    expect(next.resolvedNoteId).toBe(noteId);
    expect(next.kind).toBe(ref.kind);
    expect(next.target).toBe(ref.target);
  });
});

describe("EditLock", () => {
  it("requires expiresAt > acquiredAt", () => {
    const t = new Date(1_000_000);
    try {
      EditLock.create({
        userId: userId("u-1"),
        acquiredAt: t,
        expiresAt: t,
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(NoteErrorCode.EditLockInvalidExpiry);
      }
    }
  });

  it("rejects TTLs longer than the configured maximum", () => {
    const acq = new Date(0);
    const exp = new Date((MAX_EDIT_LOCK_TTL_SECONDS + 1) * 1000);
    try {
      EditLock.create({
        userId: userId("u-1"),
        acquiredAt: acq,
        expiresAt: exp,
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(NoteErrorCode.EditLockTtlTooLong);
      }
    }
  });

  it("isLive returns true while now < expiresAt", () => {
    const acq = new Date(0);
    const exp = new Date(60_000);
    const lock = EditLock.create({
      userId: userId("u-1"),
      acquiredAt: acq,
      expiresAt: exp,
    });
    expect(EditLock.isLive(lock, new Date(30_000))).toBe(true);
    expect(EditLock.isLive(lock, new Date(60_000))).toBe(false);
    expect(EditLock.isLive(lock, new Date(60_001))).toBe(false);
  });

  it("equals compares user / acquiredAt / expiresAt", () => {
    const acq = new Date(0);
    const exp = new Date(60_000);
    const a = EditLock.create({
      userId: userId("u-1"),
      acquiredAt: acq,
      expiresAt: exp,
    });
    const b = EditLock.create({
      userId: userId("u-1"),
      acquiredAt: acq,
      expiresAt: exp,
    });
    const c = EditLock.create({
      userId: userId("u-2"),
      acquiredAt: acq,
      expiresAt: exp,
    });
    expect(EditLock.equals(a, b)).toBe(true);
    expect(EditLock.equals(a, c)).toBe(false);
  });
});
