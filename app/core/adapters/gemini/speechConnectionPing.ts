import { type GeminiPingResult, pingGemini } from "./connectionPing";

/**
 * Liveness probe for the Gemini speech configuration. Speech reuses the LLM
 * probe verbatim — a minimal credentialed `generateContent` that confirms
 * authentication + model existence in one round-trip (ADR-002). This thin
 * wrapper exists only so the Gemini speech adapter keeps the same
 * `speechConnectionPing.ts` file layout as the deepgram / openai speech
 * adapters; it adds no logic of its own. A passing probe does NOT guarantee the
 * model accepts audio `inlineData` (that is covered by the live-file check).
 */
export type GeminiSpeechPingConfig = Readonly<{
  apiKey: string;
  model: string;
  timeoutMs?: number;
}>;

export function pingGeminiSpeech(
  config: GeminiSpeechPingConfig,
): Promise<GeminiPingResult> {
  return pingGemini(config);
}
