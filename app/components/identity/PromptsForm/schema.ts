import { z } from "zod";

const PROMPT_PURPOSES = [
  "structure",
  "title",
  "directory",
  "metadata",
  "ocr_assist",
] as const;

export const promptPurposeSchema = z.enum(PROMPT_PURPOSES);

export const updateUserPromptSchema = z.object({
  purpose: promptPurposeSchema,
  template: z
    .object({
      text: z.string().min(1).max(10_000),
      expectedVariables: z.array(z.string().min(1)).max(64),
    })
    .nullable(),
});
