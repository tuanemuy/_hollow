/**
 * Optical character recognition port. Used by the ingestion pipeline
 * for `image` and `pdfScanned` kinds to lift visual text out of the
 * source before handing it to the LLM for structuring.
 *
 * `OCRFailureError` covers any unrecoverable extraction failure (the
 * adapter has already exhausted its driver-level retries). The
 * application layer translates it into
 * `BusinessRuleError('llm_failure')` on the `IngestionJob` once the
 * worker decides not to retry further.
 */

export class OCRFailureError extends Error {
  override readonly name = "OCRFailureError";

  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
  }
}

export function isOCRFailureError(error: unknown): error is OCRFailureError {
  return error instanceof OCRFailureError;
}

export type OCRExtractInput = Readonly<{
  imageBytes: ArrayBuffer;
  mime: string;
}>;

export interface OCRProvider {
  /**
   * Extracts text from a single image. Returns an empty string when no
   * text was detected; only catastrophic failures surface as
   * `OCRFailureError`.
   */
  extractText(input: OCRExtractInput): Promise<string>;
}
