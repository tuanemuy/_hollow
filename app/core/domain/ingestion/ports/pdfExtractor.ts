/**
 * PDF extraction port. The kind detector classifies every PDF as
 * `pdfTextual` optimistically; this port distinguishes textual PDFs
 * (where `extract` returns a non-empty `text`) from scanned PDFs
 * (`textual === false`) so the pipeline can route the latter through
 * OCR before LLM structuring.
 *
 * `pageImages` is populated for scanned PDFs only — textual PDFs
 * return an empty array so the OCR step is naturally skipped.
 */

export class PDFParseError extends Error {
  override readonly name = "PDFParseError";

  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
  }
}

export function isPDFParseError(error: unknown): error is PDFParseError {
  return error instanceof PDFParseError;
}

export type PDFExtractInput = Readonly<{
  bytes: ArrayBuffer;
}>;

export type PDFExtractResult = Readonly<{
  textual: boolean;
  text: string;
  pageImages: readonly ArrayBuffer[];
}>;

export interface PDFExtractor {
  extract(input: PDFExtractInput): Promise<PDFExtractResult>;
}
