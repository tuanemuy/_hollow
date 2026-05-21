import { BusinessRuleError } from "@/core/domain/error";
import { IngestionErrorCode } from "@/core/domain/ingestion/errorCode";
import {
  type PDFExtractInput,
  type PDFExtractor,
  type PDFExtractResult,
  PDFParseError,
} from "@/core/domain/ingestion/ports/pdfExtractor";
import {
  type AnthropicSharedConfig,
  arrayBufferToBase64,
  callAnthropicMessages,
} from "./anthropicMessagesClient";

// Anthropic document content blocks cap each request body at ~32MB.
// Reject larger PDFs up front so the worker does not waste a round-trip
// on an Anthropic-side 413. Limit applies to raw file bytes (not the
// base64-encoded payload).
const MAX_PDF_BYTES = 32 * 1024 * 1024;

// PDF transcription can be much longer than typical LLM completions —
// give the model headroom beyond the LLM-default 4096-token ceiling.
const DEFAULT_PDF_MAX_TOKENS = 16_384;

const PDF_SYSTEM_PROMPT =
  "Extract the full text content of the PDF document verbatim, preserving paragraph order and line breaks. Output only the extracted text, without commentary, page numbers, headers, or footers. If the PDF has no readable text, return an empty string.";

const pdfErrorMapper = {
  rateLimit: (message: string, cause?: unknown) =>
    new PDFParseError(message, cause),
  unavailable: (message: string, cause?: unknown) =>
    new PDFParseError(message, cause),
  timeout: (message: string, cause?: unknown) =>
    new PDFParseError(message, cause),
  quota: (message: string, cause?: unknown) =>
    new PDFParseError(message, cause),
} as const;

/**
 * Anthropic Messages API adapter for {@link PDFExtractor}.
 *
 * Sends the raw PDF bytes as a `document` content block and asks the
 * model for verbatim text. Anthropic's document handling subsumes
 * textual / scanned distinction internally, so this adapter always
 * returns `{ textual: true, text, pageImages: [] }` (see ADR-001 of
 * Issue #113). `runIngestionJob.extractText` then uses `text` directly
 * when non-empty and falls into a dead `pageImages: []` OCR loop when
 * empty — both branches end with the LLM structuring step.
 *
 * All provider-side failures are collapsed into `PDFParseError` per
 * the port contract.
 */
export class AnthropicPDFExtractor implements PDFExtractor {
  private readonly config: AnthropicSharedConfig;

  constructor(config: AnthropicSharedConfig) {
    if (config.apiKey.length === 0) {
      throw new Error("AnthropicPDFExtractor: apiKey is empty");
    }
    if (config.model.length === 0) {
      throw new Error("AnthropicPDFExtractor: model is empty");
    }
    this.config = {
      ...config,
      maxTokens: config.maxTokens ?? DEFAULT_PDF_MAX_TOKENS,
    };
  }

  async extract(input: PDFExtractInput): Promise<PDFExtractResult> {
    if (input.bytes.byteLength > MAX_PDF_BYTES) {
      throw new PDFParseError(
        `pdf_too_large: ${input.bytes.byteLength} bytes (max ${MAX_PDF_BYTES})`,
      );
    }
    const data = arrayBufferToBase64(input.bytes);
    const text = await callAnthropicMessages(
      this.config,
      PDF_SYSTEM_PROMPT,
      [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data,
          },
        },
      ],
      pdfErrorMapper,
    );
    return {
      textual: true,
      text,
      pageImages: [],
    };
  }
}

/**
 * MVP PDF extractor.
 *
 * Textual and scanned PDF ingestion are both out of scope for the MVP:
 * the production adapter would wrap a PDF parsing library (pdf.js /
 * pdfium / etc.) to distinguish textual from scanned PDFs, but no such
 * backend is wired in this build. The usecase layer surfaces the
 * resulting `BusinessRuleError` as a non-retryable "feature not
 * available yet" so the ingestion job transitions to `failed` with a
 * clear error code rather than burning worker retries.
 *
 * MVP 内では pdfTextual / pdfScanned 形式は未対応。実 PDF パーサを
 * 接続する場合は本クラスを差し替える。
 */
export class StubPDFExtractor implements PDFExtractor {
  async extract(_input: PDFExtractInput): Promise<PDFExtractResult> {
    throw new BusinessRuleError(
      IngestionErrorCode.UnsupportedFormat,
      "pdf_extraction_not_implemented_in_mvp",
    );
  }
}
