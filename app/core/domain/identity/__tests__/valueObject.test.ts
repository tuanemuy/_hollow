import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import { IdentityErrorCode } from "../errorCode";
import {
  Bio,
  ChallengePurpose,
  CredentialKind,
  DisplayName,
  EmailAddress,
  MediaAssetId,
  PasswordHash,
  RawPassword,
  Role,
  UserId,
  Username,
  UserStatus,
} from "../valueObject";

function expectBusinessRuleError(fn: () => unknown, code: string) {
  try {
    fn();
    expect.fail("should have thrown");
  } catch (error) {
    expect(isBusinessRuleError(error)).toBe(true);
    if (isBusinessRuleError(error)) {
      expect(error.code).toBe(code);
    }
  }
}

describe("UserId", () => {
  it("rejects empty string with InvalidUserId", () => {
    expectBusinessRuleError(
      () => UserId.create(""),
      IdentityErrorCode.InvalidUserId,
    );
  });

  it("rejects whitespace-only string with InvalidUserId", () => {
    expectBusinessRuleError(
      () => UserId.create("   "),
      IdentityErrorCode.InvalidUserId,
    );
  });

  it("trims surrounding whitespace", () => {
    expect(UserId.create("  abc  ") as unknown as string).toBe("abc");
  });
});

describe("Username", () => {
  it("rejects strings shorter than 3 chars", () => {
    expectBusinessRuleError(
      () => Username.create("ab"),
      IdentityErrorCode.UsernameTooShort,
    );
  });

  it("rejects strings longer than 32 chars", () => {
    expectBusinessRuleError(
      () => Username.create("a".repeat(33)),
      IdentityErrorCode.UsernameTooLong,
    );
  });

  it("rejects uppercase characters", () => {
    expectBusinessRuleError(
      () => Username.create("AlphaUser"),
      IdentityErrorCode.InvalidUsername,
    );
  });

  it("rejects names that start with a hyphen", () => {
    expectBusinessRuleError(
      () => Username.create("-abc"),
      IdentityErrorCode.InvalidUsername,
    );
  });

  it("rejects names that end with a hyphen", () => {
    expectBusinessRuleError(
      () => Username.create("abc-"),
      IdentityErrorCode.InvalidUsername,
    );
  });

  it("rejects names containing forbidden symbols", () => {
    expectBusinessRuleError(
      () => Username.create("alpha_user"),
      IdentityErrorCode.InvalidUsername,
    );
  });

  it("rejects reserved usernames such as 'admin'", () => {
    expectBusinessRuleError(
      () => Username.create("admin"),
      IdentityErrorCode.UsernameReserved,
    );
  });

  it("accepts a valid 3-char lowercase username", () => {
    expect(Username.create("abc") as unknown as string).toBe("abc");
  });

  it("accepts hyphen in the middle", () => {
    expect(Username.create("ab-cd") as unknown as string).toBe("ab-cd");
  });

  it("trims surrounding whitespace before validation", () => {
    expect(Username.create("  john  ") as unknown as string).toBe("john");
  });
});

describe("EmailAddress", () => {
  it("rejects empty input", () => {
    expectBusinessRuleError(
      () => EmailAddress.create("   "),
      IdentityErrorCode.InvalidEmail,
    );
  });

  it("rejects emails missing @", () => {
    expectBusinessRuleError(
      () => EmailAddress.create("plainstring"),
      IdentityErrorCode.InvalidEmail,
    );
  });

  it("rejects emails missing a dot in domain", () => {
    expectBusinessRuleError(
      () => EmailAddress.create("a@b"),
      IdentityErrorCode.InvalidEmail,
    );
  });

  it("rejects emails over 254 chars", () => {
    // 250 a's + "@e.com" (6) = 256 > 254.
    const local = "a".repeat(250);
    expectBusinessRuleError(
      () => EmailAddress.create(`${local}@e.com`),
      IdentityErrorCode.EmailTooLong,
    );
  });

  it("normalises to lowercase", () => {
    expect(EmailAddress.create("USER@Example.COM") as unknown as string).toBe(
      "user@example.com",
    );
  });
});

describe("RawPassword", () => {
  it("rejects passwords shorter than 12 chars", () => {
    expectBusinessRuleError(
      () => RawPassword.create("a".repeat(11)),
      IdentityErrorCode.PasswordTooShort,
    );
  });

  it("rejects passwords longer than 128 chars", () => {
    expectBusinessRuleError(
      () => RawPassword.create("a".repeat(129)),
      IdentityErrorCode.PasswordTooLong,
    );
  });

  it("rejects 12-char password using only one character class (letters)", () => {
    expectBusinessRuleError(
      () => RawPassword.create("abcdefghijkl"),
      IdentityErrorCode.PasswordInsufficientVariety,
    );
  });

  it("rejects digits-only 12 chars", () => {
    expectBusinessRuleError(
      () => RawPassword.create("123456789012"),
      IdentityErrorCode.PasswordInsufficientVariety,
    );
  });

  it("accepts 12-char password mixing letters + digits", () => {
    expect(RawPassword.create("abcdefghijk1") as unknown as string).toBe(
      "abcdefghijk1",
    );
  });

  it("accepts password mixing letters + symbols", () => {
    expect(RawPassword.create("abcdefghijk!") as unknown as string).toBe(
      "abcdefghijk!",
    );
  });

  it("does not trim — leading/trailing spaces count as symbols", () => {
    // 12 chars including a leading space + letters -> 2 classes
    const raw = " bcdefghijkl";
    expect(RawPassword.create(raw) as unknown as string).toBe(raw);
  });
});

describe("PasswordHash", () => {
  it("rejects empty hash", () => {
    expectBusinessRuleError(
      () => PasswordHash.create("  "),
      IdentityErrorCode.InvalidPasswordHash,
    );
  });

  it("accepts any non-empty trimmed string", () => {
    expect(PasswordHash.create("$argon2id$v=19$...") as unknown as string).toBe(
      "$argon2id$v=19$...",
    );
  });
});

describe("UserStatus / Role / ChallengePurpose / CredentialKind", () => {
  it("UserStatus accepts the 4 literals", () => {
    expect(UserStatus.create("pending")).toBe("pending");
    expect(UserStatus.create("active")).toBe("active");
    expect(UserStatus.create("suspended")).toBe("suspended");
    expect(UserStatus.create("deleted")).toBe("deleted");
  });

  it("UserStatus rejects unknown literal", () => {
    expectBusinessRuleError(
      () => UserStatus.create("archived"),
      IdentityErrorCode.InvalidUserStatus,
    );
  });

  it("Role accepts the 2 literals", () => {
    expect(Role.create("member")).toBe("member");
    expect(Role.create("admin")).toBe("admin");
  });

  it("Role rejects unknown literal", () => {
    expectBusinessRuleError(
      () => Role.create("super"),
      IdentityErrorCode.InvalidRole,
    );
  });

  it("ChallengePurpose accepts the 3 literals", () => {
    expect(ChallengePurpose.create("email_verification")).toBe(
      "email_verification",
    );
    expect(ChallengePurpose.create("password_reset")).toBe("password_reset");
    expect(ChallengePurpose.create("email_change")).toBe("email_change");
  });

  it("ChallengePurpose rejects unknown literal", () => {
    expectBusinessRuleError(
      () => ChallengePurpose.create("magic_link"),
      IdentityErrorCode.InvalidChallengePurpose,
    );
  });

  it("CredentialKind accepts password / oauth", () => {
    expect(CredentialKind.create("password")).toBe("password");
    expect(CredentialKind.create("oauth")).toBe("oauth");
  });

  it("CredentialKind rejects unknown literal", () => {
    expectBusinessRuleError(
      () => CredentialKind.create("passkey"),
      IdentityErrorCode.InvalidCredentialKind,
    );
  });
});

describe("MediaAssetId", () => {
  it("rejects empty string", () => {
    expectBusinessRuleError(
      () => MediaAssetId.create("  "),
      IdentityErrorCode.InvalidMediaAssetId,
    );
  });

  it("trims valid id", () => {
    expect(MediaAssetId.create("  m1  ") as unknown as string).toBe("m1");
  });
});

describe("DisplayName", () => {
  it("rejects empty after trim", () => {
    expectBusinessRuleError(
      () => DisplayName.create("   "),
      IdentityErrorCode.DisplayNameEmpty,
    );
  });

  it("rejects 51 chars", () => {
    expectBusinessRuleError(
      () => DisplayName.create("a".repeat(51)),
      IdentityErrorCode.DisplayNameTooLong,
    );
  });

  it("accepts exactly 50 chars", () => {
    expect(DisplayName.create("a".repeat(50)).length).toBe(50);
  });

  it("trims surrounding whitespace", () => {
    expect(DisplayName.create("  Alice  ")).toBe("Alice");
  });
});

describe("Bio", () => {
  it("normalises null to null", () => {
    expect(Bio.create(null)).toBeNull();
  });

  it("normalises empty/whitespace-only string to null", () => {
    expect(Bio.create("")).toBeNull();
    expect(Bio.create("   ")).toBeNull();
  });

  it("rejects 501 chars", () => {
    expectBusinessRuleError(
      () => Bio.create("a".repeat(501)),
      IdentityErrorCode.BioTooLong,
    );
  });

  it("accepts exactly 500 chars", () => {
    const bio = Bio.create("a".repeat(500));
    expect(bio).not.toBeNull();
    expect(bio?.length).toBe(500);
  });

  it("trims surrounding whitespace", () => {
    expect(Bio.create("  hello  ")).toBe("hello");
  });
});
