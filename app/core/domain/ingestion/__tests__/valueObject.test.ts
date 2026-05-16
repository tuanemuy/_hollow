import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import {
  ContentHtml,
  FrontMatter,
  NoteTitle,
} from "@/core/domain/note/valueObject";
import { IngestionErrorCode } from "../errorCode";
import {
  IngestionJobId,
  IngestionLimits,
  IngestionPreview,
  IngestionStatus,
  MimeType,
  OriginalFileName,
  RegenerationCount,
  SourceFileKind,
  TempStorageKey,
  validateByteSize,
  validateErrorReason,
  validateFailureCode,
} from "../valueObject";

const expectBR = (fn: () => unknown, code: string) => {
  try {
    fn();
    expect.fail("should have thrown");
  } catch (error) {
    expect(isBusinessRuleError(error)).toBe(true);
    if (isBusinessRuleError(error)) {
      expect(error.code).toBe(code);
    }
  }
};

describe("IngestionJobId", () => {
  it("trims and brands a non-empty string", () => {
    const id = IngestionJobId.create(
      "  019db000-0000-7000-8000-000000000001  ",
    );
    expect(id as unknown as string).toBe(
      "019db000-0000-7000-8000-000000000001",
    );
  });

  it("rejects empty / whitespace-only input", () => {
    expectBR(() => IngestionJobId.create(""), IngestionErrorCode.InvalidId);
    expectBR(() => IngestionJobId.create("   "), IngestionErrorCode.InvalidId);
  });
});

describe("IngestionStatus", () => {
  it("accepts every enumerated status", () => {
    for (const status of IngestionStatus.values) {
      expect(IngestionStatus.create(status)).toBe(status);
    }
  });

  it("rejects unknown values with InvalidStatus", () => {
    expectBR(
      () => IngestionStatus.create("archived"),
      IngestionErrorCode.InvalidStatus,
    );
  });
});

describe("SourceFileKind", () => {
  it("accepts every enumerated kind", () => {
    for (const kind of SourceFileKind.values) {
      expect(SourceFileKind.create(kind)).toBe(kind);
    }
  });

  it("rejects unknown kinds with InvalidSourceFileKind", () => {
    expectBR(
      () => SourceFileKind.create("zip"),
      IngestionErrorCode.InvalidSourceFileKind,
    );
  });
});

describe("OriginalFileName", () => {
  it("trims and brands the value", () => {
    const name = OriginalFileName.create("  draft.html  ");
    expect(name as unknown as string).toBe("draft.html");
  });

  it("rejects empty input with InvalidFileName", () => {
    expectBR(
      () => OriginalFileName.create(""),
      IngestionErrorCode.InvalidFileName,
    );
    expectBR(
      () => OriginalFileName.create("   "),
      IngestionErrorCode.InvalidFileName,
    );
  });

  it("rejects names longer than 255 chars with InvalidFileName", () => {
    expectBR(
      () => OriginalFileName.create("a".repeat(256)),
      IngestionErrorCode.InvalidFileName,
    );
  });

  it("accepts exactly 255 chars", () => {
    const name = OriginalFileName.create("a".repeat(255));
    expect((name as unknown as string).length).toBe(255);
  });
});

describe("MimeType", () => {
  it("accepts canonical mime forms", () => {
    expect(MimeType.create("text/html") as unknown as string).toBe("text/html");
    expect(
      MimeType.create(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ) as unknown as string,
    ).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(MimeType.create("  image/png  ") as unknown as string).toBe(
      "image/png",
    );
  });

  it("rejects empty input", () => {
    expectBR(() => MimeType.create(""), IngestionErrorCode.InvalidMimeType);
  });

  it("rejects malformed mime (no slash, illegal chars)", () => {
    expectBR(
      () => MimeType.create("not-a-mime"),
      IngestionErrorCode.InvalidMimeType,
    );
    expectBR(
      () => MimeType.create("text/"),
      IngestionErrorCode.InvalidMimeType,
    );
    expectBR(
      () => MimeType.create("text/html;charset=utf-8"),
      IngestionErrorCode.InvalidMimeType,
    );
  });

  it("rejects too-long values", () => {
    expectBR(
      () => MimeType.create(`text/${"x".repeat(260)}`),
      IngestionErrorCode.InvalidMimeType,
    );
  });
});

describe("TempStorageKey", () => {
  it("accepts and trims a non-empty key", () => {
    expect(TempStorageKey.create("  abc/123  ") as unknown as string).toBe(
      "abc/123",
    );
  });

  it("rejects empty input", () => {
    expectBR(
      () => TempStorageKey.create(""),
      IngestionErrorCode.InvalidTempStorageKey,
    );
    expectBR(
      () => TempStorageKey.create("   "),
      IngestionErrorCode.InvalidTempStorageKey,
    );
  });

  it("rejects keys longer than 1024 chars", () => {
    expectBR(
      () => TempStorageKey.create("a".repeat(1025)),
      IngestionErrorCode.InvalidTempStorageKey,
    );
  });
});

describe("RegenerationCount", () => {
  it("initial() yields zero", () => {
    expect(RegenerationCount.initial() as number).toBe(0);
  });

  it("next() increments by one", () => {
    const c0 = RegenerationCount.initial();
    const c1 = RegenerationCount.next(c0);
    expect(c1 as number).toBe(1);
    expect(RegenerationCount.next(c1) as number).toBe(2);
  });

  it("create() accepts non-negative integers", () => {
    expect(RegenerationCount.create(0) as number).toBe(0);
    expect(RegenerationCount.create(5) as number).toBe(5);
  });

  it("rejects negative / fractional inputs", () => {
    expectBR(
      () => RegenerationCount.create(-1),
      IngestionErrorCode.InvalidRegenerationCount,
    );
    expectBR(
      () => RegenerationCount.create(1.5),
      IngestionErrorCode.InvalidRegenerationCount,
    );
    expectBR(
      () => RegenerationCount.create(Number.NaN),
      IngestionErrorCode.InvalidRegenerationCount,
    );
  });
});

describe("validateErrorReason / validateFailureCode", () => {
  it("trims and returns valid strings", () => {
    expect(validateErrorReason("  oops  ")).toBe("oops");
    expect(validateFailureCode("  llm_failure  ")).toBe("llm_failure");
  });

  it("rejects empty inputs", () => {
    expectBR(
      () => validateErrorReason(""),
      IngestionErrorCode.InvalidErrorReason,
    );
    expectBR(
      () => validateErrorReason("   "),
      IngestionErrorCode.InvalidErrorReason,
    );
    expectBR(
      () => validateFailureCode(""),
      IngestionErrorCode.InvalidErrorCode,
    );
    expectBR(
      () => validateFailureCode("   "),
      IngestionErrorCode.InvalidErrorCode,
    );
  });

  it("rejects over-length inputs", () => {
    expectBR(
      () => validateErrorReason("a".repeat(2049)),
      IngestionErrorCode.InvalidErrorReason,
    );
    expectBR(
      () => validateFailureCode("a".repeat(129)),
      IngestionErrorCode.InvalidErrorCode,
    );
  });
});

describe("validateByteSize", () => {
  it("accepts zero and positive integers", () => {
    expect(validateByteSize(0)).toBe(0);
    expect(validateByteSize(1024)).toBe(1024);
  });

  it("rejects negatives, fractions, non-finite values, and over-cap values", () => {
    expectBR(() => validateByteSize(-1), IngestionErrorCode.InvalidByteSize);
    expectBR(() => validateByteSize(1.5), IngestionErrorCode.InvalidByteSize);
    expectBR(
      () => validateByteSize(Number.POSITIVE_INFINITY),
      IngestionErrorCode.InvalidByteSize,
    );
    expectBR(
      () => validateByteSize(5 * 1024 * 1024 * 1024 * 1024 + 1),
      IngestionErrorCode.InvalidByteSize,
    );
  });
});

describe("IngestionLimits", () => {
  it("defaults() yields 50 MiB cap and 5 regenerations", () => {
    const limits = IngestionLimits.defaults();
    expect(limits.defaultMaxBytes).toBe(50 * 1024 * 1024);
    expect(limits.maxRegenerations).toBe(5);
    expect(Object.keys(limits.maxBytesByKind)).toHaveLength(0);
  });

  it("create() validates positive defaultMaxBytes and non-negative maxRegenerations", () => {
    expectBR(
      () =>
        IngestionLimits.create({
          defaultMaxBytes: 0,
          maxRegenerations: 5,
        }),
      IngestionErrorCode.InvalidIngestionLimits,
    );
    expectBR(
      () =>
        IngestionLimits.create({
          defaultMaxBytes: -1,
          maxRegenerations: 5,
        }),
      IngestionErrorCode.InvalidIngestionLimits,
    );
    expectBR(
      () =>
        IngestionLimits.create({
          defaultMaxBytes: 1024,
          maxRegenerations: -1,
        }),
      IngestionErrorCode.InvalidIngestionLimits,
    );
  });

  it("create() validates per-kind overrides", () => {
    const limits = IngestionLimits.create({
      defaultMaxBytes: 1024,
      maxBytesByKind: { html: 2048, image: 4096 },
      maxRegenerations: 3,
    });
    expect(limits.maxBytesByKind.html).toBe(2048);
    expect(limits.maxBytesByKind.image).toBe(4096);

    expectBR(
      () =>
        IngestionLimits.create({
          defaultMaxBytes: 1024,
          maxBytesByKind: { html: 0 },
          maxRegenerations: 3,
        }),
      IngestionErrorCode.InvalidIngestionLimits,
    );
  });

  it("maxBytesFor() prefers per-kind override, falls back to default", () => {
    const limits = IngestionLimits.create({
      defaultMaxBytes: 1024,
      maxBytesByKind: { image: 4096 },
      maxRegenerations: 3,
    });
    expect(IngestionLimits.maxBytesFor(limits, "image")).toBe(4096);
    expect(IngestionLimits.maxBytesFor(limits, "html")).toBe(1024);
  });
});

describe("IngestionPreview", () => {
  const baseParams = () => ({
    title: NoteTitle.create("My doc"),
    contentHtml: ContentHtml.create("<p>hi</p>"),
    suggestedDirectoryId: null,
    suggestedDirectoryName: null,
    frontMatter: FrontMatter.empty(),
    suggestedTagNames: [] as const,
    internalLinkRefs: [] as const,
    mediaRefs: [] as const,
  });

  it("builds a preview with frozen arrays", () => {
    const preview = IngestionPreview.create(baseParams());
    expect(preview.title as unknown as string).toBe("My doc");
    expect(Object.isFrozen(preview.suggestedTagNames)).toBe(true);
    expect(Object.isFrozen(preview.internalLinkRefs)).toBe(true);
    expect(Object.isFrozen(preview.mediaRefs)).toBe(true);
  });

  it("trims suggested directory name; treats whitespace-only as null", () => {
    const preview = IngestionPreview.create({
      ...baseParams(),
      suggestedDirectoryName: "  Notes  ",
    });
    expect(preview.suggestedDirectoryName).toBe("Notes");

    const whitespace = IngestionPreview.create({
      ...baseParams(),
      suggestedDirectoryName: "   ",
    });
    expect(whitespace.suggestedDirectoryName).toBeNull();
  });

  it("rejects suggested directory name longer than 200 chars", () => {
    expectBR(
      () =>
        IngestionPreview.create({
          ...baseParams(),
          suggestedDirectoryName: "a".repeat(201),
        }),
      IngestionErrorCode.InvalidSuggestedDirectoryName,
    );
  });
});
