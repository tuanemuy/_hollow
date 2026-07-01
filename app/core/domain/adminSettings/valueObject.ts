import { BusinessRuleError } from "@/core/domain/error";
import { AdminSettingsErrorCode } from "./errorCode";

declare const userIdBrand: unique symbol;

/**
 * Owner id for `UserPromptOverride`. Authoritative `UserId` lives in the
 * identity domain (not yet implemented in this template). Mirrored here as
 * an opaque, non-empty string so the adminSettings domain can be built
 * standalone — once `identity` lands, this brand can be aliased to its
 * canonical type without touching call sites.
 */
export type UserId = string & { readonly [userIdBrand]: true };

export const UserId = {
  create: (id: string): UserId => {
    const trimmed = id.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        AdminSettingsErrorCode.InvalidUserId,
        "Invalid user id",
      );
    }
    return trimmed as UserId;
  },
};

// ---------- PromptPurpose ----------

const PROMPT_PURPOSES = [
  "structure",
  "title",
  "directory",
  "metadata",
  "ocr_assist",
] as const;

export type PromptPurpose = (typeof PROMPT_PURPOSES)[number];

export const PromptPurpose = {
  values: PROMPT_PURPOSES,
  create: (raw: string): PromptPurpose => {
    if (!(PROMPT_PURPOSES as readonly string[]).includes(raw)) {
      throw new BusinessRuleError(
        AdminSettingsErrorCode.InvalidPromptPurpose,
        `Invalid prompt purpose: ${raw}`,
      );
    }
    return raw as PromptPurpose;
  },
};

// ---------- PromptTemplate ----------

const PROMPT_TEMPLATE_MAX_BYTES = 16 * 1024; // 16 KiB
const PROMPT_VARIABLE_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const PROMPT_PLACEHOLDER_REGEX = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

declare const promptTemplateBrand: unique symbol;

export type PromptTemplate = Readonly<{
  text: string;
  expectedVariables: readonly string[];
}> & { readonly [promptTemplateBrand]: true };

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function extractPlaceholders(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(PROMPT_PLACEHOLDER_REGEX)) {
    found.add(match[1]);
  }
  return found;
}

export const PromptTemplate = {
  create: (params: {
    text: string;
    expectedVariables: readonly string[];
  }): PromptTemplate => {
    const text = params.text;
    if (byteLength(text) > PROMPT_TEMPLATE_MAX_BYTES) {
      throw new BusinessRuleError(
        AdminSettingsErrorCode.PromptTemplateTooLarge,
        `Prompt template exceeds maximum size (${PROMPT_TEMPLATE_MAX_BYTES} bytes)`,
      );
    }
    const expected = [...new Set(params.expectedVariables)];
    for (const name of expected) {
      if (!PROMPT_VARIABLE_NAME_REGEX.test(name)) {
        throw new BusinessRuleError(
          AdminSettingsErrorCode.PromptTemplateInvalidVariableName,
          `Invalid prompt variable name: ${name}`,
        );
      }
    }
    const expectedSet = new Set(expected);
    const placeholders = extractPlaceholders(text);
    for (const used of placeholders) {
      if (!expectedSet.has(used)) {
        throw new BusinessRuleError(
          AdminSettingsErrorCode.PromptTemplateVariableMismatch,
          `Prompt template references unknown variable: {{${used}}}`,
        );
      }
    }
    return {
      text,
      expectedVariables: expected,
    } as unknown as PromptTemplate;
  },
};

// ---------- LLMConfig ----------

const LLM_MODEL_MAX_LENGTH = 120;
export const LLM_BASE_URL_MAX_LENGTH = 500;
// INVARIANT: every value here must have a matching entry in
// `factoryProviderRegistry` (`app/core/adapters/llm/registry.ts`). Its
// `Record<LLMProvider, ProviderAdapter>` annotation enforces this at compile
// time, covering both the LLM/OCR/PDF factories and the connection tester.
// Add new providers (e.g. "azure-openai") atomically: export a
// `ProviderAdapter` from `app/core/adapters/<provider>/index.ts` and register
// it in `factoryProviderRegistry`.
const LLM_PROVIDERS = ["anthropic", "openai", "gemini"] as const;
const LLM_API_KEY_SOURCES = ["env", "db"] as const;

export type LLMProvider = (typeof LLM_PROVIDERS)[number];
export type LLMApiKeySource = (typeof LLM_API_KEY_SOURCES)[number];

declare const llmConfigBrand: unique symbol;

export type LLMConfig = Readonly<{
  provider: LLMProvider;
  model: string;
  // OpenAI-compatible endpoint base URL (path up to but not including
  // `/chat/completions`). Always `null` for `anthropic` / `gemini`; see
  // ADR-004 in `.issue/101/adr.md`. The provider × baseURL invariant is
  // enforced by `LLMConfig.create`.
  baseURL: string | null;
  apiKeySource: LLMApiKeySource;
  apiKeyCiphertext: string | null;
}> & { readonly [llmConfigBrand]: true };

export const LLMConfig = {
  providers: LLM_PROVIDERS,
  apiKeySources: LLM_API_KEY_SOURCES,
  create: (params: {
    provider: string;
    model: string;
    baseURL?: string | null;
    apiKeySource: string;
    apiKeyCiphertext: string | null;
  }): LLMConfig => {
    if (!(LLM_PROVIDERS as readonly string[]).includes(params.provider)) {
      throw new BusinessRuleError(
        AdminSettingsErrorCode.InvalidLLMProvider,
        `Invalid LLM provider: ${params.provider}`,
      );
    }
    const model = params.model.trim();
    if (model.length === 0) {
      throw new BusinessRuleError(
        AdminSettingsErrorCode.InvalidLLMModel,
        "LLM model cannot be empty",
      );
    }
    if (model.length > LLM_MODEL_MAX_LENGTH) {
      throw new BusinessRuleError(
        AdminSettingsErrorCode.InvalidLLMModelTooLong,
        `LLM model exceeds maximum length (${LLM_MODEL_MAX_LENGTH})`,
      );
    }
    const provider = params.provider as LLMProvider;
    const rawBaseURL = params.baseURL ?? null;
    let baseURL: string | null;
    if (provider === "openai") {
      if (rawBaseURL === null) {
        baseURL = null;
      } else {
        const trimmed = rawBaseURL.trim();
        if (trimmed.length === 0) {
          baseURL = null;
        } else {
          if (trimmed.length > LLM_BASE_URL_MAX_LENGTH) {
            throw new BusinessRuleError(
              AdminSettingsErrorCode.InvalidLLMBaseURL,
              `LLM baseURL exceeds maximum length (${LLM_BASE_URL_MAX_LENGTH})`,
            );
          }
          if (!/^https?:\/\//.test(trimmed)) {
            throw new BusinessRuleError(
              AdminSettingsErrorCode.InvalidLLMBaseURL,
              "LLM baseURL must start with http:// or https://",
            );
          }
          baseURL = trimmed;
        }
      }
    } else {
      if (rawBaseURL !== null && rawBaseURL.trim().length > 0) {
        throw new BusinessRuleError(
          AdminSettingsErrorCode.InvalidLLMBaseURL,
          `LLM baseURL must be null for provider '${provider}'`,
        );
      }
      baseURL = null;
    }
    if (
      !(LLM_API_KEY_SOURCES as readonly string[]).includes(params.apiKeySource)
    ) {
      throw new BusinessRuleError(
        AdminSettingsErrorCode.InvalidLLMApiKeySource,
        `Invalid api key source: ${params.apiKeySource}`,
      );
    }
    const source = params.apiKeySource as LLMApiKeySource;
    let ciphertext: string | null;
    if (source === "db") {
      if (
        params.apiKeyCiphertext === null ||
        params.apiKeyCiphertext.trim().length === 0
      ) {
        throw new BusinessRuleError(
          AdminSettingsErrorCode.InvalidLLMApiKeyCiphertext,
          "apiKeyCiphertext is required when apiKeySource is 'db'",
        );
      }
      ciphertext = params.apiKeyCiphertext;
    } else {
      // Symmetric with the db branch above: any non-null value — including
      // the empty / whitespace-only string — violates the env invariant.
      // Treating `""` as "effectively null" would silently mask form bugs
      // that send an unset ciphertext as `""`; reject loudly instead.
      if (params.apiKeyCiphertext !== null) {
        throw new BusinessRuleError(
          AdminSettingsErrorCode.InvalidLLMApiKeyCiphertext,
          "apiKeyCiphertext must be null when apiKeySource is 'env'",
        );
      }
      ciphertext = null;
    }
    return {
      provider,
      model,
      baseURL,
      apiKeySource: source,
      apiKeyCiphertext: ciphertext,
    } as unknown as LLMConfig;
  },
};

// ---------- SpeechRecognitionConfig ----------

const SPEECH_MODEL_MAX_LENGTH = 120;
// INVARIANT: every value here must have a matching entry in
// `speechProviderRegistry` (`app/core/adapters/speech/registry.ts`). Its
// `Record<SpeechProvider, SpeechAdapter>` annotation enforces this at
// compile time. Each provider also has a canonical default `model`. Only the
// `openai` default is consumed here, by `defaultSpeech()` (entity.ts); the DI
// bootstrap reads `ADMIN_SPEECH_MODEL` / DB rows directly and does not consult
// this mapping. The per-provider defaults below are mirrored by the UI's
// `PROVIDER_DEFAULT_MODEL` (SpeechSettingsForm), which auto-fills the model on
// provider switch — keep the two in sync when adding a provider:
//   - `openai` → `gpt-4o-transcribe`
//   - `deepgram` → `nova-3`
//   - `gemini` → `gemini-2.5-flash`
//   - `deepgram-workers-ai` → `@cf/deepgram/nova-3` (Issue #788)
// Add new providers atomically: export a `SpeechAdapter` from
// `app/core/adapters/<provider>/index.ts`, register it in
// `speechProviderRegistry`, and extend the default-model mapping above.
const SPEECH_PROVIDERS = [
  "openai",
  "deepgram",
  "gemini",
  "deepgram-workers-ai",
] as const;
const SPEECH_API_KEY_SOURCES = ["env", "db"] as const;

// Keyless providers (Issue #788): routes whose authentication is handled by
// Cloudflare (the `env.AI` binding) rather than an operator-supplied API key.
// This is the domain SSOT for "does this provider require an api key?" — the
// domain service `AdminSettingsService.assertSpeechEnvOverride`, the
// application usecases (`updateSpeechConfig` / `testSpeechConnection`), the DI
// gates (`buildSpeechRecognitionProvider` / `resolveConsumerSpeechConfig`) and
// the `HttpSpeechConnectionTester` all branch on this same predicate so they
// cannot drift (ADR-004). `SecretBox` encryption is non-applicable to keyless
// providers because there is no key to store.
const KEYLESS_SPEECH_PROVIDERS = ["deepgram-workers-ai"] as const;

export type SpeechProvider = (typeof SPEECH_PROVIDERS)[number];
export type SpeechApiKeySource = (typeof SPEECH_API_KEY_SOURCES)[number];

declare const speechRecognitionConfigBrand: unique symbol;

export type SpeechRecognitionConfig = Readonly<{
  provider: SpeechProvider;
  model: string;
  apiKeySource: SpeechApiKeySource;
  apiKeyCiphertext: string | null;
}> & { readonly [speechRecognitionConfigBrand]: true };

export const SpeechRecognitionConfig = {
  providers: SPEECH_PROVIDERS,
  apiKeySources: SPEECH_API_KEY_SOURCES,
  keylessProviders: KEYLESS_SPEECH_PROVIDERS,
  /**
   * Domain SSOT: whether the given speech provider requires an
   * operator-supplied API key. Keyless providers (Issue #788,
   * {@link KEYLESS_SPEECH_PROVIDERS}) resolve authentication through the
   * Cloudflare `env.AI` binding instead. Accepts a raw string so binding /
   * DI code can call it without first constructing a {@link SpeechProvider}.
   */
  requiresApiKey: (provider: string): boolean =>
    !(KEYLESS_SPEECH_PROVIDERS as readonly string[]).includes(provider),
  create: (params: {
    provider: string;
    model: string;
    apiKeySource: string;
    apiKeyCiphertext: string | null;
  }): SpeechRecognitionConfig => {
    if (!(SPEECH_PROVIDERS as readonly string[]).includes(params.provider)) {
      throw new BusinessRuleError(
        AdminSettingsErrorCode.InvalidSpeechProvider,
        `Invalid speech provider: ${params.provider}`,
      );
    }
    const model = params.model.trim();
    if (model.length === 0) {
      throw new BusinessRuleError(
        AdminSettingsErrorCode.InvalidSpeechModel,
        "Speech model cannot be empty",
      );
    }
    if (model.length > SPEECH_MODEL_MAX_LENGTH) {
      throw new BusinessRuleError(
        AdminSettingsErrorCode.InvalidSpeechModelTooLong,
        `Speech model exceeds maximum length (${SPEECH_MODEL_MAX_LENGTH})`,
      );
    }
    const provider = params.provider as SpeechProvider;
    if (
      !(SPEECH_API_KEY_SOURCES as readonly string[]).includes(
        params.apiKeySource,
      )
    ) {
      throw new BusinessRuleError(
        AdminSettingsErrorCode.InvalidSpeechApiKeySource,
        `Invalid api key source: ${params.apiKeySource}`,
      );
    }
    const source = params.apiKeySource as SpeechApiKeySource;
    let ciphertext: string | null;
    if (source === "db") {
      if (
        params.apiKeyCiphertext === null ||
        params.apiKeyCiphertext.trim().length === 0
      ) {
        throw new BusinessRuleError(
          AdminSettingsErrorCode.InvalidSpeechApiKeyCiphertext,
          "apiKeyCiphertext is required when apiKeySource is 'db'",
        );
      }
      ciphertext = params.apiKeyCiphertext;
    } else {
      // Symmetric with the db branch and with `LLMConfig.create`: any
      // non-null value — including the empty / whitespace-only string —
      // violates the env invariant. Reject loudly so a form bug that sends
      // an unset ciphertext as `""` does not silently mask itself.
      if (params.apiKeyCiphertext !== null) {
        throw new BusinessRuleError(
          AdminSettingsErrorCode.InvalidSpeechApiKeyCiphertext,
          "apiKeyCiphertext must be null when apiKeySource is 'env'",
        );
      }
      ciphertext = null;
    }
    return {
      provider,
      model,
      apiKeySource: source,
      apiKeyCiphertext: ciphertext,
    } as unknown as SpeechRecognitionConfig;
  },
};

// ---------- DesignTokens ----------

const DESIGN_TOKEN_KEY_REGEX = /^--[a-z0-9-]+$/;
const DESIGN_TOKEN_MAX_ENTRIES = 200;
const DESIGN_TOKEN_VALUE_MAX_LENGTH = 512;
// Forbid characters that break CSS declarations (newlines, `;`, `{`, `}`).
// Properly-escaped sequences such as `\3a ` remain valid because backslash
// itself is not in the deny-list.
const DESIGN_TOKEN_VALUE_FORBIDDEN = /[\n\r;{}]/;

declare const designTokensBrand: unique symbol;

export type DesignTokens = Readonly<{
  tokens: Readonly<Record<string, string>>;
}> & { readonly [designTokensBrand]: true };

export const DesignTokens = {
  empty: (): DesignTokens =>
    ({ tokens: Object.freeze({}) }) as unknown as DesignTokens,
  create: (params: { tokens: Record<string, string> }): DesignTokens => {
    const entries = Object.entries(params.tokens);
    if (entries.length > DESIGN_TOKEN_MAX_ENTRIES) {
      throw new BusinessRuleError(
        AdminSettingsErrorCode.DesignTokensTooMany,
        `Design tokens exceed maximum entries (${DESIGN_TOKEN_MAX_ENTRIES})`,
      );
    }
    const out: Record<string, string> = {};
    for (const [key, value] of entries) {
      if (!DESIGN_TOKEN_KEY_REGEX.test(key)) {
        throw new BusinessRuleError(
          AdminSettingsErrorCode.InvalidDesignTokenKey,
          `Invalid design token key: ${key}`,
        );
      }
      if (
        typeof value !== "string" ||
        value.length === 0 ||
        value.length > DESIGN_TOKEN_VALUE_MAX_LENGTH ||
        DESIGN_TOKEN_VALUE_FORBIDDEN.test(value)
      ) {
        throw new BusinessRuleError(
          AdminSettingsErrorCode.InvalidDesignTokenValue,
          `Invalid design token value for key ${key}`,
        );
      }
      out[key] = value;
    }
    return { tokens: Object.freeze(out) } as unknown as DesignTokens;
  },
};

// ---------- RegistrationPolicy ----------

const REGISTRATION_CLOSED_REASON_MAX_LENGTH = 500;

declare const registrationPolicyBrand: unique symbol;

export type RegistrationPolicy = Readonly<{
  open: boolean;
  closedReason: string | null;
}> & { readonly [registrationPolicyBrand]: true };

export const RegistrationPolicy = {
  create: (params: {
    open: boolean;
    closedReason: string | null;
  }): RegistrationPolicy => {
    let reason: string | null = null;
    if (params.closedReason !== null) {
      const trimmed = params.closedReason.trim();
      if (trimmed.length === 0) {
        reason = null;
      } else {
        if (trimmed.length > REGISTRATION_CLOSED_REASON_MAX_LENGTH) {
          throw new BusinessRuleError(
            AdminSettingsErrorCode.InvalidRegistrationClosedReason,
            `Registration closedReason exceeds maximum length (${REGISTRATION_CLOSED_REASON_MAX_LENGTH})`,
          );
        }
        reason = trimmed;
      }
    }
    // When registration is open, a `closedReason` is meaningless. Drop it
    // rather than reject so callers can hand back the previous reason
    // verbatim when flipping the toggle.
    if (params.open) {
      reason = null;
    }
    return {
      open: params.open,
      closedReason: reason,
    } as unknown as RegistrationPolicy;
  },
};

// ---------- InstanceLimits ----------

declare const instanceLimitsBrand: unique symbol;

export type InstanceLimits = Readonly<{
  maxUploadBytesPerDay: number;
  maxIngestionBytes: number;
  maxNoteBytes: number;
  maxExportArtifactBytes: number;
  maxShareLinksPerNote: number;
  editLockTtlSec: number;
  trashRetentionDays: number;
  /**
   * Per-note retention ceiling for `NoteRevision` rows (Issue #158
   * ADR-004). When a fresh `SaveNote` / `RestoreNoteRevision` insert
   * would push the row count above this value, the same UoW deletes the
   * oldest revisions. Range: `1..1000`, default `50`.
   */
  maxNoteRevisionsPerNote: number;
}> & { readonly [instanceLimitsBrand]: true };

const MAX_NOTE_REVISIONS_PER_NOTE_MAX = 1000;

function ensurePositiveInteger(field: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BusinessRuleError(
      AdminSettingsErrorCode.InvalidInstanceLimit,
      `Invalid instance limit ${field}: ${value}`,
    );
  }
}

function ensureBoundedInteger(field: string, value: number, max: number): void {
  ensurePositiveInteger(field, value);
  if (value > max) {
    throw new BusinessRuleError(
      AdminSettingsErrorCode.InvalidInstanceLimit,
      `Invalid instance limit ${field}: ${value} (max ${max})`,
    );
  }
}

/** Default value for `maxNoteRevisionsPerNote` (Issue #158 ADR-004). */
export const DEFAULT_MAX_NOTE_REVISIONS_PER_NOTE = 50;

export const InstanceLimits = {
  create: (params: {
    maxUploadBytesPerDay: number;
    maxIngestionBytes: number;
    maxNoteBytes: number;
    maxExportArtifactBytes: number;
    maxShareLinksPerNote: number;
    editLockTtlSec: number;
    trashRetentionDays: number;
    maxNoteRevisionsPerNote: number;
  }): InstanceLimits => {
    ensurePositiveInteger("maxUploadBytesPerDay", params.maxUploadBytesPerDay);
    ensurePositiveInteger("maxIngestionBytes", params.maxIngestionBytes);
    ensurePositiveInteger("maxNoteBytes", params.maxNoteBytes);
    ensurePositiveInteger(
      "maxExportArtifactBytes",
      params.maxExportArtifactBytes,
    );
    ensurePositiveInteger("maxShareLinksPerNote", params.maxShareLinksPerNote);
    ensurePositiveInteger("editLockTtlSec", params.editLockTtlSec);
    ensurePositiveInteger("trashRetentionDays", params.trashRetentionDays);
    ensureBoundedInteger(
      "maxNoteRevisionsPerNote",
      params.maxNoteRevisionsPerNote,
      MAX_NOTE_REVISIONS_PER_NOTE_MAX,
    );
    return { ...params } as unknown as InstanceLimits;
  },
};
