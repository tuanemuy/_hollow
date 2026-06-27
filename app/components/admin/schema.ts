import { z } from "zod";

// Transport-boundary schemas for admin server functions. Shape / DoS only;
// business invariants are enforced by domain VO factories in the usecases.
// These schemas must not import from `@/core/domain/*` or
// `@/core/application/*` so the client bundle stays free of domain code.

// Provider enumeration duplicated from `LLM_PROVIDERS` in
// `app/core/domain/adminSettings/valueObject.ts`. Issue #101 ADR-006
// keeps the transport list separate from the domain list so this file
// stays free of `@/core/domain/*` imports. The two lists are
// re-validated against each other at the VO boundary — if they drift,
// VO construction throws `InvalidLLMProvider` and the request fails
// fast. When adding a provider, update both lists.
export const LLM_PROVIDERS_TRANSPORT = [
  "anthropic",
  "openai",
  "gemini",
] as const;

// Transport-level shape guard for the OpenAI-compatible `baseURL` field.
// Domain invariants (`https?://` prefix, provider × baseURL pairing)
// are enforced by `LLMConfig.create`. Here we only:
// - Allow explicit `null` (used by anthropic / gemini and by openai
//   when defaulting to `https://api.openai.com/v1`).
// - Collapse empty / whitespace-only strings to `null` so the form's
//   empty input does not reach the VO as an invalid URL.
// - Cap length at 500 to bound the payload.
const baseURLSchema = z
  .union([z.string().max(500), z.null()])
  .transform((value) => {
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  });

export const updateLLMConfigSchema = z.object({
  provider: z.enum(LLM_PROVIDERS_TRANSPORT),
  model: z.string().trim().min(1).max(200),
  baseURL: baseURLSchema,
  apiKeyPlain: z.string().min(1).max(4096).nullable(),
});

// Draft test always sources the api key from the env override
// (`ADMIN_LLM_API_KEY`). The client must never submit a ciphertext on
// this path — DB-stored ciphertext lives server-side only and the draft
// preview never decrypts on behalf of the client. Locking the schema to
// `apiKeySource: "env" + apiKeyCiphertext: null` closes the transport
// hole so a malicious client cannot probe arbitrary ciphertexts.
export const testLLMConnectionSchema = z.object({
  useDraft: z.boolean(),
  draftConfig: z
    .object({
      provider: z.enum(LLM_PROVIDERS_TRANSPORT),
      model: z.string().trim().min(1).max(200),
      baseURL: baseURLSchema,
      apiKeySource: z.literal("env"),
      apiKeyCiphertext: z.null(),
    })
    .refine((draft) => draft.provider === "openai" || draft.baseURL === null, {
      message: "OpenAI 以外のプロバイダでは baseURL を空にしてください",
      path: ["baseURL"],
    })
    .nullable(),
});

// Provider enumeration duplicated from `SPEECH_PROVIDERS` in
// `app/core/domain/adminSettings/valueObject.ts`. Same dual-list pattern as
// `LLM_PROVIDERS_TRANSPORT` above — kept separate so this file stays free of
// `@/core/domain/*` imports. VO construction throws `InvalidSpeechProvider`
// if the two lists drift. When adding a provider, update both lists.
export const SPEECH_PROVIDERS_TRANSPORT = [
  "openai",
  "deepgram",
  "gemini",
] as const;

export const updateSpeechConfigSchema = z.object({
  provider: z.enum(SPEECH_PROVIDERS_TRANSPORT),
  model: z.string().trim().min(1).max(200),
  apiKeyPlain: z.string().min(1).max(4096).nullable(),
});

// Draft test always sources the api key from the env override
// (`ADMIN_SPEECH_API_KEY`). The client must never submit a ciphertext on
// this path — DB-stored ciphertext lives server-side only. Locking the
// schema to `apiKeySource: "env" + apiKeyCiphertext: null` closes the
// transport hole so a malicious client cannot probe arbitrary ciphertexts
// (symmetric with `testLLMConnectionSchema`).
export const testSpeechConnectionSchema = z.object({
  useDraft: z.boolean(),
  draftConfig: z
    .object({
      provider: z.enum(SPEECH_PROVIDERS_TRANSPORT),
      model: z.string().trim().min(1).max(200),
      apiKeySource: z.literal("env"),
      apiKeyCiphertext: z.null(),
    })
    .nullable(),
});

// Purpose enumeration duplicated from `PROMPT_PURPOSES` in
// `app/core/domain/adminSettings/valueObject.ts` (Issue #218 ADR-005).
// Same dual-list pattern as `LLM_PROVIDERS_TRANSPORT` above — when adding
// a purpose, update both lists. VO construction throws
// `InvalidPromptPurpose` if they drift.
export const PROMPT_PURPOSES_TRANSPORT = [
  "structure",
  "title",
  "directory",
  "metadata",
  "ocr_assist",
] as const;

export const updatePromptTemplateSchema = z.object({
  purpose: z.enum(PROMPT_PURPOSES_TRANSPORT),
  text: z.string().min(1).max(20_000),
  expectedVariables: z.array(z.string().trim().min(1).max(100)).max(64),
});

export const resetPromptTemplateSchema = z.object({
  purpose: z.enum(PROMPT_PURPOSES_TRANSPORT),
});

export const resetAllPromptTemplatesSchema = z.object({});

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
