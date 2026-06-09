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

// Sample-input upper bound for prompt previews (Issue #574 ADR-004).
// Caps LLM input-token cost while leaving enough room for a meaningful
// preview. Enforced at the transport boundary below.
export const SAMPLE_TEXT_MAX_LENGTH = 4000;

// Preview-capable purposes only — `ocr_assist` has no LLM execution path
// (ADR-001), so it is excluded from the enum. `overridePrompt` reuses the
// save-side `template.text` upper bound (10,000) for consistency (ADR-004).
export const previewPromptSchema = z.object({
  purpose: z.enum(["structure", "title", "directory", "metadata"]),
  sampleText: z.string().min(1).max(SAMPLE_TEXT_MAX_LENGTH),
  overridePrompt: z.string().max(10_000).optional(),
});
