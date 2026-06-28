import {
  SpeechFailureError,
  type SpeechRecognitionProvider,
  type SpeechTranscribeInput,
} from "@/core/domain/ingestion/ports/speechRecognitionProvider";
import {
  arrayBufferToBase64,
  callGeminiGenerate,
  type GeminiSharedConfig,
} from "./messagesClient";

/**
 * Configuration for {@link GeminiSpeechRecognitionProvider}. The registry hands
 * a {@link SpeechAdapterConfig} of `{ apiKey, model }`; the timeout / token
 * ceiling are set internally by the constructor (not part of the registry
 * config), so they default to the speech-appropriate values rather than the
 * conservative LLM-mode defaults in `messagesClient.ts`.
 */
export type GeminiSpeechConfig = Readonly<{
  /** Google AI Studio API key. Sourced from env or DB ciphertext. */
  apiKey: string;
  /** Gemini model id (e.g. `gemini-2.5-flash`). */
  model: string;
  /** Optional override for the Gemini API host (used only by tests). */
  endpoint?: string;
  /** Wall-clock budget per request in milliseconds. */
  timeoutMs?: number;
}>;

const DEFAULT_TIMEOUT_MS = 120_000;
// `callGeminiGenerate`'s default is 4096 (LLM-mode). A verbatim transcript of a
// multi-minute recording easily exceeds that, so the speech adapter overrides
// to 16384 (same ceiling OCR / PDF use) to avoid truncating the tail.
const DEFAULT_MAX_TOKENS = 16_384;

// Gemini's `inlineData` ceiling is the *total request size* (~20MB), and the
// audio is base64-encoded into the JSON body (~33% inflation), so the guard is
// evaluated against the *encoded* audio size. The ceiling is set below 20MB to
// reserve headroom for the non-audio bytes that also count toward the total
// request: the JSON envelope (`contents` / `inlineData` keys) and the
// `systemInstruction` prompt — and to stay under Gemini's decimal ~20,000,000
// limit rather than 20 MiB (= 20,971,520). Without that headroom a recording
// that base64-inflates to just under 20 MiB would pass this guard only for
// Gemini to reject it with a 4xx, which `runIngestionJob` then swallows into an
// empty transcript. Oversize is rejected here rather than burning a round-trip
// (symmetric with the OpenAI adapter's 25 MiB pre-flight).
const MAX_REQUEST_BYTES = 18 * 1024 * 1024;

const TRANSCRIBE_SYSTEM_PROMPT =
  "You are a speech-to-text engine. Transcribe the audio verbatim in its original spoken language. Do not add speaker labels, timestamps, or commentary. If no speech is present, return an empty string.";

const speechErrorMapper = {
  rateLimit: (message: string, cause?: unknown) =>
    new SpeechFailureError(message, cause),
  unavailable: (message: string, cause?: unknown) =>
    new SpeechFailureError(message, cause),
  timeout: (message: string, cause?: unknown) =>
    new SpeechFailureError(message, cause),
  quota: (message: string, cause?: unknown) =>
    new SpeechFailureError(message, cause),
} as const;

/**
 * Weaves the port `locale` into the system prompt as a soft language hint. An
 * empty locale leaves the base prompt untouched (the model infers the language).
 */
function buildSystemPrompt(locale: string): string {
  const trimmed = locale.trim();
  if (trimmed.length === 0) return TRANSCRIBE_SYSTEM_PROMPT;
  return `${TRANSCRIBE_SYSTEM_PROMPT} The audio is expected to be in the "${trimmed}" locale.`;
}

/**
 * Google Gemini `generateContent` adapter for
 * {@link SpeechRecognitionProvider}. Sends the audio as an `inlineData`
 * (base64) part with a transcription system prompt, reusing the shared
 * `callGeminiGenerate` plumbing — so timeout handling, `x-goog-api-key`
 * authentication, the workerd `AbortError`-as-timeout guard, and the
 * empty-parts → `""` contract all come for free and stay symmetric with the
 * OCR / PDF adapters.
 *
 * Contract (per `SpeechRecognitionProvider`):
 * - Returns the transcript string; no detected speech (empty parts) returns `""`.
 * - Every catastrophic failure — empty key, oversize, non-2xx, timeout,
 *   transport, malformed body — surfaces as `SpeechFailureError` (all four
 *   `callGeminiGenerate` error categories are collapsed by `speechErrorMapper`).
 *
 * No MIME allowlist: webm/opus acceptance is exactly what the live-file
 * verification is meant to probe, so the adapter does not pre-reject formats —
 * an unsupported format surfaces as a Gemini 4xx → `SpeechFailureError`.
 */
export class GeminiSpeechRecognitionProvider
  implements SpeechRecognitionProvider
{
  private readonly config: GeminiSharedConfig;

  constructor(config: GeminiSpeechConfig) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model,
      ...(config.endpoint !== undefined ? { endpoint: config.endpoint } : {}),
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxTokens: DEFAULT_MAX_TOKENS,
    };
  }

  async transcribe(input: SpeechTranscribeInput): Promise<string> {
    if (this.config.apiKey.trim().length === 0) {
      throw new SpeechFailureError("Gemini api key is empty");
    }

    // base64 expands raw bytes by ~4/3; evaluate the encoded size against the
    // total-request ceiling without allocating the encoded string first.
    const estimatedEncodedBytes =
      Math.ceil(input.audioBytes.byteLength / 3) * 4;
    if (estimatedEncodedBytes > MAX_REQUEST_BYTES) {
      throw new SpeechFailureError(
        `audio_too_large: ${input.audioBytes.byteLength} bytes (base64 ~${estimatedEncodedBytes}, max ${MAX_REQUEST_BYTES})`,
      );
    }

    const data = arrayBufferToBase64(input.audioBytes);
    return callGeminiGenerate(
      this.config,
      buildSystemPrompt(input.locale),
      [
        {
          inlineData: {
            mimeType: input.mime,
            data,
          },
        },
      ],
      speechErrorMapper,
    );
  }
}
