import type { InstanceSettings } from "@/core/domain/adminSettings/entity";

/**
 * Per-purpose prompt template projection. `expectedVariables` is mirrored
 * verbatim from the domain VO so the admin UI can render the
 * placeholder hints alongside the editable text.
 */
export type PromptDTO = Readonly<{
  text: string;
  expectedVariables: readonly string[];
}>;

export type InstanceSettingsDTO = Readonly<{
  llm: Readonly<{
    provider: "anthropic";
    model: string;
    apiKeySource: "env" | "db";
    /**
     * Masked representation of the configured API key (e.g. `••••abc1`).
     * Always `null` when `apiKeySource === 'env'`; the masked digest is
     * supplied by the caller because the raw ciphertext never leaves the
     * adapter boundary.
     */
    apiKeyMasked: string | null;
  }>;
  prompts: Readonly<Record<string, PromptDTO>>;
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
  }>;
}>;

/**
 * `apiKeyMasked` is materialised by the caller (usecase) so the
 * application layer can swap masking strategies without touching the
 * domain. Pass `null` when the source is `env` or no key is configured.
 */
export function toInstanceSettingsDTO(
  settings: InstanceSettings,
  apiKeyMasked: string | null,
): InstanceSettingsDTO {
  const prompts: Record<string, PromptDTO> = {};
  for (const [purpose, template] of Object.entries(settings.prompts)) {
    prompts[purpose] = {
      text: template.text,
      expectedVariables: [...template.expectedVariables],
    };
  }
  const designTokens: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings.designTokens.tokens)) {
    designTokens[key] = value;
  }
  return {
    llm: {
      provider: settings.llm.provider,
      model: settings.llm.model,
      apiKeySource: settings.llm.apiKeySource,
      apiKeyMasked,
    },
    prompts,
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
    },
  };
}
