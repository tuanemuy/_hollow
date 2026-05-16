import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import { MediaErrorCode } from "../errorCode";
import {
  MediaAssetId,
  MediaKind,
  MediaStatus,
  MimeType,
  OriginalFileName,
  StorageBackend,
  StorageKey,
  Visibility,
  validateByteSize,
  validateDimension,
  validateDurationMs,
  validateRefCount,
} from "../valueObject";

const expectBusinessRule = (fn: () => unknown, code: string) => {
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

describe("MediaAssetId", () => {
  it("accepts a non-empty string and trims surrounding whitespace", () => {
    const id = MediaAssetId.create("  abc-123  ");
    expect(id as unknown as string).toBe("abc-123");
  });

  it("throws InvalidId for empty / whitespace-only", () => {
    expectBusinessRule(() => MediaAssetId.create(""), MediaErrorCode.InvalidId);
    expectBusinessRule(
      () => MediaAssetId.create("   "),
      MediaErrorCode.InvalidId,
    );
  });
});

describe("MediaKind", () => {
  it.each(["image", "video", "avatar"] as const)("accepts %s", (k) => {
    expect(MediaKind.create(k)).toBe(k);
  });

  it("throws InvalidKind for unknown", () => {
    expectBusinessRule(
      () => MediaKind.create("audio"),
      MediaErrorCode.InvalidKind,
    );
  });
});

describe("StorageBackend", () => {
  it("accepts 'r2'", () => {
    expect(StorageBackend.create("r2")).toBe("r2");
  });

  it("rejects unknown backends so adding s3/github forces a domain review", () => {
    expectBusinessRule(
      () => StorageBackend.create("s3"),
      MediaErrorCode.InvalidBackend,
    );
  });
});

describe("MediaStatus", () => {
  it.each([
    "pending",
    "attached",
    "orphan",
    "deleting",
  ] as const)("accepts %s", (s) => {
    expect(MediaStatus.create(s)).toBe(s);
  });

  it("throws InvalidStatus for unknown", () => {
    expectBusinessRule(
      () => MediaStatus.create("archived"),
      MediaErrorCode.InvalidStatus,
    );
  });
});

describe("Visibility", () => {
  it.each(["private", "unlisted", "public"] as const)("accepts %s", (v) => {
    expect(Visibility.create(v)).toBe(v);
  });

  it("throws InvalidVisibility for unknown", () => {
    expectBusinessRule(
      () => Visibility.create("internal"),
      MediaErrorCode.InvalidVisibility,
    );
  });
});

describe("MimeType", () => {
  it.each([
    "image/png",
    "image/jpeg",
    "video/mp4",
    "application/json",
  ])("accepts shape type/subtype: %s", (raw) => {
    expect(MimeType.create(raw) as unknown as string).toBe(raw);
  });

  it("trims surrounding whitespace", () => {
    expect(MimeType.create("  image/png  ") as unknown as string).toBe(
      "image/png",
    );
  });

  it("throws InvalidMimeType for empty / whitespace-only", () => {
    expectBusinessRule(
      () => MimeType.create(""),
      MediaErrorCode.InvalidMimeType,
    );
    expectBusinessRule(
      () => MimeType.create("   "),
      MediaErrorCode.InvalidMimeType,
    );
  });

  it("throws InvalidMimeType for malformed (missing subtype)", () => {
    expectBusinessRule(
      () => MimeType.create("image"),
      MediaErrorCode.InvalidMimeType,
    );
  });

  it("throws InvalidMimeType when over 255 chars", () => {
    const raw = `image/${"a".repeat(250)}`;
    expectBusinessRule(
      () => MimeType.create(raw),
      MediaErrorCode.InvalidMimeType,
    );
  });
});

describe("StorageKey", () => {
  it("trims and returns the branded key", () => {
    expect(StorageKey.create("  u/i/abc  ") as unknown as string).toBe(
      "u/i/abc",
    );
  });

  it("throws InvalidStorageKey for empty", () => {
    expectBusinessRule(
      () => StorageKey.create(""),
      MediaErrorCode.InvalidStorageKey,
    );
  });

  it("throws InvalidStorageKey when exceeds 1024 chars", () => {
    expectBusinessRule(
      () => StorageKey.create("a".repeat(1025)),
      MediaErrorCode.InvalidStorageKey,
    );
  });
});

describe("OriginalFileName", () => {
  it("trims and returns the branded name", () => {
    expect(OriginalFileName.create("  photo.png  ") as unknown as string).toBe(
      "photo.png",
    );
  });

  it("throws InvalidOriginalFileName for empty", () => {
    expectBusinessRule(
      () => OriginalFileName.create(""),
      MediaErrorCode.InvalidOriginalFileName,
    );
  });

  it("throws InvalidOriginalFileName when exceeds 255 chars", () => {
    expectBusinessRule(
      () => OriginalFileName.create("a".repeat(256)),
      MediaErrorCode.InvalidOriginalFileName,
    );
  });
});

describe("validateByteSize", () => {
  it("accepts 0 and positive integers within the cap", () => {
    expect(validateByteSize(0)).toBe(0);
    expect(validateByteSize(1)).toBe(1);
    expect(validateByteSize(1_000_000)).toBe(1_000_000);
  });

  it("rejects negative / non-integer / over-cap", () => {
    expectBusinessRule(
      () => validateByteSize(-1),
      MediaErrorCode.InvalidByteSize,
    );
    expectBusinessRule(
      () => validateByteSize(1.5),
      MediaErrorCode.InvalidByteSize,
    );
    expectBusinessRule(
      () => validateByteSize(Number.NaN),
      MediaErrorCode.InvalidByteSize,
    );
    expectBusinessRule(
      () => validateByteSize(6 * 1024 * 1024 * 1024 * 1024),
      MediaErrorCode.InvalidByteSize,
    );
  });
});

describe("validateDimension", () => {
  it("accepts positive integers", () => {
    expect(validateDimension(1)).toBe(1);
    expect(validateDimension(1920)).toBe(1920);
  });

  it("rejects zero / negative / non-integer", () => {
    expectBusinessRule(
      () => validateDimension(0),
      MediaErrorCode.InvalidDimension,
    );
    expectBusinessRule(
      () => validateDimension(-1),
      MediaErrorCode.InvalidDimension,
    );
    expectBusinessRule(
      () => validateDimension(1.5),
      MediaErrorCode.InvalidDimension,
    );
  });
});

describe("validateDurationMs", () => {
  it("accepts 0 and positive integers", () => {
    expect(validateDurationMs(0)).toBe(0);
    expect(validateDurationMs(1_000)).toBe(1_000);
  });

  it("rejects negative / non-integer", () => {
    expectBusinessRule(
      () => validateDurationMs(-1),
      MediaErrorCode.InvalidDuration,
    );
    expectBusinessRule(
      () => validateDurationMs(1.5),
      MediaErrorCode.InvalidDuration,
    );
  });
});

describe("validateRefCount", () => {
  it("accepts 0 and positive integers", () => {
    expect(validateRefCount(0)).toBe(0);
    expect(validateRefCount(7)).toBe(7);
  });

  it("rejects negative / non-integer", () => {
    expectBusinessRule(
      () => validateRefCount(-1),
      MediaErrorCode.InvalidRefCount,
    );
    expectBusinessRule(
      () => validateRefCount(0.5),
      MediaErrorCode.InvalidRefCount,
    );
  });
});
