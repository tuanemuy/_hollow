import {
  type PDFExtractInput,
  type PDFExtractor,
  type PDFExtractResult,
  PDFParseError,
} from "@/core/domain/ingestion/ports/pdfExtractor";
import {
  arrayBufferToBase64,
  callGeminiGenerate,
  type GeminiSharedConfig,
} from "./messagesClient";

// Gemini accepts `application/pdf` natively via `inlineData`. Cap the
// raw PDF size at the same 32MB ceiling the Anthropic adapter uses so
// admins see consistent behaviour when switching providers. Limit
// applies to raw file bytes (not the base64-encoded payload).
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
 * Google Gemini `generateContent` adapter for {@link PDFExtractor}.
 *
 * Sends the raw PDF bytes as an `inlineData` part with
 * `mimeType: "application/pdf"` and asks the model for verbatim text.
 * Gemini's document handling subsumes the textual / scanned distinction
 * internally, so this adapter always returns
 * `{ textual: true, text, pageImages: [] }` (matching the Anthropic
 * adapter's contract — see Issue #113 ADR-001).
 *
 * All provider-side failures are collapsed into `PDFParseError` per
 * the port contract.
 */
export class GeminiPDFExtractor implements PDFExtractor {
  private readonly config: GeminiSharedConfig;

  constructor(config: GeminiSharedConfig) {
    if (config.apiKey.length === 0) {
      throw new Error("GeminiPDFExtractor: apiKey is empty");
    }
    if (config.model.length === 0) {
      throw new Error("GeminiPDFExtractor: model is empty");
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
    const text = await callGeminiGenerate(
      this.config,
      PDF_SYSTEM_PROMPT,
      [
        {
          inlineData: {
            mimeType: "application/pdf",
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
