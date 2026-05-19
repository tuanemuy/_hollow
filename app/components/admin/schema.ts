import { z } from "zod";

// Transport-boundary schemas for admin server functions. Shape / DoS only;
// business invariants are enforced by domain VO factories in the usecases.
// These schemas must not import from `@/core/domain/*` or
// `@/core/application/*` so the client bundle stays free of domain code.

export const ADMIN_PROVIDER_LITERAL = "anthropic" as const;

export const updateLLMConfigSchema = z.object({
  model: z.string().trim().min(1).max(200),
  apiKeyPlain: z.string().min(1).max(4096).nullable(),
});

export const testLLMConnectionSchema = z.object({
  useDraft: z.boolean(),
  draftConfig: z
    .object({
      provider: z.string().trim().min(1).max(200),
      model: z.string().trim().min(1).max(200),
      apiKeySource: z.enum(["env", "db"]),
      apiKeyCiphertext: z.string().max(8192).nullable(),
    })
    .nullable(),
});

export const updatePromptTemplateSchema = z.object({
  purpose: z.string().trim().min(1).max(200),
  text: z.string().min(1).max(20_000),
  expectedVariables: z.array(z.string().trim().min(1).max(100)).max(64),
});

export const updateDesignTokensSchema = z.object({
  tokens: z.record(
    z.string().trim().min(1).max(200),
    z.string().min(0).max(2000),
  ),
});

export const resetDesignTokensSchema = z.object({});

export const toggleRegistrationPolicySchema = z.object({
  open: z.boolean(),
  closedReason: z
    .string()
    .max(2000)
    .nullable()
    .transform((value) => {
      if (value === null) return null;
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    }),
});

export const targetUserSchema = z.object({
  targetUserId: z.string().min(1).max(200),
});

export const targetIngestionJobSchema = z.object({
  jobId: z.string().min(1).max(200),
});

export const targetExportJobSchema = z.object({
  jobId: z.string().min(1).max(200),
});
