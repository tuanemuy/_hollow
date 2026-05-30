import { describe, expect, it } from "vitest";
import {
  adminSignUpSchema,
  PASSWORD_MIN_LENGTH,
  signUpSchema,
} from "../schema";

const validSignUp = {
  username: "yumenaut",
  email: "you@example.com",
  password: "Passw0rd!234",
  displayName: "ユメナウト",
  acceptTerms: true as const,
};

function firstIssueFor(
  result: ReturnType<typeof signUpSchema.safeParse>,
  path: string,
): string | undefined {
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path[0] === path)?.message;
}

describe("signUpSchema Japanese messages", () => {
  it("accepts a valid payload", () => {
    expect(signUpSchema.safeParse(validSignUp).success).toBe(true);
  });

  it("reports a Japanese message for an empty username", () => {
    const result = signUpSchema.safeParse({ ...validSignUp, username: "" });
    expect(firstIssueFor(result, "username")).toBe(
      "ユーザー名を入力してください。",
    );
  });

  it("reports a Japanese message for a malformed email", () => {
    const result = signUpSchema.safeParse({
      ...validSignUp,
      email: "not-an-email",
    });
    expect(firstIssueFor(result, "email")).toBe(
      "メールアドレスの形式が正しくありません。",
    );
  });

  it("reports a Japanese message for a too-short password", () => {
    const result = signUpSchema.safeParse({
      ...validSignUp,
      password: "short",
    });
    expect(firstIssueFor(result, "password")).toBe(
      `パスワードは${PASSWORD_MIN_LENGTH}文字以上で入力してください。`,
    );
  });

  it("reports a Japanese message when terms are not accepted", () => {
    const result = signUpSchema.safeParse({
      ...validSignUp,
      acceptTerms: false,
    });
    expect(firstIssueFor(result, "acceptTerms")).toBe(
      "利用規約とプライバシーポリシーに同意してください。",
    );
  });

  it("does not emit raw English messages for invalid input", () => {
    const result = signUpSchema.safeParse({
      ...validSignUp,
      username: "",
      email: "x",
      password: "1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      for (const issue of result.error.issues) {
        expect(issue.message).toMatch(/[ぁ-んァ-ン一-龥]/);
      }
    }
  });
});

describe("adminSignUpSchema Japanese messages", () => {
  const validAdminSignUp = { ...validSignUp, setupToken: "secret-token" };

  it("accepts a valid payload", () => {
    expect(adminSignUpSchema.safeParse(validAdminSignUp).success).toBe(true);
  });

  it("inherits the username Japanese message", () => {
    const result = adminSignUpSchema.safeParse({
      ...validAdminSignUp,
      username: "",
    });
    expect(firstIssueFor(result, "username")).toBe(
      "ユーザー名を入力してください。",
    );
  });

  it("reports a Japanese message for a missing setup token", () => {
    const result = adminSignUpSchema.safeParse({
      ...validAdminSignUp,
      setupToken: "",
    });
    expect(firstIssueFor(result, "setupToken")).toBe(
      "Setup Token を入力してください。",
    );
  });
});
