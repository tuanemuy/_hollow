import { Version } from "@/core/domain/common/version";
import { BusinessRuleError, RehydrationError } from "@/core/domain/error";
import { AdminSettingsErrorCode } from "./errorCode";
import {
  DEFAULT_MAX_NOTE_REVISIONS_PER_NOTE,
  DesignTokens,
  InstanceLimits,
  LLMConfig,
  PromptPurpose,
  PromptTemplate,
  RegistrationPolicy,
  SpeechRecognitionConfig,
  UserId,
} from "./valueObject";

// ---------- InstanceSettings (singleton aggregate root) ----------

/**
 * Stable id literal for the singleton aggregate. Using a constant rather
 * than a free-form `string` keeps the singleton-ness visible at the type
 * level — there is exactly one row in storage and exactly one in-memory
 * value.
 */
export const INSTANCE_SETTINGS_ID = "singleton" as const;
export type InstanceSettingsId = typeof INSTANCE_SETTINGS_ID;

/**
 * Per-purpose prompt overrides. **Key presence = explicit override / key
 * absence = inherit built-in default** (Issue #218 ADR-001). The empty map
 * is the legitimate "no overrides yet" state.
 */
export type Prompts = Readonly<Partial<Record<PromptPurpose, PromptTemplate>>>;

export type InstanceSettings = Readonly<{
  id: InstanceSettingsId;
  llm: LLMConfig;
  speech: SpeechRecognitionConfig;
  prompts: Prompts;
  designTokens: DesignTokens;
  registration: RegistrationPolicy;
  limits: InstanceLimits;
  version: Version;
  updatedAt: Date;
}>;

function defaultLLM(): LLMConfig {
  return LLMConfig.create({
    provider: "anthropic",
    model: "claude-3-5-sonnet-latest",
    baseURL: null,
    apiKeySource: "env",
    apiKeyCiphertext: null,
  });
}

function defaultSpeech(): SpeechRecognitionConfig {
  return SpeechRecognitionConfig.create({
    provider: "openai",
    model: "gpt-4o-transcribe",
    apiKeySource: "env",
    apiKeyCiphertext: null,
  });
}

function defaultLimits(): InstanceLimits {
  return InstanceLimits.create({
    maxUploadBytesPerDay: 1_073_741_824, // 1 GiB
    maxIngestionBytes: 33_554_432, // 32 MiB
    maxNoteBytes: 1_048_576, // 1 MiB
    maxExportArtifactBytes: 268_435_456, // 256 MiB
    maxShareLinksPerNote: 16,
    editLockTtlSec: 300, // 5 min
    trashRetentionDays: 30,
    maxNoteRevisionsPerNote: DEFAULT_MAX_NOTE_REVISIONS_PER_NOTE,
  });
}

function defaultRegistration(): RegistrationPolicy {
  return RegistrationPolicy.create({ open: true, closedReason: null });
}

// Loose-typed: persistence rows are untrusted and re-validated below.
type InstanceSettingsReconstructInput = Readonly<{
  llm: {
    provider: string;
    model: string;
    baseURL?: string | null;
    apiKeySource: string;
    apiKeyCiphertext: string | null;
  };
  // Optional on the rehydrate input so DB rows written before the speech
  // columns existed (`speech_*` NULL) still parse — `coerceSpeech` falls
  // back to `defaultSpeech()` below.
  speech?: {
    provider?: string | null;
    model?: string | null;
    apiKeySource?: string | null;
    apiKeyCiphertext?: string | null;
  };
  prompts: Readonly<
    Record<string, { text: string; expectedVariables: readonly string[] }>
  >;
  designTokens: { tokens: Record<string, string> };
  registration: { open: boolean; closedReason: string | null };
  limits: {
    maxUploadBytesPerDay: number;
    maxIngestionBytes: number;
    maxNoteBytes: number;
    maxExportArtifactBytes: number;
    maxShareLinksPerNote: number;
    editLockTtlSec: number;
    trashRetentionDays: number;
    // Issue #158: optional on the rehydrate input so DB rows written
    // before the field was introduced still parse. Falls back to the
    // shared default below via `coerceLimits`.
    maxNoteRevisionsPerNote?: number;
  };
  version: number;
  updatedAt: Date;
}>;

function coerceLimits(
  input: InstanceSettingsReconstructInput["limits"],
): Parameters<typeof InstanceLimits.create>[0] {
  return {
    maxUploadBytesPerDay: input.maxUploadBytesPerDay,
    maxIngestionBytes: input.maxIngestionBytes,
    maxNoteBytes: input.maxNoteBytes,
    maxExportArtifactBytes: input.maxExportArtifactBytes,
    maxShareLinksPerNote: input.maxShareLinksPerNote,
    editLockTtlSec: input.editLockTtlSec,
    trashRetentionDays: input.trashRetentionDays,
    maxNoteRevisionsPerNote:
      input.maxNoteRevisionsPerNote ?? DEFAULT_MAX_NOTE_REVISIONS_PER_NOTE,
  };
}

/**
 * Rehydrate `SpeechRecognitionConfig` from a (possibly absent / NULL)
 * persistence row. Existing singleton rows predate the `speech_*` columns,
 * so any missing field falls back to `defaultSpeech()`. When the row carries
 * a full speech config it is reconstructed verbatim.
 */
function coerceSpeech(
  input: InstanceSettingsReconstructInput["speech"],
): SpeechRecognitionConfig {
  const fallback = defaultSpeech();
  if (input === undefined) return fallback;
  const provider = input.provider ?? fallback.provider;
  const model =
    input.model !== null && input.model !== undefined && input.model.length > 0
      ? input.model
      : fallback.model;
  const apiKeySource = input.apiKeySource ?? fallback.apiKeySource;
  const apiKeyCiphertext = input.apiKeyCiphertext ?? null;
  return SpeechRecognitionConfig.create({
    provider,
    model,
    apiKeySource,
    apiKeyCiphertext,
  });
}

/**
 * Content-equal check for `PromptTemplate`. `PromptTemplate.create`
 * deduplicates `expectedVariables` while preserving input order, so two
 * templates produced from the same canonical input always have arrays in
 * the same order — element-wise comparison is sufficient and we do not
 * need to fall back to set equality.
 */
function promptTemplatesEqual(a: PromptTemplate, b: PromptTemplate): boolean {
  if (a === b) return true;
  if (a.text !== b.text) return false;
  const av = a.expectedVariables;
  const bv = b.expectedVariables;
  if (av.length !== bv.length) return false;
  for (let i = 0; i < av.length; i++) {
    if (av[i] !== bv[i]) return false;
  }
  return true;
}

/**
 * Content-equal check for `DesignTokens`. The tokens map is a flat
 * `Record<string, string>` (values are primitives), so a shallow
 * key-and-value comparison is equivalent to a deep one.
 */
function designTokensEqual(a: DesignTokens, b: DesignTokens): boolean {
  if (a === b) return true;
  const aEntries = Object.entries(a.tokens);
  const bKeys = Object.keys(b.tokens);
  if (aEntries.length !== bKeys.length) return false;
  for (const [k, v] of aEntries) {
    if (b.tokens[k] !== v) return false;
  }
  return true;
}

/**
 * Rehydrate `Prompts` from a persistence row. **Partial semantics** (Issue
 * #218 ADR-001/ADR-004): missing keys are simply omitted, and legacy rows
 * that persisted `text === ""` are also omitted to migrate "full map + empty
 * string" data into the new "key presence = override" model transparently —
 * no DB migration required.
 */
function rehydratePrompts(
  raw: Readonly<
    Record<string, { text: string; expectedVariables: readonly string[] }>
  >,
): Prompts {
  const out: Partial<Record<PromptPurpose, PromptTemplate>> = {};
  for (const purpose of PromptPurpose.values) {
    const entry = raw[purpose];
    if (entry === undefined) continue;
    if (entry.text === "") continue;
    out[purpose] = PromptTemplate.create({
      text: entry.text,
      expectedVariables: entry.expectedVariables,
    });
  }
  return out;
}

export const InstanceSettings = {
  /**
   * Default settings returned when no persisted row exists yet. Repository
   * implementations call this from `get()` so callers always see a valid
   * aggregate.
   */
  default: (now: Date): InstanceSettings => ({
    id: INSTANCE_SETTINGS_ID,
    llm: defaultLLM(),
    speech: defaultSpeech(),
    prompts: {},
    designTokens: DesignTokens.empty(),
    registration: defaultRegistration(),
    limits: defaultLimits(),
    version: Version.initial(),
    updatedAt: now,
  }),

  updateLLM: (
    settings: InstanceSettings,
    llm: LLMConfig,
    now: Date,
  ): InstanceSettings => ({
    ...settings,
    llm,
    version: Version.next(settings.version),
    updatedAt: now,
  }),

  updateSpeech: (
    settings: InstanceSettings,
    speech: SpeechRecognitionConfig,
    now: Date,
  ): InstanceSettings => ({
    ...settings,
    speech,
    version: Version.next(settings.version),
    updatedAt: now,
  }),

  /**
   * Set an override for a single purpose. Callers MUST pass a non-empty
   * template — the empty-text case is "reset to default" and is routed
   * through {@link InstanceSettings.resetPrompt} at the usecase boundary
   * (Issue #218 ADR-006). The domain operation name (`updatePrompt`) only
   * means "install an override".
   *
   * No-op when the existing override for `purpose` is content-equal to the
   * incoming template — same instance is returned so callers can detect
   * "nothing changed" by reference equality (Issue #261, symmetric with
   * `resetPrompt`).
   */
  updatePrompt: (
    settings: InstanceSettings,
    purpose: PromptPurpose,
    template: PromptTemplate,
    now: Date,
  ): InstanceSettings => {
    if (template.text.length === 0) {
      throw new BusinessRuleError(
        AdminSettingsErrorCode.UpdatePromptRequiresNonEmptyText,
        "updatePrompt requires a non-empty template; route empty text through resetPrompt at the usecase boundary",
      );
    }
    const existing = settings.prompts[purpose];
    if (existing !== undefined && promptTemplatesEqual(existing, template)) {
      return settings;
    }
    return {
      ...settings,
      prompts: { ...settings.prompts, [purpose]: template },
      version: Version.next(settings.version),
      updatedAt: now,
    };
  },

  /**
   * Remove the override for a single purpose (back to "inherit built-in
   * default"). No-op when the key is absent — the aggregate is returned
   * unchanged so the caller can detect "nothing happened" by reference
   * equality, mirroring `UserPromptOverride.clearPrompt`.
   */
  resetPrompt: (
    settings: InstanceSettings,
    purpose: PromptPurpose,
    now: Date,
  ): InstanceSettings => {
    if (settings.prompts[purpose] === undefined) return settings;
    const next: Partial<Record<PromptPurpose, PromptTemplate>> = {
      ...settings.prompts,
    };
    delete next[purpose];
    return {
      ...settings,
      prompts: next,
      version: Version.next(settings.version),
      updatedAt: now,
    };
  },

  /**
   * Clear all overrides at once. When the map is already empty this is a
   * no-op (same instance, version unchanged) so the admin "reset all" UI
   * can be invoked idempotently.
   */
  resetAllPrompts: (
    settings: InstanceSettings,
    now: Date,
  ): InstanceSettings => {
    if (Object.keys(settings.prompts).length === 0) return settings;
    return {
      ...settings,
      prompts: {},
      version: Version.next(settings.version),
      updatedAt: now,
    };
  },

  /**
   * Replace the design tokens map wholesale. No-op when the incoming
   * tokens are content-equal to the current map — same instance is
   * returned so callers can detect "nothing changed" by reference
   * equality (Issue #261, symmetric with `resetPrompt`).
   */
  updateDesignTokens: (
    settings: InstanceSettings,
    tokens: DesignTokens,
    now: Date,
  ): InstanceSettings => {
    if (designTokensEqual(settings.designTokens, tokens)) {
      return settings;
    }
    return {
      ...settings,
      designTokens: tokens,
      version: Version.next(settings.version),
      updatedAt: now,
    };
  },

  /**
   * Reset the design tokens map back to empty (inherit built-in defaults).
   * No-op when the map is already empty — same instance is returned so
   * callers can detect "nothing changed" by reference equality and avoid
   * emitting a settings-changed event for a reset that changed nothing
   * (Issue #595, symmetric with `resetAllPrompts`).
   */
  resetDesignTokens: (
    settings: InstanceSettings,
    now: Date,
  ): InstanceSettings => {
    if (designTokensEqual(settings.designTokens, DesignTokens.empty())) {
      return settings;
    }
    return {
      ...settings,
      designTokens: DesignTokens.empty(),
      version: Version.next(settings.version),
      updatedAt: now,
    };
  },

  setRegistrationOpen: (
    settings: InstanceSettings,
    open: boolean,
    reason: string | null,
    now: Date,
  ): InstanceSettings => ({
    ...settings,
    registration: RegistrationPolicy.create({ open, closedReason: reason }),
    version: Version.next(settings.version),
    updatedAt: now,
  }),

  updateLimits: (
    settings: InstanceSettings,
    limits: InstanceLimits,
    now: Date,
  ): InstanceSettings => ({
    ...settings,
    limits,
    version: Version.next(settings.version),
    updatedAt: now,
  }),

  reconstruct: (input: InstanceSettingsReconstructInput): InstanceSettings => {
    try {
      return {
        id: INSTANCE_SETTINGS_ID,
        llm: LLMConfig.create(input.llm),
        speech: coerceSpeech(input.speech),
        prompts: rehydratePrompts(input.prompts),
        designTokens: DesignTokens.create(input.designTokens),
        registration: RegistrationPolicy.create(input.registration),
        limits: InstanceLimits.create(coerceLimits(input.limits)),
        version: Version.create(input.version),
        updatedAt: input.updatedAt,
      };
    } catch (error) {
      throw new RehydrationError(
        "Failed to rehydrate InstanceSettings (id=singleton)",
        error,
      );
    }
  },
};

// ---------- UserPromptOverride (per-user aggregate) ----------

export type UserPromptOverride = Readonly<{
  ownerId: UserId;
  prompts: Readonly<Partial<Record<PromptPurpose, PromptTemplate>>>;
  version: Version;
  updatedAt: Date;
}>;

type UserPromptOverrideReconstructInput = Readonly<{
  ownerId: string;
  prompts: Readonly<
    Record<string, { text: string; expectedVariables: readonly string[] }>
  >;
  version: number;
  updatedAt: Date;
}>;

function rehydratePartialPrompts(
  raw: Readonly<
    Record<string, { text: string; expectedVariables: readonly string[] }>
  >,
): Readonly<Partial<Record<PromptPurpose, PromptTemplate>>> {
  const out: Partial<Record<PromptPurpose, PromptTemplate>> = {};
  for (const purpose of PromptPurpose.values) {
    const entry = raw[purpose];
    if (entry === undefined) continue;
    out[purpose] = PromptTemplate.create({
      text: entry.text,
      expectedVariables: entry.expectedVariables,
    });
  }
  return out;
}

export const UserPromptOverride = {
  create: (params: { ownerId: string }, now: Date): UserPromptOverride => ({
    ownerId: UserId.create(params.ownerId),
    prompts: {},
    version: Version.initial(),
    updatedAt: now,
  }),

  setPrompt: (
    override: UserPromptOverride,
    purpose: PromptPurpose,
    template: PromptTemplate,
    now: Date,
  ): UserPromptOverride => ({
    ...override,
    prompts: { ...override.prompts, [purpose]: template },
    version: Version.next(override.version),
    updatedAt: now,
  }),

  clearPrompt: (
    override: UserPromptOverride,
    purpose: PromptPurpose,
    now: Date,
  ): UserPromptOverride => {
    if (override.prompts[purpose] === undefined) {
      return override;
    }
    const next: Partial<Record<PromptPurpose, PromptTemplate>> = {
      ...override.prompts,
    };
    delete next[purpose];
    return {
      ...override,
      prompts: next,
      version: Version.next(override.version),
      updatedAt: now,
    };
  },

  reconstruct: (
    input: UserPromptOverrideReconstructInput,
  ): UserPromptOverride => {
    try {
      return {
        ownerId: UserId.create(input.ownerId),
        prompts: rehydratePartialPrompts(input.prompts),
        version: Version.create(input.version),
        updatedAt: input.updatedAt,
      };
    } catch (error) {
      throw new RehydrationError(
        `Failed to rehydrate UserPromptOverride (ownerId=${input.ownerId})`,
        error,
      );
    }
  },
};
