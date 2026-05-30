import { z } from "zod";

/**
 * Transport-boundary schemas for the identity auth flows. Shape / DoS guard
 * only — business invariants (password complexity, username characters,
 * email RFC compliance) belong to the domain value-object factories which
 * usecases invoke. Schemas live presentation-side (not in `core/domain` or
 * `core/application`) because `inputValidator` runs in the client bundle.
 */

export const USERNAME_MAX_LENGTH = 64;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 256;
export const DISPLAY_NAME_MAX_LENGTH = 64;
export const SETUP_TOKEN_MAX_LENGTH = 256;
export const EMAIL_MAX_LENGTH = 320;
export const TOKEN_MAX_LENGTH = 256;

const trimmedString = (max: number) => z.string().trim().min(1).max(max);

// Sign-up / admin sign-up carry Japanese transport-boundary messages
// (#198 申し送り). Scoped to these fields so the shared `trimmedString`
// default-message behaviour used by other schemas (login など) is unchanged.
// 文字種・予約語・パスワード複雑度は値オブジェクト側の責務（ADR-003）。
export const signUpSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, { message: "ユーザー名を入力してください。" })
    .max(USERNAME_MAX_LENGTH, {
      message: `ユーザー名は${USERNAME_MAX_LENGTH}文字以内で入力してください。`,
    }),
  email: z
    .string()
    .trim()
    .min(1, { message: "メールアドレスを入力してください。" })
    .max(EMAIL_MAX_LENGTH, {
      message: `メールアドレスは${EMAIL_MAX_LENGTH}文字以内で入力してください。`,
    })
    .email({ message: "メールアドレスの形式が正しくありません。" }),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, {
      message: `パスワードは${PASSWORD_MIN_LENGTH}文字以上で入力してください。`,
    })
    .max(PASSWORD_MAX_LENGTH, {
      message: `パスワードは${PASSWORD_MAX_LENGTH}文字以内で入力してください。`,
    }),
  displayName: z
    .string()
    .trim()
    .max(DISPLAY_NAME_MAX_LENGTH, {
      message: `表示名は${DISPLAY_NAME_MAX_LENGTH}文字以内で入力してください。`,
    })
    .transform((value) => (value.length === 0 ? null : value)),
  acceptTerms: z.literal(true, {
    message: "利用規約とプライバシーポリシーに同意してください。",
  }),
});

export const adminSignUpSchema = signUpSchema.extend({
  setupToken: z
    .string()
    .trim()
    .min(1, { message: "Setup Token を入力してください。" })
    .max(SETUP_TOKEN_MAX_LENGTH, {
      message: `Setup Token は${SETUP_TOKEN_MAX_LENGTH}文字以内で入力してください。`,
    }),
});

export const loginSchema = z.object({
  email: trimmedString(EMAIL_MAX_LENGTH).email(),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const passwordResetRequestSchema = z.object({
  email: trimmedString(EMAIL_MAX_LENGTH).email(),
});

export const passwordResetConfirmSchema = z
  .object({
    token: trimmedString(TOKEN_MAX_LENGTH),
    newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
    confirmPassword: z
      .string()
      .min(PASSWORD_MIN_LENGTH)
      .max(PASSWORD_MAX_LENGTH),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "パスワードが一致しません",
  });

export const tokenOnlySchema = z.object({
  token: trimmedString(TOKEN_MAX_LENGTH),
});

export const resendVerificationSchema = z.object({
  email: trimmedString(EMAIL_MAX_LENGTH).email(),
});
