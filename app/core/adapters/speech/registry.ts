import type {
  SpeechProvider as SpeechProviderId,
  SpeechRecognitionConfig,
} from "@/core/domain/adminSettings/valueObject";
import type { SpeechRecognitionProvider } from "@/core/domain/ingestion/ports/speechRecognitionProvider";
// Dependency direction: the registry imports the concrete adapter *value*
// from the provider barrel; the barrel imports only the `SpeechAdapter`
// *type* from here (`import type`). This keeps the value graph acyclic —
// the same shape as `llm/registry.ts`.
import { openaiSpeechAdapter } from "../openai";

/**
 * Normalized configuration handed to a speech adapter factory. Speech has
 * no `baseURL` axis (Issue #701 ADR-003 — OpenAI's transcription endpoint is
 * fixed), so the config is just the api key + model.
 */
export type SpeechAdapterConfig = Readonly<{
  apiKey: string;
  model: string;
}>;

/**
 * Unified ping outcome. The `error` field is present only on failure.
 */
export type SpeechPingResult = { ok: boolean; error?: string };

/**
 * A single speech provider's contribution to the registry: a factory for the
 * `SpeechRecognitionProvider` port plus a connectivity ping. Each speech
 * provider barrel exports one of these (currently only OpenAI).
 */
export type SpeechAdapter = Readonly<{
  create: (c: SpeechAdapterConfig) => SpeechRecognitionProvider;
  ping: (
    cfg: SpeechRecognitionConfig,
    apiKey: string,
    timeoutMs: number,
  ) => Promise<SpeechPingResult>;
}>;

/**
 * Single source of truth mapping each {@link SpeechProviderId} to its
 * adapter. The `Record<SpeechProviderId, SpeechAdapter>` annotation makes
 * provider coverage a compile-time guarantee: adding a member to
 * `SPEECH_PROVIDERS` without a matching entry here is a type error.
 */
export const speechProviderRegistry: Record<SpeechProviderId, SpeechAdapter> = {
  openai: openaiSpeechAdapter,
};

/**
 * Look a speech adapter up by a runtime provider string (env / DB origin).
 * Returns `undefined` for an unregistered provider so callers can surface
 * the typo at the DI boundary rather than failing later at first use.
 */
export function lookupSpeechAdapter(
  provider: string,
): SpeechAdapter | undefined {
  return (speechProviderRegistry as Record<string, SpeechAdapter>)[provider];
}
