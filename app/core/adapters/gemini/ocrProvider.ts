import {
  type OCRExtractInput,
  OCRFailureError,
  type OCRProvider,
} from "@/core/domain/ingestion/ports/ocrProvider";
import {
  arrayBufferToBase64,
  callGeminiGenerate,
  type GeminiSharedConfig,
} from "./messagesClient";

// Gemini's `inlineData` part accepts the same image MIME types the
// Anthropic adapter supports. Keeping the supported set in sync avoids
// surprising behaviour differences when admins swap providers.
const SUPPORTED_IMAGE_MIMES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

// Gemini's `inlineData` part is documented to allow up to ~20MB per
// request, but matching Anthropic's 5MB ceiling keeps behaviour
// consistent across providers and avoids surprising failure modes when
// admins toggle between adapters. Limit applies to raw file bytes
// (not the base64-encoded payload).
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Allow OCR responses to fully expand without hitting the LLM-default
// 4096-token ceiling. Plain-text dumps of dense images can easily run
// to several thousand tokens.
const DEFAULT_OCR_MAX_TOKENS = 16_384;

const OCR_SYSTEM_PROMPT =
  "You are an OCR engine. Extract all visible text from the image verbatim. Preserve line breaks. If no text is present, return an empty string. Do not add commentary.";

const ocrErrorMapper = {
  rateLimit: (message: string, cause?: unknown) =>
    new OCRFailureError(message, cause),
  unavailable: (message: string, cause?: unknown) =>
    new OCRFailureError(message, cause),
  timeout: (message: string, cause?: unknown) =>
    new OCRFailureError(message, cause),
  quota: (message: string, cause?: unknown) =>
    new OCRFailureError(message, cause),
} as const;

/**
 * Google Gemini `generateContent` adapter for {@link OCRProvider}.
 *
 * Wraps an `inlineData` image part on the generateContent API. All
 * provider-side failures (rate limit / 5xx / 401-403 quota / timeout /
 * network) are collapsed into `OCRFailureError` per the port contract.
 * The pre-flight MIME / size guards short-circuit before fetch so the
 * worker does not burn an upstream round-trip on inputs Gemini would
 * reject.
 *
 * Empty output is allowed by the port contract — when the model returns
 * no text content the adapter returns `""`. Callers (`runIngestionJob`)
 * treat the empty string as "no text detected" rather than a failure.
 */
export class GeminiOCRProvider implements OCRProvider {
  private readonly config: GeminiSharedConfig;

  constructor(config: GeminiSharedConfig) {
    if (config.apiKey.length === 0) {
      throw new Error("GeminiOCRProvider: apiKey is empty");
    }
    if (config.model.length === 0) {
      throw new Error("GeminiOCRProvider: model is empty");
    }
    this.config = {
      ...config,
      maxTokens: config.maxTokens ?? DEFAULT_OCR_MAX_TOKENS,
    };
  }

  async extractText(input: OCRExtractInput): Promise<string> {
    if (!SUPPORTED_IMAGE_MIMES.has(input.mime)) {
      throw new OCRFailureError(`unsupported_image_mime: ${input.mime}`);
    }
    if (input.imageBytes.byteLength > MAX_IMAGE_BYTES) {
      throw new OCRFailureError(
        `image_too_large: ${input.imageBytes.byteLength} bytes (max ${MAX_IMAGE_BYTES})`,
      );
    }
    const data = arrayBufferToBase64(input.imageBytes);
    return callGeminiGenerate(
      this.config,
      OCR_SYSTEM_PROMPT,
      [
        {
          inlineData: {
            mimeType: input.mime,
            data,
          },
        },
      ],
      ocrErrorMapper,
    );
  }
}
