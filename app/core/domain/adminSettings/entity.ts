import { Version } from "@/core/domain/common/version";
import { RehydrationError } from "@/core/domain/error";
import {
  DEFAULT_MAX_NOTE_REVISIONS_PER_NOTE,
  DesignTokens,
  InstanceLimits,
  LLMConfig,
  PromptPurpose,
  PromptTemplate,
  RegistrationPolicy,
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

type Prompts = Readonly<Record<PromptPurpose, PromptTemplate>>;

export type InstanceSettings = Readonly<{
  id: InstanceSettingsId;
  llm: LLMConfig;
  prompts: Prompts;
  designTokens: DesignTokens;
  registration: RegistrationPolicy;
  limits: InstanceLimits;
  version: Version;
  updatedAt: Date;
}>;

const DEFAULT_PROMPT_TEXT: Readonly<Record<PromptPurpose, string>> = {
  structure: "",
  title: "",
  directory: "",
  metadata: "",
  ocr_assist: "",
};

function defaultPrompts(): Prompts {
  const out = {} as Record<PromptPurpose, PromptTemplate>;
  for (const purpose of PromptPurpose.values) {
    out[purpose] = PromptTemplate.create({
      text: DEFAULT_PROMPT_TEXT[purpose],
      expectedVariables: [],
    });
  }
  return out;
}

function defaultLLM(): LLMConfig {
  return LLMConfig.create({
    provider: "anthropic",
    model: "claude-3-5-sonnet-latest",
    baseURL: null,
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

function rehydratePrompts(
  raw: Readonly<
    Record<string, { text: string; expectedVariables: readonly string[] }>
  >,
): Prompts {
  const out = {} as Record<PromptPurpose, PromptTemplate>;
  for (const purpose of PromptPurpose.values) {
    const entry = raw[purpose];
    if (entry === undefined) {
      out[purpose] = PromptTemplate.create({
        text: DEFAULT_PROMPT_TEXT[purpose],
        expectedVariables: [],
      });
      continue;
    }
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
    prompts: defaultPrompts(),
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

  updatePrompt: (
    settings: InstanceSettings,
    purpose: PromptPurpose,
    template: PromptTemplate,
    now: Date,
  ): InstanceSettings => ({
    ...settings,
    prompts: { ...settings.prompts, [purpose]: template },
    version: Version.next(settings.version),
    updatedAt: now,
  }),

  updateDesignTokens: (
    settings: InstanceSettings,
    tokens: DesignTokens,
    now: Date,
  ): InstanceSettings => ({
    ...settings,
    designTokens: tokens,
    version: Version.next(settings.version),
    updatedAt: now,
  }),

  resetDesignTokens: (
    settings: InstanceSettings,
    now: Date,
  ): InstanceSettings => ({
    ...settings,
    designTokens: DesignTokens.empty(),
    version: Version.next(settings.version),
    updatedAt: now,
  }),

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
