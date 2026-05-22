import {
  type PDFExtractInput,
  type PDFExtractor,
  type PDFExtractResult,
  PDFParseError,
} from "@/core/domain/ingestion/ports/pdfExtractor";
import {
  arrayBufferToBase64,
  callOpenAIMessages,
  type OpenAISharedConfig,
} from "./messagesClient";

// OpenAI's Chat Completions API caps request bodies at ~25MB after the
// JSON envelope is built. Mirror the Anthropic adapter's 32MB ceiling
// but trim to 25MB to stay inside the documented OpenAI limit. The
// limit applies to raw file bytes (not the base64-encoded payload).
const MAX_PDF_BYTES = 25 * 1024 * 1024;

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
 * OpenAI Chat Completions adapter for {@link PDFExtractor}.
 *
 * Sends the raw PDF bytes as a `file` content block with a base64
 * `data:` URI and asks the model for verbatim text. PDF inputs are
 * only supported by `gpt-4o` family models — supplying a non-supporting
 * model results in a provider-side 4xx that is translated into
 * `PDFParseError` via {@link callOpenAIMessages}. Admin UI surfaces an
 * inline help message warning operators to pick a `gpt-4o*` model when
 * the OpenAI provider is selected.
 *
 * Returns `{ textual: true, text, pageImages: [] }` to match the
 * Anthropic adapter's contract (Issue #113 ADR-001). The ingestion
 * pipeline uses `text` directly when non-empty and falls through to a
 * dead `pageImages: []` OCR loop when empty — both branches end with
 * the LLM structuring step.
 */
export class OpenAIPDFExtractor implements PDFExtractor {
  private readonly config: OpenAISharedConfig;

  constructor(config: OpenAISharedConfig) {
    if (config.apiKey.length === 0) {
      throw new Error("OpenAIPDFExtractor: apiKey is empty");
    }
    if (config.model.length === 0) {
      throw new Error("OpenAIPDFExtractor: model is empty");
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
    const dataURI = `data:application/pdf;base64,${data}`;
    const text = await callOpenAIMessages(
      this.config,
      PDF_SYSTEM_PROMPT,
      [
        {
          type: "file",
          file: { filename: "document.pdf", file_data: dataURI },
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
