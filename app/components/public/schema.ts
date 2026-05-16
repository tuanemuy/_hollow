import { z } from "zod";

export const SHARE_PASSWORD_MAX_LENGTH = 128;

export const resolveShareLinkSchema = z.object({
  token: z.string().min(1).max(256),
  password: z.string().max(SHARE_PASSWORD_MAX_LENGTH).nullable(),
});
