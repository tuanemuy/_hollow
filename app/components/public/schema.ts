import { z } from "zod";

export const SHARE_PASSWORD_MAX_LENGTH = 128;

export const resolveShareLinkSchema = z.object({
  token: z.string().min(1).max(256),
  password: z.string().max(SHARE_PASSWORD_MAX_LENGTH).nullable(),
});

export const SUGGEST_PREFIX_MAX_LENGTH = 64;

export const suggestSchema = z.object({
  prefix: z.string().min(1).max(SUGGEST_PREFIX_MAX_LENGTH),
});
