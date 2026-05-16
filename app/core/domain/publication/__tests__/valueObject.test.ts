import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import { PublicationErrorCode } from "../errorCode";
import {
  PublicationVisibility,
  ShareLinkId,
  ShareLinkPassword,
  ShareLinkStatus,
  ShareLinkTokenHash,
  validateFailedAttempts,
} from "../valueObject";

describe("ShareLinkId", () => {
  it("throws InvalidShareLinkId for empty input", () => {
    try {
      ShareLinkId.create("");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(PublicationErrorCode.InvalidShareLinkId);
      }
    }
  });

  it("throws InvalidShareLinkId for whitespace-only input", () => {
    try {
      ShareLinkId.create("   \t\n");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
    }
  });

  it("trims surrounding whitespace and accepts non-empty opaque strings", () => {
    const created = ShareLinkId.create("  abc  ");
    expect(created as unknown as string).toBe("abc");
  });
});

describe("ShareLinkTokenHash", () => {
  it("throws InvalidTokenHash for empty input", () => {
    try {
      ShareLinkTokenHash.create("");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(PublicationErrorCode.InvalidTokenHash);
      }
    }
  });

  it("trims surrounding whitespace", () => {
    const hash = ShareLinkTokenHash.create("  hash  ");
    expect(hash as unknown as string).toBe("hash");
  });
});

describe("PublicationVisibility", () => {
  it.each(["private", "unlisted", "public"] as const)("accepts %s", (value) => {
    expect(PublicationVisibility.create(value)).toBe(value);
  });

  it("rejects any other string with InvalidVisibility", () => {
    try {
      PublicationVisibility.create("draft");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(PublicationErrorCode.InvalidVisibility);
      }
    }
  });
});

describe("ShareLinkStatus", () => {
  it.each(["active", "revoked"] as const)("accepts %s", (value) => {
    expect(ShareLinkStatus.create(value)).toBe(value);
  });

  it("rejects any other string with InvalidShareLinkStatus", () => {
    try {
      ShareLinkStatus.create("expired");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(PublicationErrorCode.InvalidShareLinkStatus);
      }
    }
  });
});

describe("ShareLinkPassword", () => {
  it("rejects a password shorter than 8 characters with ShareLinkPasswordTooShort", () => {
    try {
      ShareLinkPassword.create("a".repeat(7));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(PublicationErrorCode.ShareLinkPasswordTooShort);
      }
    }
  });

  it("accepts a password exactly 8 characters long", () => {
    const created = ShareLinkPassword.create("a".repeat(8));
    expect((created as unknown as string).length).toBe(8);
  });

  it("accepts a password exactly 128 characters long", () => {
    const created = ShareLinkPassword.create("a".repeat(128));
    expect((created as unknown as string).length).toBe(128);
  });

  it("rejects a password longer than 128 characters with ShareLinkPasswordTooLong", () => {
    try {
      ShareLinkPassword.create("a".repeat(129));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(PublicationErrorCode.ShareLinkPasswordTooLong);
      }
    }
  });

  it("does not trim — whitespace is allowed inside the password", () => {
    const raw = "  has spaces  ";
    const created = ShareLinkPassword.create(raw);
    expect(created as unknown as string).toBe(raw);
  });
});

describe("validateFailedAttempts", () => {
  it("accepts zero", () => {
    expect(validateFailedAttempts(0)).toBe(0);
  });

  it("accepts a positive integer", () => {
    expect(validateFailedAttempts(5)).toBe(5);
  });

  it("rejects a negative integer with InvalidFailedAttempts", () => {
    try {
      validateFailedAttempts(-1);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(PublicationErrorCode.InvalidFailedAttempts);
      }
    }
  });

  it("rejects a non-integer with InvalidFailedAttempts", () => {
    try {
      validateFailedAttempts(1.5);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(PublicationErrorCode.InvalidFailedAttempts);
      }
    }
  });

  it("rejects NaN with InvalidFailedAttempts", () => {
    try {
      validateFailedAttempts(Number.NaN);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
    }
  });
});
