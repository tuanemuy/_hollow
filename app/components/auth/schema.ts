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

export const signUpSchema = z.object({
  username: trimmedString(USERNAME_MAX_LENGTH),
  email: trimmedString(EMAIL_MAX_LENGTH).email(),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  displayName: z
    .string()
    .trim()
    .max(DISPLAY_NAME_MAX_LENGTH)
    .transform((value) => (value.length === 0 ? null : value)),
  acceptTerms: z.literal(true),
});

export const adminSignUpSchema = signUpSchema.extend({
  setupToken: trimmedString(SETUP_TOKEN_MAX_LENGTH),
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
