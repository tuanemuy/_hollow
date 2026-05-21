import { BusinessRuleError } from "@/core/domain/error";
import { IngestionErrorCode } from "@/core/domain/ingestion/errorCode";
import {
  type OCRExtractInput,
  OCRFailureError,
  type OCRProvider,
} from "@/core/domain/ingestion/ports/ocrProvider";
import {
  type AnthropicSharedConfig,
  arrayBufferToBase64,
  callAnthropicMessages,
} from "./anthropicMessagesClient";

const SUPPORTED_IMAGE_MIMES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

// Anthropic Vision rejects images larger than ~5MB per image. Enforced
// here so an oversized upload fails fast with a port-native error
// instead of waiting for a 4xx round-trip. Limit applies to raw file
// bytes (not the base64-encoded payload).
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
 * Anthropic Messages API adapter for {@link OCRProvider}.
 *
 * Wraps a `vision` image content block on the Messages API. All
 * provider-side failures (rate limit / 5xx / 403 quota / timeout /
 * network) are collapsed into `OCRFailureError` per the port contract.
 * The pre-flight MIME / size guards short-circuit before fetch so the
 * worker does not burn an upstream round-trip on inputs Anthropic would
 * reject.
 *
 * Empty output is allowed by the port contract — when the model returns
 * no text content the adapter returns `""`. Callers (`runIngestionJob`)
 * treat the empty string as "no text detected" rather than a failure.
 */
export class AnthropicOCRProvider implements OCRProvider {
  private readonly config: AnthropicSharedConfig;

  constructor(config: AnthropicSharedConfig) {
    if (config.apiKey.length === 0) {
      throw new Error("AnthropicOCRProvider: apiKey is empty");
    }
    if (config.model.length === 0) {
      throw new Error("AnthropicOCRProvider: model is empty");
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
    return callAnthropicMessages(
      this.config,
      OCR_SYSTEM_PROMPT,
      [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: input.mime,
            data,
          },
        },
      ],
      ocrErrorMapper,
    );
  }
}

/**
 * MVP OCR adapter.
 *
 * Image / scanned-PDF ingestion is out of scope for the MVP per the
 * ingestion spec: the production adapter would wrap a hosted OCR
 * service, but no such backend is wired in this build. The usecase
 * layer is expected to surface the resulting `BusinessRuleError` as
 * a non-retryable "feature not available yet" so the ingestion job
 * transitions to `failed` with a clear error code rather than burning
 * worker retries.
 *
 * MVP 内では image / pdfScanned 形式は未対応。実 OCR をサポートする
 * 場合は本クラスを差し替える。
 */
export class StubOCRProvider implements OCRProvider {
  async extractText(_input: OCRExtractInput): Promise<string> {
    throw new BusinessRuleError(
      IngestionErrorCode.UnsupportedFormat,
      "ocr_not_implemented_in_mvp",
    );
  }
}
