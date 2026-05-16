import { z } from "zod";

export const USERNAME_MAX = 30;
export const DISPLAY_NAME_MAX = 50;
export const BIO_MAX = 500;
export const PASSWORD_MAX = 128;

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX).optional(),
  bio: z.string().max(BIO_MAX).nullable().optional(),
  avatarMediaId: z.string().min(1).nullable().optional(),
});

export const changeUsernameSchema = z.object({
  newUsername: z.string().trim().min(1).max(USERNAME_MAX),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
  newPassword: z.string().min(1).max(PASSWORD_MAX),
  revokeOtherSessions: z.boolean(),
});

export const requestEmailChangeSchema = z.object({
  newEmail: z.string().trim().min(1).max(254),
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
});

export const revokeAllOtherSessionsSchema = z.object({});

export const deleteAccountSchema = z.object({
  confirmation: z.string().min(1).max(USERNAME_MAX),
});
