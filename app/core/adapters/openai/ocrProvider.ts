import {
  type OCRExtractInput,
  OCRFailureError,
  type OCRProvider,
} from "@/core/domain/ingestion/ports/ocrProvider";
import {
  arrayBufferToBase64,
  callOpenAIMessages,
  type OpenAISharedConfig,
} from "./messagesClient";

const SUPPORTED_IMAGE_MIMES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

// OpenAI's Vision endpoint accepts image inputs up to ~20MB per image
// (documented limit). Mirror the Anthropic adapter's 5MB ceiling so
// the worker's pre-flight contract stays uniform across providers and
// oversized uploads fail fast with a port-native error rather than
// burning a round-trip on a provider-side 4xx.
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
 * OpenAI Vision adapter for {@link OCRProvider}.
 *
 * Sends a `image_url` content block with a base64 `data:` URI on the
 * Chat Completions endpoint. All provider-side failures (rate limit /
 * 5xx / 401 / 403 / timeout / network) are collapsed into
 * `OCRFailureError` per the port contract. The pre-flight MIME / size
 * guards short-circuit before fetch so the worker does not burn an
 * upstream round-trip on inputs that would be rejected.
 *
 * Empty output is allowed by the port contract — when the model
 * returns no assistant content the adapter returns `""`.
 */
export class OpenAIOCRProvider implements OCRProvider {
  private readonly config: OpenAISharedConfig;

  constructor(config: OpenAISharedConfig) {
    if (config.apiKey.length === 0) {
      throw new Error("OpenAIOCRProvider: apiKey is empty");
    }
    if (config.model.length === 0) {
      throw new Error("OpenAIOCRProvider: model is empty");
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
    const dataURI = `data:${input.mime};base64,${data}`;
    return callOpenAIMessages(
      this.config,
      OCR_SYSTEM_PROMPT,
      [
        {
          type: "image_url",
          image_url: { url: dataURI },
        },
      ],
      ocrErrorMapper,
    );
  }
}
