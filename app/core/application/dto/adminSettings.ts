import { BUILTIN_PROMPT_DEFAULTS } from "@/core/domain/adminSettings/defaults";
import type { InstanceSettings } from "@/core/domain/adminSettings/entity";
import {
  type LLMProvider as LLMProviderName,
  PromptPurpose,
} from "@/core/domain/adminSettings/valueObject";
import { type Instant, toInstant } from "./common";

/**
 * Per-purpose prompt template projection. `expectedVariables` is mirrored
 * verbatim from the domain VO so the admin UI can render the
 * placeholder hints alongside the editable text.
 *
 * `isOverridden` is `true` when the instance has an explicit override for
 * the purpose, `false` when the field reflects the built-in default. The
 * UI uses this to render the "上書き中" badge and to enable/disable the
 * per-row reset button (Issue #218 ADR-001).
 */
export type PromptDTO = Readonly<{
  text: string;
  expectedVariables: readonly string[];
  isOverridden: boolean;
}>;

/**
 * Per-purpose built-in defaults. Mirrors `BUILTIN_PROMPT_DEFAULTS` so the
 * admin UI can show the system default alongside the current value.
 */
export type PromptDefaultDTO = Readonly<{
  text: string;
  expectedVariables: readonly string[];
}>;

export type InstanceSettingsDTO = Readonly<{
  llm: Readonly<{
    provider: LLMProviderName;
    model: string;
    /**
     * OpenAI-compatible endpoint base URL (path up to but not including
     * `/chat/completions`). Always `null` for `anthropic` / `gemini`;
     * for `openai` it is `null` when the default (`https://api.openai.com/v1`)
     * is used, or a custom URL for Azure / Groq / vLLM etc. The provider
     * × baseURL invariant is enforced by `LLMConfig.create`.
     */
    baseURL: string | null;
    apiKeySource: "env" | "db";
    /**
     * Masked representation of the configured API key (e.g. `••••abc1`).
     * Always `null` when `apiKeySource === 'env'`; the masked digest is
     * supplied by the caller because the raw ciphertext never leaves the
     * adapter boundary.
     */
    apiKeyMasked: string | null;
    /**
     * Per-field flag indicating whether the operator has supplied an
     * `ADMIN_LLM_*` env override for that LLM setting. `true` means the
     * UI MUST render the field in a locked state (env value wins over
     * any DB-stored value). The `provider` / `model` / `baseURL` fields
     * above are overwritten with the env-supplied current value when
     * the matching `envOverrides.*` flag is `true`, so the admin sees
     * the runtime-effective value rather than the stale DB value.
     *
     * The raw `apiKey` value never reaches the DTO — only the boolean
     * presence flag — so the masked / source pair already in this DTO
     * remains the sole channel for surfacing the api-key state.
     */
    envOverrides: Readonly<{
      provider: boolean;
      model: boolean;
      apiKey: boolean;
      baseURL: boolean;
    }>;
  }>;
  /**
   * Per-purpose prompt projection. The map is keyed by `PromptPurpose` and
   * always contains an entry for every domain purpose — when there is no
   * override, the entry surfaces the built-in default with
   * `isOverridden: false` (Issue #218 ADR-001).
   */
  prompts: Readonly<Record<string, PromptDTO>>;
  /** Built-in defaults, identical to `BUILTIN_PROMPT_DEFAULTS`. */
  promptDefaults: Readonly<Record<string, PromptDefaultDTO>>;
  designTokens: Readonly<Record<string, string>>;
  registration: Readonly<{ open: boolean; closedReason: string | null }>;
  limits: Readonly<{
    maxUploadBytesPerDay: number;
    maxIngestionBytes: number;
    maxNoteBytes: number;
    maxExportArtifactBytes: number;
    maxShareLinksPerNote: number;
    editLockTtlSec: number;
    trashRetentionDays: number;
    /** Issue #158: per-note retention ceiling for `NoteRevision` rows. */
    maxNoteRevisionsPerNote: number;
  }>;
}>;

/**
 * Result projection of `AdminSettings.RebuildSearchIndex`. `processedCount`
 * is the number of active-note snapshots streamed into
 * `searchIndex.bulkRebuildFromSnapshots`; the two timestamps bracket the
 * full rebuild (including the per-page UoW reads) so the admin UI can
 * surface elapsed time without re-running the clock client-side.
 */
export type RebuildSearchIndexResultDTO = Readonly<{
  processedCount: number;
  startedAt: Instant;
  finishedAt: Instant;
}>;

export function toRebuildSearchIndexResultDTO(result: {
  processedCount: number;
  startedAt: Date;
  finishedAt: Date;
}): RebuildSearchIndexResultDTO {
  return {
    processedCount: result.processedCount,
    startedAt: toInstant(result.startedAt),
    finishedAt: toInstant(result.finishedAt),
  };
}

/**
 * Result projection of `AdminSettings.ReencryptApiKey`.
 * `reencrypted` is `true` only when the stored db-source ciphertext was
 * actually rewritten under the current master key; `skipped` carries the
 * no-op reason otherwise (mutually exclusive with `reencrypted: true`).
 */
export type ReencryptApiKeyResultDTO = Readonly<{
  reencrypted: boolean;
  skipped: "not-db" | "already-new-key" | null;
}>;

export function toReencryptApiKeyResultDTO(result: {
  reencrypted: boolean;
  skipped: "not-db" | "already-new-key" | null;
}): ReencryptApiKeyResultDTO {
  return {
    reencrypted: result.reencrypted,
    skipped: result.skipped,
  };
}

/**
 * `apiKeyMasked` is materialised by the caller (usecase) so the
 * application layer can swap masking strategies without touching the
 * domain. Pass `null` when the source is `env` or no key is configured.
 *
 * `llmEnv` carries the runtime-effective env override values plus the
 * presence flags so the DTO can surface env-locked fields with the
 * current (env-derived) value rather than the stale DB value. Callers
 * that have no env state (legacy tests, fixtures) can pass
 * `llmEnv: null` to fall back to the DB value verbatim.
 */
export function toInstanceSettingsDTO(
  settings: InstanceSettings,
  apiKeyMasked: string | null,
  llmEnv: Readonly<{
    apiKey: string | null;
    provider: string | null;
    model: string | null;
    baseURL: string | null;
  }> | null,
): InstanceSettingsDTO {
  const prompts: Record<string, PromptDTO> = {};
  const promptDefaults: Record<string, PromptDefaultDTO> = {};
  for (const purpose of PromptPurpose.values) {
    const builtin = BUILTIN_PROMPT_DEFAULTS[purpose];
    promptDefaults[purpose] = {
      text: builtin.text,
      expectedVariables: [...builtin.expectedVariables],
    };
    const override = settings.prompts[purpose];
    if (override !== undefined) {
      prompts[purpose] = {
        text: override.text,
        expectedVariables: [...override.expectedVariables],
        isOverridden: true,
      };
    } else {
      prompts[purpose] = {
        text: builtin.text,
        expectedVariables: [...builtin.expectedVariables],
        isOverridden: false,
      };
    }
  }
  const designTokens: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings.designTokens.tokens)) {
    designTokens[key] = value;
  }
  const envOverrides = {
    provider: llmEnv !== null && llmEnv.provider !== null,
    model: llmEnv !== null && llmEnv.model !== null,
    apiKey: llmEnv !== null && llmEnv.apiKey !== null,
    baseURL: llmEnv !== null && llmEnv.baseURL !== null,
  };
  // env-locked fields surface the runtime-effective value rather than the
  // stale DB value (Issue #143 ADR-003). `provider` is narrowed back to
  // `LLMProviderName` defensively — validated by `createLLMProvider`'s
  // `default: throw` at DI bootstrap, so any unrecognized value would have
  // already aborted container construction before reaching this DTO.
  const provider = (
    envOverrides.provider && llmEnv !== null && llmEnv.provider !== null
      ? llmEnv.provider
      : settings.llm.provider
  ) as LLMProviderName;
  const model =
    envOverrides.model && llmEnv !== null && llmEnv.model !== null
      ? llmEnv.model
      : settings.llm.model;
  const baseURL =
    envOverrides.baseURL && llmEnv !== null && llmEnv.baseURL !== null
      ? llmEnv.baseURL
      : settings.llm.baseURL;
  return {
    llm: {
      provider,
      model,
      baseURL,
      apiKeySource: settings.llm.apiKeySource,
      apiKeyMasked: envOverrides.apiKey ? null : apiKeyMasked,
      envOverrides,
    },
    prompts,
    promptDefaults,
    designTokens,
    registration: {
      open: settings.registration.open,
      closedReason: settings.registration.closedReason,
    },
    limits: {
      maxUploadBytesPerDay: settings.limits.maxUploadBytesPerDay,
      maxIngestionBytes: settings.limits.maxIngestionBytes,
      maxNoteBytes: settings.limits.maxNoteBytes,
      maxExportArtifactBytes: settings.limits.maxExportArtifactBytes,
      maxShareLinksPerNote: settings.limits.maxShareLinksPerNote,
      editLockTtlSec: settings.limits.editLockTtlSec,
      trashRetentionDays: settings.limits.trashRetentionDays,
      maxNoteRevisionsPerNote: settings.limits.maxNoteRevisionsPerNote,
    },
  };
}
